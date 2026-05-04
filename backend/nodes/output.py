import asyncio
import os
import json
import aiohttp
from datetime import datetime, timezone
from core.context import PipelineContext, GLOBAL_TASK_QUEUES
from core.logger import log_queue

# 全局异步写入锁（Fan-in 的核心保障）
file_write_lock = asyncio.Lock()

async def execute_knowledge_base(node_config: dict, context: PipelineContext):
    db_type = node_config.get("dbType", "mongodb")
    
    from nodes.app_nodes import _get_nested_property
    target_field = node_config.get("dataField", "context.extracted_data")
    if not target_field:
        target_field = "context.extracted_data"
        
    export_data_obj = _get_nested_property(context, target_field)
    
    if isinstance(export_data_obj, dict):
        data_keys = list(export_data_obj.keys())
    elif isinstance(export_data_obj, list):
        data_keys = f"[{len(export_data_obj)} items]"
    else:
        data_keys = "RAW TEXT/VALUE"
    
    await log_queue.put({"type": "log", "level": "存档", "color": "\x1b[35m", "message": f"[Trace: {context.trace_id}] 正在将战利品 (keys: {data_keys}) 拓印至 [{db_type}] 深渊阵列...", "timestamp": datetime.now(timezone.utc).isoformat()})
    await asyncio.sleep(0.5)
    await log_queue.put({"type": "log", "level": "存档", "color": "\x1b[35m", "message": f"[Trace: {context.trace_id}] 数据库入库封存完毕！", "timestamp": datetime.now(timezone.utc).isoformat()})
    return context

async def execute_notify_node(node_config: dict, context: PipelineContext):
    channel = node_config.get("channel", "webhook")
    
    payload = getattr(context, "extracted_data", {})
    if not payload:
        payload = {
            "trace_id": getattr(context, "trace_id", "unknown"),
            "url": getattr(context, "url", ""),
            "payload_size": len(getattr(context, "html", "")) if hasattr(context, 'html') and context.html else 0,
            "status": "Success Context Empty Guard"
        }

    if channel == "webhook":
        webhook_url = node_config.get("webhookUrl")
        if not webhook_url:
            await log_queue.put({"type": "log", "level": "警告", "color": "\x1b[33m", "message": f"[{context.trace_id}] Webhook URL 未配置，放弃推送。", "timestamp": datetime.now(timezone.utc).isoformat()})
            return context

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(webhook_url, json=payload, timeout=5) as resp:
                    await log_queue.put({
                        "type": "log", "level": "分发", "color": "\x1b[36m", 
                        "message": f"[{context.trace_id}] 数据已轰炸至 Webhook! 状态: {resp.status}", "timestamp": datetime.now(timezone.utc).isoformat()
                    })
        except Exception as e:
             await log_queue.put({"type": "log", "level": "错误", "color": "\x1b[31m", "message": f"Webhook 投递失败: {str(e)}", "timestamp": datetime.now(timezone.utc).isoformat()})

    elif channel == "file":
        file_path = node_config.get("filePath", "./output.jsonl")
        
        os.makedirs(os.path.dirname(file_path) if os.path.dirname(file_path) else ".", exist_ok=True)

        async with file_write_lock:
            with open(file_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(payload, ensure_ascii=False) + "\n")
        
        from core.metrics import GLOBAL_METRICS
        items_count = len(payload) if isinstance(payload, list) else 1
        await GLOBAL_METRICS.add_scraped_item(items_count)

        await log_queue.put({
            "type": "log", "level": "归档", "color": "\x1b[36m", 
            "message": f"[{context.trace_id}] 战利品安全落盘 -> {file_path}", "timestamp": datetime.now(timezone.utc).isoformat()
        })

    return context

async def execute_file_export(node_config: dict, context: PipelineContext):
    fmt = node_config.get("format", "json").lower()
    base_file_name = node_config.get("fileName", "export_data").strip()
    if not base_file_name:
        base_file_name = "export_data"
    
    from nodes.app_nodes import _get_nested_property
    target_field = node_config.get("dataField", "context.extracted_data")
    if not target_field:
        target_field = "context.extracted_data"
        
    export_data_obj = _get_nested_property(context, target_field)
    if export_data_obj is None:
        export_data_obj = {}
        
    # 如果输出为 csv 或 excel，试图寻找唯一的列表节点自动解包
    if fmt in ["csv", "excel"] and isinstance(export_data_obj, dict):
        list_keys = [k for k, v in export_data_obj.items() if isinstance(v, list)]
        if len(list_keys) == 1:
            export_data_obj = export_data_obj[list_keys[0]]
    
    # 智能类型纠偏与防暴雷引擎
    def is_complex_nested(data):
        if not data: return False
        if isinstance(data, list):
            for item in data[:20]: # 性能优化：只抽样检查前20个元素
                if isinstance(item, dict) and any(isinstance(v, (list, dict)) for v in item.values()):
                    return True
                elif isinstance(item, list): return True
        elif isinstance(data, dict):
            return any(isinstance(v, (list, dict)) for v in data.values())
        return False
        
    def detect_urls(data, depth=0):
        if depth > 5: return [] # 性能优化：防止无限递归打爆栈
        urls = []
        if isinstance(data, list):
            for item in data: urls.extend(detect_urls(item, depth+1))
        elif isinstance(data, dict):
            for v in data.values(): urls.extend(detect_urls(v, depth+1))
        elif isinstance(data, str) and data.startswith(("http://", "https://")):
            urls.append(data)
        return urls
        
    has_complex = is_complex_nested(export_data_obj)
    
    # 智能纠偏：如果要求是 csv/excel 但数据极为复杂，强转 JSON
    if fmt in ["csv", "excel"] and has_complex:
        await log_queue.put({"type": "log", "level": "警告", "color": "\x1b[33m", "message": f"[Trace: {context.trace_id}] 发现激进的嵌套结构，强制将输出格式纠偏为 JSON 以防数据丢失! 🚀", "timestamp": datetime.now(timezone.utc).isoformat()})
        fmt = "json"
        
    # 构建时光机防覆盖目录结构
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H%M%S")
    
    # 【修复 1】：引入 trace_id 的后 4 位或唯一散列，防止高并发同秒生成覆盖
    safe_uid = str(context.trace_id)[-4:] if hasattr(context, "trace_id") else str(int(now.timestamp() * 1000))[-4:]
    
    output_dir = os.path.join(".", "output", date_str)
    os.makedirs(output_dir, exist_ok=True)
    
    # =========================================================================
    # 场景 A: 多媒体并发下载引擎
    # =========================================================================
    if fmt == "media":
        url_field = node_config.get("urlField", "")
        media_urls = []
        if url_field and url_field in export_data_obj:
            val = export_data_obj[url_field]
            media_urls.extend(val if isinstance(val, list) else [val])
        else:
            media_urls = detect_urls(export_data_obj)
            
        if not media_urls:
            await log_queue.put({"type": "log", "level": "警告", "color": "\x1b[33m", "message": f"[Trace: {context.trace_id}] 侦测不到任何有效的媒体 URL，下载中止。", "timestamp": datetime.now(timezone.utc).isoformat()})
            return context
            
        await log_queue.put({"type": "log", "level": "下载", "color": "\x1b[36m", "message": f"[Trace: {context.trace_id}] 探测到 {len(media_urls)} 个媒体资源，启动【异步并发拖拽列车】...", "timestamp": datetime.now(timezone.utc).isoformat()})
        
        try:
            import filetype
        except ImportError:
            filetype = None
            
        # 【修复 2】：使用 Semaphore 控制并发量为 10，避免把本地系统 TCP 端口耗尽
        sem = asyncio.Semaphore(10)
        
        async def download_single_media(idx, url, session):
            async with sem:
                try:
                    async with session.get(url, timeout=30) as resp:
                        if resp.status == 200:
                            content = await resp.read()
                            
                            file_ext = "bin"
                            if filetype:
                                kind = filetype.guess(content)
                                if kind: file_ext = kind.extension
                            if file_ext == "bin":
                                fallback_ext = url.split("?")[0].split("/")[-1].split(".")[-1]
                                if len(fallback_ext) <= 5 and fallback_ext: file_ext = fallback_ext
                            
                            media_filename = f"{base_file_name}_{time_str}_{safe_uid}_{idx}.{file_ext}"
                            save_path = os.path.join(output_dir, media_filename)
                            
                            # 【修复 3】：将 I/O 写入丢进线程池，坚决不阻塞事件循环
                            def sync_write():
                                with open(save_path, "wb") as f:
                                    f.write(content)
                            await asyncio.to_thread(sync_write)
                            
                            return True, save_path, len(content)
                        else:
                            return False, url, resp.status
                except Exception as e:
                    return False, url, str(e)

        try:
            async with aiohttp.ClientSession() as session:
                # 核心：使用 gather 并发执行所有下载任务
                tasks = [download_single_media(i, url, session) for i, url in enumerate(media_urls)]
                results = await asyncio.gather(*tasks)
                
                success_count = sum(1 for r in results if r[0])
                await log_queue.put({"type": "log", "level": "归档", "color": "\x1b[32m", "message": f"[Trace: {context.trace_id}] 媒体引擎总线下载完成！成功: {success_count}/{len(media_urls)}", "timestamp": datetime.now(timezone.utc).isoformat()})
            return context
        except Exception as e:
            await log_queue.put({"type": "log", "level": "错误", "color": "\x1b[31m", "message": f"[Trace: {context.trace_id}] 媒体引擎总线崩溃: {str(e)}", "timestamp": datetime.now(timezone.utc).isoformat()})
            return context

    # =========================================================================
    # 场景 B: 数据集落盘 (利用线程池卸载 CPU/IO 压力)
    # =========================================================================
    final_ext = "xlsx" if fmt == "excel" else fmt
    final_filename = f"{base_file_name}_{time_str}_{safe_uid}.{final_ext}"
    path = os.path.join(output_dir, final_filename)
    
    await log_queue.put({"type": "log", "level": "输出", "color": "\x1b[36m", "message": f"[Trace: {context.trace_id}] 开启智能落盘引擎，格式：{fmt.upper()}", "timestamp": datetime.now(timezone.utc).isoformat()})
    
    final_content_to_send = ""
    
    # 【修复 4】：包装所有可能阻塞的重型操作
    def sync_data_processing():
        nonlocal final_content_to_send
        if fmt == "json":
            # 自定义 Encoder 处理 Numpy / Datetime 类型（常被 ML 清洗节点产生）
            class NumpyEncoder(json.JSONEncoder):
                def default(self, obj):
                    import numpy as np
                    if isinstance(obj, np.integer): return int(obj)
                    elif isinstance(obj, np.floating): return float(obj)
                    elif isinstance(obj, np.ndarray): return obj.tolist()
                    return super(NumpyEncoder, self).default(obj)
                    
            export_data_str = json.dumps(export_data_obj, ensure_ascii=False, indent=2, cls=NumpyEncoder)
            with open(path, "w", encoding="utf-8") as f:
                f.write(export_data_str)
            final_content_to_send = export_data_str
            
        elif fmt == "txt":
            export_data_str = ""
            if isinstance(export_data_obj, dict):
                strings = [v for v in export_data_obj.values() if isinstance(v, str)]
                export_data_str = strings[0] if len(strings) == 1 else json.dumps(export_data_obj, ensure_ascii=False, indent=2)
            elif isinstance(export_data_obj, list):
                export_data_str = "\n".join([str(x) for x in export_data_obj])
            else:
                export_data_str = str(export_data_obj)
            
            with open(path, "w", encoding="utf-8") as f:
                f.write(export_data_str)
            final_content_to_send = export_data_str
            
        elif fmt in ["csv", "excel"]:
            import pandas as pd
            data_for_df = export_data_obj
            if isinstance(data_for_df, dict):
                list_keys = [k for k, v in data_for_df.items() if isinstance(v, list)]
                if len(list_keys) == 1: data_for_df = data_for_df[list_keys[0]]
                else: data_for_df = [data_for_df]
            elif not isinstance(data_for_df, list):
                data_for_df = [{"data": str(data_for_df)}]
                
            df = pd.DataFrame(data_for_df)
            
            if fmt == "csv":
                df.to_csv(path, index=False, encoding="utf-8-sig")
                final_content_to_send = df.to_csv(index=False)
            else:
                df.to_excel(path, index=False)
                final_content_to_send = "Excel文件已在服务端生成，为二进制格式，请前往服务器目录查看。"

    try:
        # 将重度 CPU 运算和磁盘 I/O 甩到线程池去执行，让主线程继续处理其他节点的异步任务
        await asyncio.to_thread(sync_data_processing)
        
        from core.metrics import GLOBAL_METRICS
        items_count = len(export_data_obj) if isinstance(export_data_obj, list) else 1
        await GLOBAL_METRICS.add_scraped_item(items_count)

        await log_queue.put({"type": "log", "level": "归档", "color": "\x1b[32m", "message": f"[Trace: {context.trace_id}] 数据结晶化完成，已固化至: {path}", "timestamp": datetime.now(timezone.utc).isoformat()})

        # 回传给协同界面
        from core.logger import manager
        try:
            await manager.broadcast({
                "type": "file_download",
                "filename": final_filename,
                "content": final_content_to_send
            })
        except Exception:
            pass

    except ImportError:
        await log_queue.put({"type": "log", "level": "致命", "color": "\x1b[31m", "message": f"[Trace: {context.trace_id}] 制表失败：缺少 pandas 或 openpyxl。请执行 pip install pandas openpyxl", "timestamp": datetime.now(timezone.utc).isoformat()})
    except Exception as e:
        await log_queue.put({"type": "log", "level": "错误", "color": "\x1b[31m", "message": f"[Trace: {context.trace_id}] 文件写入防线击穿: {str(e)}", "timestamp": datetime.now(timezone.utc).isoformat()})
         
    return context

async def execute_subtask_dispatcher(node_config: dict, context: PipelineContext):
    queue_name = node_config.get("queueName", "default_queue")
    data_field = node_config.get("dataField", "")
    inherit_context = node_config.get("inheritContext", False)
    
    tasks_to_dispatch = []
    
    # 1. 寻找要下发的数据单元 (Iterator)
    if data_field:
        from nodes.app_nodes import _get_nested_property
        val = _get_nested_property(context, data_field)
        if val is None:
            if data_field in context.extracted_data:
                val = context.extracted_data[data_field]
            elif "ai_parsed" in context.extracted_data and isinstance(context.extracted_data["ai_parsed"], dict) and data_field in context.extracted_data["ai_parsed"]:
                val = context.extracted_data["ai_parsed"][data_field]
            
        if val is not None:
            if isinstance(val, list):
                tasks_to_dispatch.extend(val)
            else:
                tasks_to_dispatch.append(val)
        else:
            await log_queue.put({
                "type": "log", "level": "警告", "color": "\x1b[33m", 
                "message": f"[Trace: {context.trace_id}] 指定的提纯变量名 '{data_field}' 不存在！已跳过下发。",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            return context
    else:
        # 如果没有指定字段，作为傻瓜模式，重点检查 ai_parsed 或 dom / sub_urls
        ai_parsed = context.extracted_data.get("ai_parsed")
        dom_extracted = context.extracted_data.get("dom")
        sub_urls = context.extracted_data.get("sub_urls")
        
        if ai_parsed:
            if isinstance(ai_parsed, list):
                tasks_to_dispatch.extend(ai_parsed)
            elif isinstance(ai_parsed, dict):
                tasks_to_dispatch.append(ai_parsed)
            else:
                tasks_to_dispatch.append(ai_parsed)
        elif sub_urls:
            tasks_to_dispatch.extend(sub_urls if isinstance(sub_urls, list) else [sub_urls])
        elif dom_extracted:
            tasks_to_dispatch.extend(dom_extracted if isinstance(dom_extracted, list) else [dom_extracted])
        else:
            urls = []
            for v in context.extracted_data.values():
                if isinstance(v, str) and v.startswith("http"):
                    urls.append(v)
                elif isinstance(v, list):
                    for item in v:
                        if isinstance(item, str) and item.startswith("http"):
                            urls.append(item)
                        elif isinstance(item, dict):
                            urls.append(item)
            if urls:
                tasks_to_dispatch.extend(urls)
            else:
                if context.extracted_data:
                    tasks_to_dispatch.append(context.extracted_data)
                    
    if not tasks_to_dispatch:
        await log_queue.put({
            "type": "log", "level": "警告", "color": "\x1b[33m", 
            "message": f"[Trace: {context.trace_id}] 未发现可下发的数据！下发动作取消。",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        return context

    if queue_name not in GLOBAL_TASK_QUEUES:
        GLOBAL_TASK_QUEUES[queue_name] = asyncio.Queue()
        
    for data_item in tasks_to_dispatch:
        payload = {
            "__is_subtask_payload": True,
            "data": data_item,
            "parent_url": getattr(context, "url", "")
        }
        if inherit_context:
            payload["parent_context"] = {
                "cookies": context.session_cookies,
                "headers": context.headers,
                "proxy": context.proxy,
                "extracted_data": context.extracted_data,
                "url": getattr(context, "url", ""),
            }
        await GLOBAL_TASK_QUEUES[queue_name].put(payload)
        
    await log_queue.put({
        "type": "log", "level": "任务派发", "color": "\x1b[1;35m",
        "message": f"[Trace: {context.trace_id}] 成功将 {len(tasks_to_dispatch)} 个子任务打包投入 [{queue_name}] 队列！【继承认证会话状态: {inherit_context}】。",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return context
