import asyncio
from typing import List, Dict
from datetime import datetime, timezone
from core.context import PipelineContext
from core.logger import log_queue
from nodes import NODE_EXECUTORS
import uuid
import time

GLOBAL_PIPELINE_UPDATERS = {}

async def run_pipeline_chain(nodes: list, edges: list, initial_context: PipelineContext, start_node_id: str = None):
    """
    【架构升级】：完全摒弃 Kahn 的单线拓扑排序循环法，重构为基于数据流 (Dataflow) 的递归并发图执行引擎。
    每一条连线 (Edge) 就是一个数据通道，每个节点 (Node) 都是一个独立 Actor。
    原生支持并行分支 (Fan-out)、汇聚 (Fan-in)、以及长线生命周期管理，完美隔离上下文变量污染。
    """
    
    state = type('TopologyState', (), {})()
    state.nodes = nodes
    state.edges = edges
    
    def rebuild_topology(n, e):
        state.nodes = n
        state.edges = e
        state.node_map = {node['id']: node for node in n}
        out_edges = {}
        for edge in e:
            src = edge['source']
            tgt = edge['target']
            hd = edge.get('sourceHandle')
            if src not in out_edges:
                out_edges[src] = []
            if (tgt, hd) not in out_edges[src]:
                out_edges[src].append((tgt, hd))
        state.outgoing_edges = out_edges

    rebuild_topology(nodes, edges)
    # Register updater
    GLOBAL_PIPELINE_UPDATERS[initial_context.pipeline_id] = rebuild_topology

    # 构建出边路由字典 {source_id: [(target_id, sourceHandle), ...]}
    in_degree = {n['id']: 0 for n in nodes}
    for edge in edges:
        target = edge['target']
        if target in in_degree:
            in_degree[target] += 1
        else:
            in_degree[target] = 1

        
    # 确定起点
    if start_node_id:
        root_nodes = [start_node_id]
        if start_node_id not in state.node_map:
            raise ValueError(f"架构校验异常: 指定的起步节点 {start_node_id} 不存在。")
    else:
        # 取出所有入度为 0 的节点
        potential_roots = [n_id for n_id, deg in in_degree.items() if deg == 0]
        
        # 过滤：只有类型为“触发”的节点，或者指定类型的节点，才允许作为默认的起步节点
        # 如果一个普通节点（比如“操作”或“输出”节点）没有被连线，我们不应该把它当做流水线的起点去执行
        root_nodes = []
        for n_id in potential_roots:
            node_type = state.node_map[n_id].get('data', {}).get('type', '')
            has_outgoing = n_id in state.outgoing_edges and len(state.outgoing_edges[n_id]) > 0
            
            # 如果节点是一个孤岛（没有任何入边也没有出边），我们忽略它（除非特殊需求，这里默认不执行没有连线的孤岛节点）
            if not has_outgoing:
                continue
                
            if node_type == '触发':
                root_nodes.append(n_id)
            elif has_outgoing:
                 # 如果它不是触发节点，但它有出边（用户刻意把一个节点当做起点连向后方），我们也允许它执行，以保持灵活性
                 root_nodes.append(n_id)
            
    if not root_nodes:
        raise ValueError("架构校验异常: 未检测到任何合法的上游触发或起步节点，流水线死锁或为空画布。")
        
    await log_queue.put({
        "type": "log", "level": "调度引擎", "color": "\x1b[1;36m",
        "message": f"[DAG] 分析完成！发现 {len(root_nodes)} 个主干起源点，即将应用动态 Actor 路由模式裂变执行...",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    # The recursive function to execute a node and dispatch its children
    async def execute_node(node_id: str, context: PipelineContext):
        if node_id not in state.node_map:
            return
            
        node = state.node_map[node_id]
        label = node['data']['label']
        config = node['data'].get('config', {})
        
        start_time = time.time()
        executor = NODE_EXECUTORS.get(label)
        
        # --- (1) 执行算子 ---
        if getattr(executor, "__name__", "") == "execute_burst_concurrency":
            # For burst concurrency, we pass args (might need cleanup later)
            result = await executor(config, context, state.nodes, state.edges, 0)
        elif executor:
            result = await executor(config, context)
        else:
            result = context
            
        if result is None:
            # 熔断机制：节点返回 None 表示终止该链路分支的扩散
            return
            
        if not isinstance(result, list):
            result = [result]
            
        if executor:
            duration = time.time() - start_time
            if label not in ["系统定时节拍器", "任务调度队列"]:
                await log_queue.put({
                    "type": "log", "level": "算力", "color": "\x1b[36m",
                    "message": f"[Trace: {context.trace_id}] {label} 完成 | 耗时: {duration:.3f}s | 输出批次: {len(result)}",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
        else:
            await log_queue.put({
                "type": "log", "level": "警告", "color": "\x1b[33m",
                "message": f"[Trace: {context.trace_id}] 通用旁路节点: {label} (直通转发)",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            await asyncio.sleep(0.3)
            
        # --- (2) 路由分发 (动态寻路) ---
        next_tasks = []
        for ctx in result:
            chosen_handle = getattr(ctx, "route_path", None)
            
            for target_id, handle in state.outgoing_edges.get(node_id, []):
                if chosen_handle is None or handle == chosen_handle:
                    # ❗核心：必须深克隆/浅克隆传递给下一个节点，彻底阻隔平行分支的数据污染！
                    fork_context = ctx.clone()
                    if hasattr(fork_context, "route_path"):
                        fork_context.route_path = None
                    next_tasks.append(asyncio.create_task(execute_node(target_id, fork_context)))
                    
            # 节点出站后重置本分支状态
            if hasattr(ctx, "route_path"):
                ctx.route_path = None
            
        # 并发执行所有下游支线任务
        if next_tasks:
            await asyncio.gather(*next_tasks)

    # 从所有的 Root 节点开始并发启动图执行
    root_tasks = []
    for root_id in root_nodes:
        root_tasks.append(asyncio.create_task(execute_node(root_id, initial_context.clone())))
        
    await asyncio.gather(*root_tasks)
    
    await log_queue.put({
        "type": "log", "level": "系统", "color": "\x1b[1;30m",
        "message": "主干链路与所有的 Actor 扇出执行已归聚。本轮生命周期执行圆满闭环。",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
