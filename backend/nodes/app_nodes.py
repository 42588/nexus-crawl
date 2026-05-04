import asyncio
import base64
import urllib.parse
import re
from datetime import datetime, timezone
from core.context import PipelineContext
from core.logger import log_queue

def _get_nested_property(obj, path):
    if path.startswith('context.'):
        path = path[len('context.'):]
    parts = path.split('.')
    current = obj
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        elif hasattr(current, part):
            current = getattr(current, part)
        else:
            return None
    return current

def _set_nested_property(obj, path, value):
    if path.startswith('context.'):
        path = path[len('context.'):]
    parts = path.split('.')
    current = obj
    for i, part in enumerate(parts):
        if i == len(parts) - 1:
            if isinstance(current, dict):
                current[part] = value
            else:
                setattr(current, part, value)
        else:
            if isinstance(current, dict):
                if part not in current:
                    current[part] = {}
                current = current[part]
            elif hasattr(current, part):
                current = getattr(current, part)
            else:
                setattr(current, part, {})
                current = getattr(current, part)

async def get_slim_data_for_ai(html: str, context: PipelineContext) -> str:
    if not html:
        return ""
    
    is_main_html = (html == getattr(context, "html", None))
    if is_main_html and getattr(context, "slim_html", None):
        return context.slim_html

    from bs4 import BeautifulSoup
    try:
        from markdownify import markdownify as md
    except ImportError:
        md = None

    start_time = datetime.now()
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript", "svg", "path", "iframe", "nav", "footer", "header"]):
        tag.extract()
    
    if md:
        slim_text = md(str(soup), heading_style="ATX").strip()
    else:
        slim_text = soup.get_text(separator=' ', strip=True)

    if is_main_html:
        context.slim_html = slim_text
    
    orig_len = len(html)
    slim_len = len(slim_text)
    saved = orig_len - slim_len
    pct = (saved / orig_len * 100) if orig_len > 0 else 0
    
    if saved > 0:
        from core.metrics import GLOBAL_METRICS
        await GLOBAL_METRICS.add_saved_characters(saved)
    
    await log_queue.put({
        "type": "log", "level": "压缩", "color": "\x1b[36m",
        "message": f"[Trace: {context.trace_id}] 执行 HTML 惰性物理减脂滤清：{orig_len} -> {slim_len} 字符 (节约 {pct:.2f}%)，耗时 {(datetime.now() - start_time).total_seconds():.2f}s",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return slim_text

async def execute_dynamic_decrypt_payload(node_config: dict, context: PipelineContext):
    crypto_mode = node_config.get("cryptoMode", "conventional")
    target_fields_str = node_config.get("targetFields", "context.html")
    target_fields = [f.strip() for f in target_fields_str.split(',') if f.strip()]
    
    if crypto_mode == "ai_assisted":
        from core.llm import call_text_llm
        import json
        from core.metrics import GLOBAL_METRICS
        import time
        model = node_config.get("model", "gpt-4o-mini")
        ai_prompt = node_config.get("aiPrompt", "提取数据")
        await log_queue.put({
            "type": "log", "level": "AI", "color": "\x1b[35m", 
            "message": f"[Trace: {context.trace_id}] 启动 AI 大模型进行智能载荷剥壳与提取解密，引擎: {model}...", 
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        for field in target_fields:
            payload = _get_nested_property(context, field)
            if not payload:
                continue
            
            auto_slim = node_config.get("autoSlim", True)
            if auto_slim and (field == "html" or (isinstance(payload, str) and "<html" in payload.lower()[:200])):
                raw_str = await get_slim_data_for_ai(payload, context)
            else:
                raw_str = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
                
            prompt = f"原数据内容：\n{raw_str}\n\n请进行数据解密/特征提取任务，任务描述：{ai_prompt}\n务必直接返回处理后的结果。如果你能转换为JSON对象就最好返回JSON！"
            
            try:
                start_time = time.time()
                res_text, tokens = await call_text_llm(model, "你是一个强大的数据解密提取助手。", prompt, json_mode=False)
                context.llm_tokens += tokens
                await GLOBAL_METRICS.add_tokens(tokens)
                
                # Check if JSON
                try:
                    final_res = json.loads(res_text.replace("```json", "").replace("```", "").strip())
                except:
                    final_res = res_text.strip()
                    
                _set_nested_property(context, field, final_res)
                
                duration = time.time() - start_time
                await log_queue.put({
                    "type": "log", "level": "解密", "color": "\x1b[1;32m", 
                    "message": f"[Trace: {context.trace_id}] AI 剥壳成功 ({duration:.2f}s) -> 覆写 [{field}]", 
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
            except Exception as e:
                await log_queue.put({
                    "type": "log", "level": "错误", "color": "\x1b[31m", 
                    "message": f"[Trace: {context.trace_id}] AI 解构字段 [{field}] 失败: {str(e)}", 
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
                
        return context
        
    # Conventional Decryption
    algorithm = node_config.get("algorithm", "base64")
    
    await log_queue.put({
        "type": "log", "level": "解构", "color": "\x1b[35m", 
        "message": f"[Trace: {context.trace_id}] 启动动态负载解构引擎 (多字段模式: {algorithm})，目标字段: {target_fields}。", 
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    # Pre-handle html_slim directly because it's async
    if algorithm == "html_slim":
        for field in target_fields:
            payload = _get_nested_property(context, field)
            if not payload:
                continue
            
            try:
                if isinstance(payload, str):
                    final_payload = await get_slim_data_for_ai(payload, context)
                    if field == "html":
                        # CRITICAL: Do not overwrite context.html to enforce Dual-Track Rule.
                        # Put it in extracted_data instead.
                        context.extracted_data["slim_html"] = final_payload
                        save_field = "extracted_data.slim_html"
                    else:
                        _set_nested_property(context, field, final_payload)
                        save_field = field

                    await log_queue.put({
                        "type": "log", "level": "滤清", "color": "\x1b[1;36m", 
                        "message": f"[Trace: {context.trace_id}] 对字段 [{field}] 执行物理滤清成功，结果已保存至 {save_field}。", 
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    })
            except Exception as e:
                pass
        return context

    def decrypt_value(val):
        if not isinstance(val, str) and not isinstance(val, bytes):
            return val
            
        raw = val
        if isinstance(raw, bytes):
            raw_str = raw.decode('utf-8', errors='ignore')
        else:
            raw_str = str(raw)

        try:
            if algorithm == "base64":
                decoded_bytes = base64.b64decode(raw, validate=True) if isinstance(raw, str) else base64.b64decode(raw)
                return decoded_bytes.decode('utf-8')
                
            elif algorithm == "urldecode":
                return urllib.parse.unquote(raw_str)
                
            elif algorithm == "regex_extract":
                pattern = node_config.get("regexPattern", "")
                if pattern:
                    match = re.search(pattern, raw_str)
                    if match:
                        return match.group(1) if len(match.groups()) > 0 else match.group(0)
                return raw
        except Exception:
            pass
            
        return val

    def recursive_decrypt(data):
        if isinstance(data, list):
            return [recursive_decrypt(item) for item in data]
        elif isinstance(data, dict):
            return {k: recursive_decrypt(v) for k, v in data.items()}
        else:
            return decrypt_value(data)

    for field in target_fields:
        payload = _get_nested_property(context, field)
        if not payload:
            continue
            
        try:
            final_payload = recursive_decrypt(payload)
            _set_nested_property(context, field, final_payload)
            await log_queue.put({
                "type": "log", "level": "解析", "color": "\x1b[1;32m", 
                "message": f"[Trace: {context.trace_id}] 原地突破字段 [{field}] 成功，已覆写载荷。", 
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception as e:
            await log_queue.put({
                "type": "log", "level": "错误", "color": "\x1b[31m", 
                "message": f"[Trace: {context.trace_id}] 结构解密整体容错: {str(e)}。已保留原包裹数据结构向下传递。", 
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

    return context


