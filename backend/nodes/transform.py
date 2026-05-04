import re
import json
import asyncio
from datetime import datetime, timezone
import dateutil.parser # type: ignore # pip install python-dateutil
from core.context import PipelineContext
from core.logger import log_queue

async def execute_data_transformer(node_config: dict, context: PipelineContext):
    mode = node_config.get("cleanMode", "rule_based")
    target_field = node_config.get("targetField", "").strip()
    
    # 获取需要清洗的数据源
    if target_field:
        from nodes.app_nodes import _get_nested_property
        raw_data = _get_nested_property(context, target_field)
    else:
        # 兜底寻找刚才 [数据读取] 节点或抓取节点的结果
        raw_data = context.extracted_data.get("read_data", context.extracted_data.get("cleaned_data", context.extracted_data.get("api_response", context.extracted_data)))

    if not raw_data:
        await log_queue.put({"type": "log", "level": "警告", "color": "\x1b[33m", "message": f"[Trace: {context.trace_id}] 清洗机未捕获到目标载荷，直接放行。", "timestamp": datetime.now(timezone.utc).isoformat()})
        return context

    await log_queue.put({
        "type": "log", "level": "清洗", "color": "\x1b[35m", 
        "message": f"[Trace: {context.trace_id}] 启动数据清洗机 ({'物理规则' if mode == 'rule_based' else 'AI 智能'}模式)...",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    # 将数据统一包装为列表处理
    is_single_dict = isinstance(raw_data, dict)
    items_to_process = [raw_data] if is_single_dict else raw_data if isinstance(raw_data, list) else [{"value": raw_data}]
    
    processed_items = []

    # ==========================================
    # 模式 1：物理规则极速清洗 (全能 ETL 版)
    # ==========================================
    if mode == "rule_based":
        rules = node_config.get("rules", [])
        for item in items_to_process:
            if not isinstance(item, dict):
                processed_items.append(item)
                continue
                
            new_item = item.copy()
            for rule in rules:
                field = rule.get("field")
                action = rule.get("action")
                param1 = rule.get("param1", "")
                param2 = rule.get("param2", "")
                
                if not field or field not in new_item:
                    continue
                    
                val = new_item[field]
                
                try:
                    # 1. 删除字段
                    if action == "delete_key":
                        del new_item[field]
                        continue
                        
                    # 2. 空值兜底填充
                    if action == "fill_default":
                        if val is None or str(val).strip() == "":
                            new_item[field] = param1
                        continue

                    # 如果值本身为空，跳过剩余的类型操作 (保留空状态)
                    if val is None: 
                        continue

                    # 3. 基础文本操作
                    if action == "trim_spaces":
                        new_item[field] = str(val).strip()
                        
                    elif action == "remove_html":
                        new_item[field] = re.sub(r'<[^>]+>', '', str(val)).strip()
                        
                    elif action == "replace_text":
                        new_item[field] = str(val).replace(param1, param2)
                        
                    elif action == "regex_replace":
                        new_item[field] = re.sub(param1, param2, str(val))

                    # 4. 数值提取
                    elif action == "extract_number":
                        # 处理包含千分位、符号、小数的金额
                        clean_str = str(val).replace(",", "")
                        nums = re.findall(r"[-+]?\d*\.\d+|\d+", clean_str)
                        if nums:
                            # 尝试转为 float，如果没小数则转 int 看起来更干净
                            num_val = float(nums[0])
                            new_item[field] = int(num_val) if num_val.is_integer() else num_val
                        else:
                            new_item[field] = 0

                    # 5. 结构与对象化
                    elif action == "parse_json":
                        if isinstance(val, str):
                            new_item[field] = json.loads(val)
                            
                    # 6. 日期与时间
                    elif action == "to_timestamp":
                        dt = dateutil.parser.parse(str(val))
                        new_item[field] = int(dt.timestamp())
                        
                    elif action == "format_date":
                        # param1 为目标格式，例如 "%Y-%m-%d"
                        dt = dateutil.parser.parse(str(val))
                        target_format = param1 if param1 else "%Y-%m-%d %H:%M:%S"
                        new_item[field] = dt.strftime(target_format)
                        
                    # 7. 键名变更 (放在最后执行，以防改变了引用名)
                    elif action == "rename_key":
                        if param1 and param1 != field:
                            new_item[param1] = new_item.pop(field)

                except Exception as e:
                    # 单个字段的单个规则报错，不应阻断整条流水线，记录警告即可
                    print(f"[Transformer Warning] Field '{field}' action '{action}' failed: {e}")
                    pass 
            
            processed_items.append(new_item)

    # ==========================================
    # 模式 2：AI 智能语义清洗
    # ==========================================
    elif mode == "ai_assisted":
        prompt_instruction = node_config.get("aiPrompt", "清理并标准化数据")
        # 为防止超出上下文，如果数据量太大，可以分批或者提示截断
        dirty_json_str = json.dumps(items_to_process, ensure_ascii=False)[:30000] 
        
        sys_prompt = "你是一个顶级数据清洗工程师。请按照要求清洗给定的 JSON 数据，只返回合法的 JSON 数组结构。不要改变没有要求的字段。"
        user_prompt = f"【清洗要求】\n{prompt_instruction}\n\n【脏数据】\n{dirty_json_str}"
        
        from core.llm import call_text_llm
        try:
            res_text, _ = await call_text_llm("gpt-4o-mini", sys_prompt, user_prompt, json_mode=True)
            clean_str = res_text.replace("```json", "").replace("```", "").strip()
            processed_items = json.loads(clean_str)
            await log_queue.put({"type": "log", "level": "AI", "color": "\x1b[32m", "message": f"[Trace: {context.trace_id}] AI 语义清洗纠错完成。", "timestamp": datetime.now(timezone.utc).isoformat()})
        except Exception as e:
            await log_queue.put({"type": "log", "level": "错误", "color": "\x1b[31m", "message": f"AI 清洗失败: {e}，使用原数据。", "timestamp": datetime.now(timezone.utc).isoformat()})
            processed_items = items_to_process

    # 封装还原数据
    final_data = processed_items[0] if is_single_dict else processed_items
    
    # 重新注入回上下文
    context.extracted_data["cleaned_data"] = final_data
    
    await log_queue.put({
        "type": "log", "level": "成功", "color": "\x1b[1;32m", 
        "message": f"[Trace: {context.trace_id}] 🛁 数据清洗机处理完毕！输出载荷准备就绪。",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return context
