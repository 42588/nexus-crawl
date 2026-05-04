from .trigger import execute_start_node, execute_webhook_trigger, execute_queue_trigger
from .action import execute_lightweight_http, execute_headless_browser, execute_burst_concurrency, execute_status_router, execute_tactical_breakpoint, execute_manual_breakpoint
from .stealth import execute_proxy_pool, execute_fingerprint_spoof, execute_session_pool, execute_vision_solver, execute_ai_agent_navigator
from .ai import execute_dom_extraction, execute_ai_intent_parsing
from .output import execute_knowledge_base, execute_notify_node, execute_file_export, execute_subtask_dispatcher
from .app_nodes import execute_dynamic_decrypt_payload
from .read import execute_data_reader
from .transform import execute_data_transformer
from .ml_clean import execute_ml_cleaning

NODE_EXECUTORS = {
    "机器学习数据清洗": execute_ml_cleaning,
    "数据读取与加载": execute_data_reader,
    "万能数据清洗转换": execute_data_transformer,
    "系统定时节拍器": execute_start_node,
    "智能风控路由哨兵": execute_tactical_breakpoint,
    "人工战术挂起断点": execute_manual_breakpoint,
    "HTTP 状态码路由": execute_status_router,
    "外部接口 WebHook 触发": execute_webhook_trigger,
    "任务调度队列": execute_queue_trigger,
    "Playwright 拟真沙箱": execute_headless_browser,
    "脉冲并发请求": execute_burst_concurrency,
    "大模型智能萃取与清洗": execute_ai_intent_parsing,
    "AI 隐匿具身雷达": execute_ai_agent_navigator,
    "验证码视觉对抗突破": execute_vision_solver,
    "持久化知识库": execute_knowledge_base,
    "文件与多媒体保存": execute_file_export,
    "即时状态分发": execute_notify_node,
    "轻量静态 HTTP 抓取": execute_lightweight_http,
    "特征与 DOM 萃取": execute_dom_extraction,
    "代理 IP 调度池": execute_proxy_pool,
    "子任务下发中心": execute_subtask_dispatcher,
    "指纹与 Headers 随机化": execute_fingerprint_spoof,
    "会话身份驻留池": execute_session_pool,
    "动态载荷智能剥壳": execute_dynamic_decrypt_payload,
}
