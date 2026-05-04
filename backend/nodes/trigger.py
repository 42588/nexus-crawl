import asyncio
from datetime import datetime, timezone
from core.context import PipelineContext, GLOBAL_TASK_QUEUES
from core.logger import log_queue

async def execute_start_node(node_config: dict, context: PipelineContext):
    cron = node_config.get('cron', '手动触发')
    start_url = node_config.get('startUrl', '')
    
    if start_url:
        context.url = start_url
        
    payload_str = node_config.get('payload', '{}')
    
    # Parse payload if provided
    try:
        if payload_str:
            import json
            payload = json.loads(payload_str)
            if isinstance(payload, dict):
                context.extracted_data.update(payload)
                if "target" in payload and not hasattr(context, "url"):
                    context.url = payload["target"]
    except Exception as e:
        await log_queue.put({"type": "log", "level": "WARNING", "color": "\x1b[33m", "message": f"[Trace: {context.trace_id}] Payload 解析失败: {str(e)}", "timestamp": datetime.now(timezone.utc).isoformat()})

    await log_queue.put({"type": "log", "level": "信号", "color": "\x1b[32m", "message": f"[Trace: {context.trace_id}] 定时节拍按预期启动 (调度策略: {cron})，承载 Payload 向下游传递...", "timestamp": datetime.now(timezone.utc).isoformat()})
    await asyncio.sleep(0.5)
    return context

async def execute_queue_trigger(node_config: dict, context: PipelineContext):
    queue_name = node_config.get("queueName", "default_queue")
    
    # If this is called from the daemon worker, just pass it through
    if context.extracted_data.get("is_daemon_worker"):
        await log_queue.put({
            "type": "log", "level": "消费", "color": "\x1b[32m",
            "message": f"[Trace: {context.trace_id}] {queue_name} 工作线程取出一个任务目标: {context.url}，开始执行流水线...",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        return context

    # (Legacy/Fallback) If called manually or by something else randomly
    return None

async def execute_webhook_trigger(node_config: dict, context: PipelineContext):
    path = node_config.get("listenPath", "/api/webhook")
    
    # 1. 真正的安全校验逻辑
    secret = node_config.get("secret", "")
    # 注意：这里的校验逻辑通常配合 Header 使用，此处为逻辑示例
    provided_token = context.extracted_data.get("x-webhook-token", "")
    
    if secret and provided_token != secret:
        await log_queue.put({
            "type": "log", "level": "SECURITY", "color": "\x1b[31m", 
            "message": f"[Trace: {context.trace_id}] WebHook 鉴权失败：非法访问已被拦截！", 
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        # 中断执行逻辑：在你的调度器里，返回 None 或抛出错误通常代表流程终止
        return None

    # 2. 核心：数据动态注入
    # 确保外部传入的 payload 能够覆盖到 context 中供下游使用
    incoming_payload = context.extracted_data.get("raw_webhook_body", {})
    if isinstance(incoming_payload, dict):
        context.extracted_data.update(incoming_payload)
        # 如果外部传来了 target 字段，自动更新爬取目标
        if "target" in incoming_payload:
            context.url = incoming_payload["target"]
            
        # Optional: Support "payload_str" / "payload" if it matches conventional inputs
        if "payload" in incoming_payload:
            context.extracted_data.update(incoming_payload["payload"])

    await log_queue.put({
        "type": "log", "level": "外部触发", "color": "\x1b[35m", 
        "message": f"[Trace: {context.trace_id}] WebHook ({path}) 激活成功！已将外部数据负载注入流水线。", 
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    await asyncio.sleep(0.5)
    return context
