import asyncio
import os
import json
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from datetime import datetime, timezone
from core.context import PipelineContext
from core.logger import log_queue
from core.metrics import GLOBAL_METRICS
from google.genai import types

def _extract_dom(html: str, selector: str, attribute: str) -> list:
    if not html: return []
    soup = BeautifulSoup(html, "lxml")
    elements = soup.select(selector)
    if attribute:
        return [el.get(attribute) for el in elements if el.get(attribute)]
    return [el.get_text(strip=True) for el in elements]

async def execute_dom_extraction(node_config: dict, context: PipelineContext):
    extract_mode = node_config.get("extractMode", "single")
    
    # 兼容老的模式（如果没有显式选择 extractMode）
    selector_str = node_config.get("selector", "").strip()
    if not node_config.get("extractMode"):
        if selector_str.startswith("{") and selector_str.endswith("}"):
            extract_mode = "multi"
        elif not selector_str:
            extract_mode = "ai"
        else:
            extract_mode = "single"

    is_multi_mode = False
    rules = {}

    def unpack(res):
        if not res:
            return None
        if len(res) == 1:
            return res[0]
        return res

    if extract_mode == "ai":
        # 如果是 AI 智能托管模式，尝试从上一层的提取结果无缝接管大模型输出的规则
        # 现在大模型抽取的数据直接拍平在 extracted_data 顶层，或者在 ai_parsed 中
        ai_parsed = context.extracted_data.get("ai_parsed", context.extracted_data)
        if isinstance(ai_parsed, dict):
            rules_from_ai = {}
            for k, v in ai_parsed.items():
                if isinstance(v, str) and ("." in v or "#" in v or " " in v or v.isalpha() or "-" in v):
                    # 简单试探是不是长得像 CSS 选择器
                    if k.endswith("_selector") or k.endswith("_css"):
                         rules_from_ai[k.replace("_selector", "").replace("_css", "")] = v
                    elif "css" in k.lower() or "selector" in k.lower():
                         rules_from_ai[k] = v
            
            # 如果大模型返回了单个包裹的 selectors 对象
            if "selectors" in ai_parsed and isinstance(ai_parsed["selectors"], dict):
                rules_from_ai.update(ai_parsed["selectors"])
                
            if rules_from_ai:
                rules = rules_from_ai
                is_multi_mode = True
                
        if not is_multi_mode:
            await log_queue.put({
                "type": "log", "level": "警告", "color": "\x1b[33m",
                "message": f"[Trace: {context.trace_id}] AI 托管模式未检测到有效的 CSS 规则，请检查上游大模型输出节点是否返回了含 'selector' 的特征！",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            return context

    elif extract_mode == "multi":
        # 多字段模式
        multi_rules = node_config.get("multiRules", [])
        for r in multi_rules:
            if r.get("key") and r.get("selector"):
                rules[r["key"]] = {"selector": r["selector"], "attribute": r.get("attribute", "")}
        
        # 兼容老的 JSON 模式
        if not rules and selector_str.startswith("{"):
            try:
                rules = json.loads(selector_str)
            except Exception:
                pass
                
        is_multi_mode = True

    else:
        # 单节点模式
        selector = node_config.get("selector", "a").strip()
        attribute = node_config.get("attribute", "").strip()

    if is_multi_mode:
        await log_queue.put({
            "type": "log", "level": "多路提取", "color": "\x1b[34m",
            "message": f"[Trace: {context.trace_id}] 启动多路 DOM 萃取模式！命中寻址规则共 {len(rules)} 条...",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        extracted_dict = {}
        for key, rule in rules.items():
            if isinstance(rule, dict):
                r_sel = rule.get("selector", "")
                r_attr = rule.get("attribute", "")
            else:
                r_sel = str(rule)
                r_attr = ""
                
            res = _extract_dom(context.html, r_sel, r_attr)
            # 根据用户反馈，在此处拆箱以避免“过度包装”（如单元素仍为数组）
            # 对于多路模式下的单个子键，如果只提取到一个 DOM，解包成单个字符串
            extracted_dict[key] = unpack(res)
                
        # 取消对 dom 的多层嵌套，直接将多路特征合并到顶层数据里
        context.extracted_data.update(extracted_dict)
        
        await log_queue.put({
            "type": "log", "level": "成功", "color": "\x1b[32m",
            "message": f"[Trace: {context.trace_id}] 多路萃取完成! 获取键值: {list(extracted_dict.keys())}",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
    else:
        if not selector:
            selector = "a" # Fallback
            
        await log_queue.put({
            "type": "log", "level": "提取", "color": "\x1b[34m",
            "message": f"[Trace: {context.trace_id}] 执行特征与 DOM 精准提取... 寻址规则: {selector} (属性: {attribute or '文本'})",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        extracted = unpack(_extract_dom(context.html, selector, attribute))
        context.extracted_data["dom"] = extracted
        
        if attribute in ['href', 'src']:
            context.extracted_data["sub_urls"] = extracted
        
        await log_queue.put({
            "type": "log", "level": "成功", "color": "\x1b[32m",
            "message": f"[Trace: {context.trace_id}] 成功命中碎片数据!",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
    await asyncio.sleep(0.3)
    return context

async def execute_ai_intent_parsing(node_config: dict, context: PipelineContext):
    intent = node_config.get("intent", "提取核心内容")
    await log_queue.put({
        "type": "log", "level": "AI", "color": "\x1b[35m",
        "message": f"[Trace: {context.trace_id}] 启动大模型意图解析！任务指令: [{intent}]",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    try:
        import time
        start_time = time.time()
        model_name = node_config.get("model", "gemini-2.5-flash")
        api_key = os.environ.get("GEMINI_API_KEY")
        dashscope_key = os.environ.get("DASHSCOPE_API_KEY")

        if context.html:
            from nodes.app_nodes import get_slim_data_for_ai
            
            auto_slim = node_config.get("autoSlim", True)
            if auto_slim:
                safe_data = await get_slim_data_for_ai(context.html, context)
                safe_data = safe_data[:500000] # Provide enough context limit
                
                if node_config.get("extractMode", "data") == "selector":
                    schema_instruction = "请务必返回一个标准的 JSON 对象，所有的 key 必须以 `_selector` 或 `_css` 结尾（例如 `title_selector`, `author_selector`, `list_items_selector`），值为对应的 CSS Selector 字符串。绝对不能出现 markdown 代码块，只能输出合法的 JSON 字符串。"
                    prompt = f"你是一名前端解析与爬虫抓取工程师。当前抓取到的网页内容已过物理减脂 (转换为 Markdown)：\n\n{safe_data}\n\n请根据以下用户的意图/指令，提取对应的内容，请基于目前看到的标签(如果有)尝试提供选择器，但 Markdown 可能损失大量 HTML 结构。推荐切换为【标准数据提纯】模式，或关闭降噪滤清器。\n\n{schema_instruction}\n\n用户的意图/指令是：{intent}"
                else:
                    schema = node_config.get("schema", "").strip()
                    schema_instruction = f"请严格遵守此 JSON Schema 格式输出：\n{schema}" if schema else "并务必以严格的 JSON 格式输出（不要任何 Markdown 代码块包裹，只输出合法的 JSON 字符串）"
                    prompt = f"你是一个专业的数据结构化提取Agent。当前抓取到的网页文本内容已过滤为高度精简的 Markdown 格式，内容如下：\n\n{safe_data}\n\n请根据以下用户的意图/指令，提取对应的内容，{schema_instruction}，如果没有找到则返回空的JSON对象 {{}}。用户的意图/指令是：{intent}"
                    
            else:
                # Extract text from HTML but retain links for AI to see
                soup = BeautifulSoup(context.html, "lxml")
                
                extract_mode = node_config.get("extractMode", "data")
                
                if extract_mode == "selector":
                    # For selector generation, we need the HTML structure, not just text
                    # We will strip out large script/style tags and compress the HTML
                    from bs4 import Comment
                    for script in soup(["script", "style", "noscript", "svg", "path"]):
                        script.extract()
                    for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
                        comment.extract()
                    
                    safe_data = soup.prettify()[:600000] # Provide HTML context (increased limit for large pages)
                    
                    schema_instruction = "请务必返回一个标准的 JSON 对象，所有的 key 必须以 `_selector` 或 `_css` 结尾（例如 `title_selector`, `author_selector`, `list_items_selector`），值为对应的 CSS Selector 字符串。绝对不能出现 markdown 代码块，只能输出合法的 JSON 字符串。"
                    prompt = f"你是一名前端解析与爬虫抓取工程师。当前抓取到的网页局部压缩 HTML 结构如下：\n\n```html\n{safe_data}\n```\n\n请根据以下用户的意图/指令，分析上面的 HTML 结构，并提供可用于 BeautifulSoup 的精准 CSS 选择器。\n\n{schema_instruction}\n\n用户的意图/指令是：{intent}"
                else:
                    # For data extraction, just text is fine
                    for a in soup.find_all("a"):
                        href = a.get("href")
                        if href and a.string:
                            a.string = f"{a.string} (链接: {href})"
                        elif href and not a.string:
                            a.append(f"(链接: {href})")
                    
                    # Remove scripts and styles
                    for script in soup(["script", "style", "noscript"]):
                        script.extract()
                    
                    text_content = soup.get_text(separator=' ', strip=True) 
                    safe_data = text_content[:500000] # Provide enough context (increased limit for large pages)
                    
                    schema = node_config.get("schema", "").strip()
                    schema_instruction = f"请严格遵守此 JSON Schema 格式输出：\n{schema}" if schema else "并务必以严格的 JSON 格式输出（不要任何 Markdown 代码块包裹，只输出合法的 JSON 字符串）"
                    prompt = f"你是一个专业的数据结构化提取Agent。当前抓取到的网页文本内容如下：\n\n{safe_data}\n\n请根据以下用户的意图/指令，提取对应的内容，{schema_instruction}，如果没有找到则返回空的JSON对象 {{}}。用户的意图/指令是：{intent}"
            
            await log_queue.put({
                "type": "log", "level": "AI", "color": "\x1b[35m",
                "message": f"[Trace: {context.trace_id}] 正在分析 {len(safe_data)} 个字符的网页压缩上下文...",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            
            from core.llm import call_text_llm
            parsed_json_str = ""
            
            try:
                # We extract schema requirements inside the prompt already, so just pass empty system prompt
                res_text, tokens = await call_text_llm(model_name, "你是一个强大的结构化提取助手。", prompt, json_mode=True)
                parsed_json_str = res_text.replace("```json", "").replace("```", "").strip()
                context.llm_tokens += tokens
                await GLOBAL_METRICS.add_tokens(tokens)
            except Exception as llm_err:
                raise ValueError(f"调用 {model_name} 模型失败: {str(llm_err)}")

            import json
            duration = time.time() - start_time
            try:
                parsed_ext = json.loads(parsed_json_str)
                # To match the behavior of feature DOM extraction, merge dict directly into extracted_data
                context.extracted_data["ai_parsed"] = parsed_ext # Preserve exact copy for downstream nodes that explicitly look for it
                if isinstance(parsed_ext, dict):
                    context.extracted_data.update(parsed_ext)
                    msg = f"[Trace: {context.trace_id}] \x1b[32mAI 意图解析完成 ({duration:.2f}s)！成功获取结构化信息: {list(parsed_ext.keys())}\x1b[35m"
                else:
                    context.extracted_data["dom"] = parsed_ext # Fallback to 'dom' key to match single extraction mode
                    if isinstance(parsed_ext, list):
                        msg = f"[Trace: {context.trace_id}] \x1b[32mAI 意图解析完成 ({duration:.2f}s)！成功获取列表数据，长度: {len(parsed_ext)}\x1b[35m"
                    else:
                        msg = f"[Trace: {context.trace_id}] \x1b[32mAI 意图解析完成 ({duration:.2f}s)！\x1b[35m"
            except Exception as j_err:
                context.extracted_data["ai_parsed_raw_text"] = parsed_json_str
                context.extracted_data["dom"] = parsed_json_str # Also inject to 'dom'
                msg = f"[Trace: {context.trace_id}] \x1b[33mAI 意图解析完成 ({duration:.2f}s)，但返回格式非标准 JSON。\x1b[35m"
                
        else:
            await asyncio.sleep(1.0)
            context.extracted_data["mocked_intent"] = intent
            msg = f"[Trace: {context.trace_id}] \x1b[33mAI 本地沙盘推演完成\x1b[35m (模拟提取了 '{intent}')"

    except Exception as e:
        context.extracted_data["ai_parsed_error"] = str(e)
        msg = f"[Trace: {context.trace_id}] \x1b[31m大模型解析引擎异常: {str(e)[:80]}\x1b[35m"

    await log_queue.put({
        "type": "log", "level": "智能", "color": "\x1b[35m",
        "message": msg,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return context
