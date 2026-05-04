import asyncio
import sys
import os
import warnings

warnings.filterwarnings("ignore", category=DeprecationWarning)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    # Monkey-patch WindowsSelectorEventLoopPolicy to prevent Uvicorn from overriding the ProactorEventLoop
    # Playwright requires ProactorEventLoop to support subprocesses on Windows.
    asyncio.WindowsSelectorEventLoopPolicy = getattr(asyncio, "WindowsProactorEventLoopPolicy", getattr(asyncio, "WindowsSelectorEventLoopPolicy", None))

import random
from datetime import datetime, timezone

# Helper to suppress datetime warning anywhere
def iso_now():
    return datetime.now(timezone.utc).isoformat()


# Load .env manually to avoid extra dependencies
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
if os.path.exists(env_path):
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                os.environ[k.strip()] = v.strip().strip('"').strip("'")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import ORJSONResponse
from fastapi.middleware.cors import CORSMiddleware
from core.context import FlowData, PipelineContext
from core.metrics import GLOBAL_METRICS
from core.scheduler import run_pipeline_chain
from core.logger import manager, log_queue
from core.cron_manager import scheduler, update_cron_jobs
import orjson
import uuid
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan_handler(app: FastAPI):
    asyncio.create_task(log_worker())
    asyncio.create_task(telemetry_worker())
    scheduler.start()
    yield

app = FastAPI(title="Arachne V-Combat Engine", default_response_class=ORJSONResponse, lifespan=lifespan_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 架构优化：执行态注册表 ---
# 记录所有活跃的 pipeline 执行任务，便于状态同步和精准取消
ACTIVE_TASKS = {}
# 记录当前执行引擎的总体开关状态
ENGINE_STATE = {"is_running": False}

async def notify_engine_status():
    """实时广播引擎状态给前端，解决前后端状态脱轨问题"""
    is_running = len(ACTIVE_TASKS) > 0 or len(scheduler.get_jobs()) > 0
    ENGINE_STATE["is_running"] = is_running
    await manager.broadcast({
        "type": "engine_status",
        "isRunning": is_running,
        "activeCount": len(ACTIVE_TASKS)
    })

async def pipeline_wrapper(nodes, edges, context, task_id):
    """包装原始执行流，实现完整的生命周期管理（执行完毕后自动清理并同步状态）"""
    try:
        await run_pipeline_chain(nodes, edges, context)
    except asyncio.CancelledError:
        await log_queue.put({
            "type": "log", "level": "系统", "color": "\x1b[31m",
            "message": f"🚫 任务 {task_id} 被中途强行阻断取消。", "timestamp": iso_now()
        })
    except Exception as e:
         await log_queue.put({
            "type": "log", "level": "错误", "color": "\x1b[31m",
            "message": f"任务执行崩溃: {str(e)}", "timestamp": iso_now()
        })
    finally:
        if task_id in ACTIVE_TASKS:
            del ACTIVE_TASKS[task_id]
        await notify_engine_status()

async def log_worker():
    """Reads logs from asyncio.Queue and broadcasts them in batches"""
    batch = []
    while True:
        try:
            # 等待最多 100ms 获取新日志
            log_entry = await asyncio.wait_for(log_queue.get(), timeout=0.1)
            batch.append(log_entry)
            log_queue.task_done()
            
            # 如果批次积累较多，或者队列为空了，直接发送
            if len(batch) >= 50 or log_queue.empty():
                await manager.broadcast({"type": "log_batch", "logs": batch})
                batch = []
        except asyncio.TimeoutError:
            # 超时说明没有新日志，如果有积压的则发送
            if batch:
                await manager.broadcast({"type": "log_batch", "logs": batch})
                batch = []

async def telemetry_worker():
    """Generates telemetry data (throughput, evasion rates)"""
    while True:
        async with GLOBAL_METRICS.lock:
            throughput = GLOBAL_METRICS.current_throughput
            failures = GLOBAL_METRICS.current_evasion_failures
            
            total_req_interval = throughput + failures
            latency = 0
            if total_req_interval > 0:
                latency = int(GLOBAL_METRICS.total_latency / total_req_interval)
            active_proxies = len(GLOBAL_METRICS.active_proxies)
            captchas = GLOBAL_METRICS.captchas_bypassed
            current_captchas = GLOBAL_METRICS.current_captchas_bypassed
            geo_data = [{"name": k, "value": v} for k, v in GLOBAL_METRICS.geo_counts.items()]
            saved_chars = GLOBAL_METRICS.saved_characters
            
            GLOBAL_METRICS.current_throughput = 0
            GLOBAL_METRICS.current_evasion_failures = 0
            GLOBAL_METRICS.current_captchas_bypassed = 0
            GLOBAL_METRICS.total_latency = 0
            
        total = throughput + failures
        evasion_rate = 100.0 if total == 0 else round((throughput / total) * 100.0, 1)
        
        await manager.broadcast({
            "type": "telemetry",
            "throughput": throughput,
            "failures": failures,
            "bypassedWaf": current_captchas,
            "evasionRate": evasion_rate,
            "latency": latency,
            "activeProxies": active_proxies,
            "captchas": captchas,
            "geoData": geo_data,
            "savedCharacters": saved_chars,
            "sessionLlms": GLOBAL_METRICS.session_llm_calls,
            "sessionThroughput": GLOBAL_METRICS.session_throughput_total,
            "sessionBlocked": GLOBAL_METRICS.session_blocked_total,
            "sessionBypassed": GLOBAL_METRICS.session_bypassed_total,
            "sessionScraped": GLOBAL_METRICS.session_scraped_items,
            "timestamp": iso_now()
        })
        await asyncio.sleep(1)

@app.get("/api/stats")
async def get_stats():
    # Attempt to read stats from output.jsonl if it exists
    total_scraped = 0
    import os
    import sys
    try:
        if os.path.exists("./output.jsonl"):
            with open("./output.jsonl", "r", encoding="utf-8") as f:
                total_scraped = sum(1 for _ in f)
    except:
        pass
        
    return {
        "sessionScraped": GLOBAL_METRICS.session_scraped_items,
        "sessionBlocked": GLOBAL_METRICS.session_blocked_total,
        "sessionLlms": GLOBAL_METRICS.session_llm_calls,
        "totalScraped": total_scraped, 
        "totalBlocked": GLOBAL_METRICS.total_blocked,
        "llmTokens": GLOBAL_METRICS.llm_tokens,
        "sessionLlmTokens": GLOBAL_METRICS.session_llm_tokens,
        "savedCharacters": GLOBAL_METRICS.saved_characters,
        "recentItems": total_scraped,
        "system": {
            "os": os.name.upper(),
            "python": sys.version.split(" ")[0],
            "encoding": sys.getdefaultencoding().upper(),
            "port": os.getenv("PORT", "3000")
        }
    }

@app.post("/api/pipeline/start")
async def start_pipeline(data: FlowData):
    try:
        GLOBAL_METRICS.reset_session()
        # 1. 结构与参数萃取
        nodes = data.nodes
        edges = data.edges
        
        # 提取并更新定时任务
        jobs_added = update_cron_jobs(nodes, edges)
        cron_msg = f" (已装载 {jobs_added} 个定时调度)" if jobs_added > 0 else ""

        await log_queue.put({
            "type": "log", 
            "level": "系统", 
            "color": "\x1b[1;30m",
            "message": f"拓扑解析成功。共载入 {len(nodes)} 个算子节点，准备启动并发引擎。{cron_msg}",
            "timestamp": iso_now()
        })

        # 2. 初始化上下文
        context = PipelineContext()
        task_id = context.trace_id

        # 启动主执行流时，将其放入 ACTIVE_TASKS
        task = asyncio.create_task(pipeline_wrapper(nodes, edges, context, task_id))
        ACTIVE_TASKS[task_id] = task
        
        # 异步通知前端状态更新
        asyncio.create_task(notify_engine_status())
        
        return {"status": "success", "message": "流水线拓扑已提交并启动执行", "task_id": task_id}
        
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/pipeline/stop")
async def stop_pipeline():
    try:
        from core.cron_manager import scheduler, DAEMON_WORKERS
        scheduler.remove_all_jobs()
        for t in DAEMON_WORKERS:
            t.cancel()
        DAEMON_WORKERS.clear()
        
        # 强制终止所有处于活跃状态的 asyncio Task
        cancelled_count = 0
        for task_id, task in list(ACTIVE_TASKS.items()):
            task.cancel()
            cancelled_count += 1
            
        from nodes.action import GLOBAL_BROWSER_POOL
        await GLOBAL_BROWSER_POOL.close_all()

        await log_queue.put({
            "type": "log",
            "level": "系统",
            "color": "\x1b[1;33m",
            "message": f"⏹️ 引擎已接收到停止指令。清空了定时任务池，阻断了 {cancelled_count} 个高速狂奔的执行流，并释放了所有沙箱窗口。",
            "timestamp": iso_now()
        })
        
        asyncio.create_task(notify_engine_status())
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/pipeline/status")
async def get_pipeline_status():
    """供前端全页重载时拉取，同步执行态"""
    from core.cron_manager import scheduler, DAEMON_WORKERS
    is_running = len(ACTIVE_TASKS) > 0 or len(scheduler.get_jobs()) > 0 or len(DAEMON_WORKERS) > 0
    return {"isRunning": is_running, "activeCount": len(ACTIVE_TASKS) + len(DAEMON_WORKERS)}

from nodes.action import GLOBAL_BREAKPOINT_LOCKS, GLOBAL_BREAKPOINT_DATA

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    server_addr = websocket.headers.get("host", "unknown")
    print(f"WebSocket connection established. Connected to server: {server_addr}")
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = orjson.loads(data)
                
                # 如果是解除断点的指令
                if payload.get("type") == "resolve_breakpoint":
                    tid = payload.get("trace_id")
                    pid = payload.get("pipeline_id", tid)
                    # 确认该 Worker 确实处于冻结状态
                    if tid in GLOBAL_BREAKPOINT_LOCKS:
                        # 动态更新引擎拓扑图 (如果有)
                        if "nodes" in payload and "edges" in payload:
                            from core.scheduler import GLOBAL_PIPELINE_UPDATERS
                            updater = GLOBAL_PIPELINE_UPDATERS.get(pid)
                            print(f"WS received nodes and edges, updater exists: {updater is not None}, node count: {len(payload['nodes'])}")
                            if updater:
                                updater(payload["nodes"], payload["edges"])
                                from core.logger import log_queue
                                from datetime import datetime, timezone
                                import asyncio
                                asyncio.create_task(log_queue.put({
                                    "type": "log", "level": "系统", "color": "\\x1b[35m",
                                    "message": f"[Trace: {tid}] 断点释放，动态注入拓扑更新: Nodes {len(payload['nodes'])}, Edges {len(payload['edges'])}",
                                    "timestamp": datetime.now(timezone.utc).isoformat()
                                }))

                        # 写入指挥官指令
                        GLOBAL_BREAKPOINT_DATA[tid] = payload
                        # 咔嚓！解除锁定，让 async event.wait() 通过
                        GLOBAL_BREAKPOINT_LOCKS[tid].set()
            except Exception as parsing_error:
                print(f"Message parsing error or not handled: {parsing_error}")
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket 异常: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8085)
