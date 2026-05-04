import os
import json
import asyncio
import pandas as pd # type: ignore
from datetime import datetime, timezone
from core.context import PipelineContext
from core.logger import log_queue

async def execute_data_reader(node_config: dict, context: PipelineContext):
    source_type = node_config.get("sourceType", "local")
    path = node_config.get("path", "").strip()
    format_type = node_config.get("format", "auto")

    if not path:
        await log_queue.put({"type": "log", "level": "错误", "color": "\x1b[31m", "message": f"[Trace: {context.trace_id}] 读取失败：未提供有效的文件路径或 URL。"})
        context.route_path = "fallback"
        return context

    await log_queue.put({"type": "log", "level": "读取", "color": "\x1b[36m", "message": f"[Trace: {context.trace_id}] 正在尝试加载数据源: {path} ...", "timestamp": datetime.now(timezone.utc).isoformat()})

    try:
        data = None
        # 智能推断格式
        if format_type == "auto":
            ext = path.split('.')[-1].lower()
            if "csv" in ext: format_type = "csv"
            elif "xls" in ext: format_type = "excel"
            elif "json" in ext: format_type = "json"
            elif "txt" in ext: format_type = "txt"
            else: format_type = "json" # fallback

        # 执行加载引擎
        if format_type == "csv":
            df = pd.read_csv(path)
            df = df.where(pd.notna(df), None)
            data = df.to_dict(orient="records")
        elif format_type == "excel":
            df = pd.read_excel(path)
            df = df.where(pd.notna(df), None)
            data = df.to_dict(orient="records")
        elif format_type == "json":
            if source_type == "url":
                import aiohttp
                async with aiohttp.ClientSession() as session:
                    async with session.get(path) as resp:
                        data = await resp.json()
            else:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
        elif format_type == "txt":
            if source_type == "url":
                import aiohttp
                async with aiohttp.ClientSession() as session:
                    async with session.get(path) as resp:
                        data = await resp.text()
            else:
                with open(path, "r", encoding="utf-8") as f:
                    data = f.read()

        # 将读取到的数据注入上下文
        context.extracted_data["read_data"] = data
        
        # 简单统计数据量
        data_size = len(data) if isinstance(data, list) else 1
        await log_queue.put({"type": "log", "level": "成功", "color": "\x1b[1;32m", "message": f"[Trace: {context.trace_id}] 📥 数据加载成功！共载入 {data_size} 条记录。", "timestamp": datetime.now(timezone.utc).isoformat()})

    except Exception as e:
        await log_queue.put({"type": "log", "level": "错误", "color": "\x1b[31m", "message": f"[Trace: {context.trace_id}] 数据加载崩溃: {str(e)}", "timestamp": datetime.now(timezone.utc).isoformat()})
        context.route_path = "fallback"
        return context

    return context
