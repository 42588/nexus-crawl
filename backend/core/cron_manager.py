import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from core.logger import log_queue
from datetime import datetime, timezone

scheduler = AsyncIOScheduler()
DAEMON_WORKERS = []

async def scheduled_pipeline_run(nodes, edges, node_id, is_queue=False):
    if not is_queue:
        await log_queue.put({
            "type": "log",
            "level": "定时",
            "color": "\x1b[1;36m",
            "message": "⏰ 定时节拍器触发：后台自动调度执行...",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    
    from core.scheduler import run_pipeline_chain
    from core.context import PipelineContext
    try:
        context = PipelineContext()
        asyncio.create_task(run_pipeline_chain(nodes, edges, context, start_node_id=node_id))
    except Exception as e:
        await log_queue.put({
            "type": "log",
            "level": "ERROR",
            "color": "\x1b[1;31m",
            "message": f"后台触发拓扑解析失败: {str(e)}",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

async def queue_daemon_loop(nodes, edges, node_id, queue_name):
    from core.scheduler import run_pipeline_chain
    from core.context import PipelineContext, GLOBAL_TASK_QUEUES
    import random
    
    if queue_name not in GLOBAL_TASK_QUEUES:
        GLOBAL_TASK_QUEUES[queue_name] = asyncio.Queue()
    q = GLOBAL_TASK_QUEUES[queue_name]

    while True:
        try:
            payload = await q.get()
            context = PipelineContext(trace_id=f"W-{random.randint(1000, 9999)}")
            
            # Handle specialized payload with inherited context
            if isinstance(payload, dict) and payload.get("__is_subtask_payload"):
                data = payload.get("data")
                parent_context = payload.get("parent_context")
                base_url = payload.get("parent_url")
                
                context.extracted_data["_parent_url"] = base_url
                
                if parent_context:
                    context.session_cookies = parent_context.get("cookies", {})
                    context.headers = parent_context.get("headers", {})
                    context.proxy = parent_context.get("proxy")
                    # Optionally inherit parent data
                    context.extracted_data.update(parent_context.get("extracted_data", {}))
                
                payload = data # Unwrap
            
            if isinstance(payload, dict):
                context.extracted_data.update(payload)
                if "target" in payload:
                    context.url = payload["target"]
                elif "url" in payload:
                    context.url = payload["url"]
                elif "link" in payload:
                    context.url = payload["link"]
                elif "href" in payload:
                    context.url = payload["href"]
            elif isinstance(payload, str):
                context.url = payload

            if hasattr(context, "url") and context.url and not context.url.startswith("http"):
                parent_url = context.extracted_data.get("_parent_url")
                
                asyncio.create_task(log_queue.put({
                    "type": "log", "level": "DEBUG", "color": "\x1b[36m",
                    "message": f"[Trace: {context.trace_id}] URL DEBUG: current={context.url}, parent={parent_url}",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }))
                
                if parent_url:
                    from urllib.parse import urljoin
                    context.url = urljoin(parent_url, context.url)
                
            context.extracted_data["is_daemon_worker"] = True
            
            try:
                await run_pipeline_chain(nodes, edges, context, start_node_id=node_id)
            except Exception:
                pass
            finally:
                q.task_done()
        except asyncio.CancelledError:
            break
        except Exception:
            await asyncio.sleep(1)

def update_cron_jobs(nodes, edges):
    scheduler.remove_all_jobs()
    
    for t in DAEMON_WORKERS:
        t.cancel()
    DAEMON_WORKERS.clear()
    
    time_nodes = [n for n in nodes if n.get('data', {}).get('type') == '触发']
    
    # 过滤出有关联边的触发器（避免孤岛节点不停触发）
    valid_time_nodes = []
    for n in time_nodes:
        n_id = n['id']
        has_outgoing = any(e['source'] == n_id for e in edges)
        if has_outgoing:
            valid_time_nodes.append(n)
            
    jobs_added = 0
    for n in valid_time_nodes:
        label = n.get('data', {}).get('label', '')
        node_id = n['id']
        
        if "定时节拍器" in label:
            cron_expr = n.get('data', {}).get('config', {}).get('cron', '')
            if cron_expr:
                try:
                    scheduler.add_job(
                        scheduled_pipeline_run,
                        CronTrigger.from_crontab(cron_expr),
                        args=[nodes, edges, node_id, False]
                    )
                    jobs_added += 1
                except Exception as e:
                    asyncio.create_task(log_queue.put({
                        "type": "log", "level": "ERROR", "color": "\x1b[1;31m",
                        "message": f"非法 Cron 表达式 `{cron_expr}`，已忽略。",
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }))
        elif "任务调度队列" in label:
            queue_name = n.get('data', {}).get('config', {}).get('queueName', 'default_queue')
            
            # Find downstream concurrency
            # We trace from node_id, if we find "脉冲并发请求", we get its maxWorkers.
            concurrency = 1
            children = [e['target'] for e in edges if e['source'] == node_id]
            for child_id in children:
                child_node = next((node for node in nodes if node['id'] == child_id), None)
                if child_node and child_node.get('data', {}).get('label') == '脉冲并发请求':
                    c = child_node.get('data', {}).get('config', {}).get('maxWorkers', 10)
                    concurrency = int(c) if str(c).isdigit() else 10
                    break
            
            from core.logger import log_queue
            asyncio.create_task(log_queue.put({
                "type": "log", "level": "系统", "color": "\x1b[36m",
                "message": f"🚀 队列守护池 [{queue_name}] 启动！工作线程数: {concurrency}",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }))
            
            for _ in range(concurrency):
                task = asyncio.create_task(queue_daemon_loop(nodes, edges, node_id, queue_name))
                DAEMON_WORKERS.append(task)
            
            jobs_added += 1
            
    return jobs_added
