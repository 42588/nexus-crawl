from pydantic import BaseModel
from typing import List, Dict, Any
import random

class FlowData(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]

# 全局的子任务调度中心（URL Frontier）
# 结构: {"queue_name": asyncio.Queue()}
GLOBAL_TASK_QUEUES = {}

# 定义全局的上下文传递字典
class PipelineContext:
    def __init__(self, trace_id=None):
        self.url = ""
        self.html = ""
        self.status_code = None
        self.headers = {}
        self.latency = 0
        self.llm_tokens = 0
        self.blocked_hits = 0
        self.extracted_data = {}
        self.session_cookies = {}
        self.proxy = None
        self.slim_html = None
        self.trace_id = trace_id or f"trace_{random.randint(1000, 9999)}"
        self.pipeline_id = self.trace_id
        # Add ability to pass playwright page if needed (but avoid cross-process sending)
        self.page = None
        self.route_path = None
        self.routing_flag = "main"
        self.request_meta = {}

    def clone(self):
        new_ctx = PipelineContext(trace_id=f"worker_{random.randint(10000, 99999)}")
        new_ctx.pipeline_id = self.pipeline_id
        new_ctx.url = self.url
        new_ctx.html = self.html
        new_ctx.status_code = self.status_code
        new_ctx.headers = self.headers.copy() if isinstance(self.headers, dict) else {}
        new_ctx.latency = self.latency
        new_ctx.llm_tokens = self.llm_tokens
        new_ctx.blocked_hits = self.blocked_hits
        new_ctx.extracted_data = self.extracted_data.copy() if isinstance(self.extracted_data, dict) else {}
        new_ctx.session_cookies = self.session_cookies.copy() if isinstance(self.session_cookies, dict) else {}
        new_ctx.proxy = self.proxy
        new_ctx.route_path = self.route_path
        new_ctx.routing_flag = self.routing_flag
        new_ctx.request_meta = self.request_meta.copy() if isinstance(self.request_meta, dict) else {}
        new_ctx.page = None
        return new_ctx
