import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  MarkerType,
  Handle,
  Position,
  useReactFlow,
  getOutgoers,
  reconnectEdge,
  MiniMap,
  PanOnScrollMode,
} from '@xyflow/react';
// @ts-ignore
import '@xyflow/react/dist/style.css';
import { Bot, Link, Send, Shield, Globe, Zap, Cpu, Server, Database, Code, Activity, Clock, Fingerprint, Timer, Monitor, Filter, MousePointer2, X, ChevronRight, Info, Brain, Scan, Bell, Crosshair, List, FileJson, Unlock, ShieldAlert, Smartphone, Radio, TestTube, PauseCircle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const initialNodes: Node[] = [
  { id: 'start', type: 'custom', position: { x: 50, y: 150 }, measured: { width: 160, height: 40 }, data: { label: '系统定时节拍器', type: '触发' } },
  { id: 'browser', type: 'custom', position: { x: 300, y: 150 }, measured: { width: 160, height: 40 }, data: { label: 'Playwright 拟真沙箱', type: '操作' } },
  { id: 'ai-guard', type: 'custom', position: { x: 550, y: 150 }, measured: { width: 160, height: 40 }, data: { label: '大模型智能萃取与清洗', type: '智能' } },
  { id: 'burst', type: 'custom', position: { x: 800, y: 150 }, measured: { width: 160, height: 40 }, data: { label: '脉冲并发请求', type: '操作' } },
  { id: 'notify', type: 'custom', position: { x: 1050, y: 150 }, measured: { width: 160, height: 40 }, data: { label: '即时状态分发', type: '输出' } },
];

const NodeDetailsConfig: Record<string, any> = {
  start: { desc: "定义工作流的启动节拍，基于时间周期精准触发执行流。", params: ["Cron: 0/5 * * * *", "Autostart: True"], status: "Active", dependencies: ["AI Scheduler Engine"] },
  "browser": { desc: "拉起隔离无头浏览器渲染 DOM 并注入隐蔽探针，规避反抗风险。", params: ["Stealth: Enabled", "Proxy: Residential IP"], status: "Ready", dependencies: ["Puppeteer Stealth"] },
  "ai-guard": { desc: "AI作为安全层与翻译官，智能理解网页 DOM 意图，防止规则失效导致错乱。提供验证码视觉辅助解码。", params: ["Model: Gemini 1.5 Pro", "Mode: Guard"], status: "Ready", dependencies: ["Vision API", "LLM Guardrail"] },
  "burst": { desc: "将 AI 的指令与断言转化为极速的机器操作网络动作，高并发突破限流防御执行抢购与秒杀。", params: ["Concurrency: 50", "Method: HTTP2 Multiplex"], status: "Ready", dependencies: ["Async Reactor"] },
  "notify": { desc: "将成功链路的战果一键多通道触达！", params: ["Target: Webhook, SMS", "Format: JSON"], status: "Ready", dependencies: ["Notifier Service"] }
};

const edgeOpts = {
  type: 'smoothstep',
  animated: true,
  style: { strokeWidth: 3, strokeOpacity: 0.8 },
  interactionWidth: 25
};

export const initialEdges: Edge[] = [
  { id: 'e-1', source: 'start', target: 'browser', ...edgeOpts, style: { stroke: '#10b981', strokeWidth: 3 } },
  { id: 'e-2', source: 'browser', target: 'ai-guard', ...edgeOpts, style: { stroke: '#3b82f6', strokeWidth: 3 } },
  { id: 'e-3', source: 'ai-guard', target: 'burst', ...edgeOpts, style: { stroke: '#a855f7', strokeWidth: 3 } },
  { id: 'e-4', source: 'burst', target: 'notify', ...edgeOpts, style: { stroke: '#3b82f6', strokeWidth: 3 } },
];

const MENU_CATEGORIES = [
  {
    id: 'trigger', name: '信号触发 (Trigger)', type: '触发',
    desc: '流水线的源头。决定爬虫什么时候开始工作。必须放在最前面。',
    items: [
      { label: '系统定时节拍器', icon: <Clock className="w-3 h-3"/> },
      { label: '外部接口 WebHook 触发', icon: <Activity className="w-3 h-3"/> },
      { label: '任务调度队列', icon: <List className="w-3 h-3"/> }
    ]
  },
  {
    id: 'anti_bot', name: '隐匿与对抗 (Evasion)', type: '对抗',
    desc: '伪装自己，防封IP和封号。推荐连接在【触发】之后、【行动】之前。',
    items: [
      { label: '指纹与 Headers 随机化', icon: <Fingerprint className="w-3 h-3"/> },
      { label: '代理 IP 调度池', icon: <Shield className="w-3 h-3"/> },
      { label: '会话身份驻留池', icon: <Database className="w-3 h-3"/> },
      { label: '动态载荷智能剥壳', icon: <Unlock className="w-3 h-3"/> },
      { label: 'AI 隐匿具身雷达', icon: <Bot className="w-3 h-3"/> },
      { label: '验证码视觉对抗突破', icon: <Shield className="w-3 h-3"/> }
    ]
  },
  {
    id: 'control', name: '流控与调度 (Control Flow)', type: '网关',
    desc: '用于条件分支、循环、熔断降级等复杂的 DAG 链路调度。',
    items: [
      { label: 'HTTP 状态码路由', icon: <Filter className="w-3 h-3"/> },
      { label: '智能风控路由哨兵', icon: <PauseCircle className="w-3 h-3"/> },
      { label: '人工战术挂起断点', icon: <PauseCircle className="w-3 h-3"/> }
    ]
  },
  {
    id: 'interact', name: '侦察与行动 (Action)', type: '操作',
    desc: '实际去访问网站、操作浏览器的核心节点。必须放置在业务流的主干。',
    items: [
      { label: '轻量静态 HTTP 抓取', icon: <Globe className="w-3 h-3"/> },
      { label: 'Playwright 拟真沙箱', icon: <Monitor className="w-3 h-3"/> },
      
      { label: '脉冲并发请求', icon: <Zap className="w-3 h-3"/> }
    ]
  },
  {
    id: 'logic', name: '提纯与解析 (Extraction)', type: '智能',
    desc: '将浏览器里乱七八糟的网页（HTML）转换成干净的结构化数据（JSON）。必需接在【行动】节点后。',
    items: [
      { label: '数据读取与加载', icon: <FileJson className="w-3 h-3"/> },
      { label: '大模型智能萃取与清洗', icon: <Brain className="w-3 h-3"/> },
      { label: '特征与 DOM 萃取', icon: <Code className="w-3 h-3"/> },
      { label: '万能数据清洗转换', icon: <Filter className="w-3 h-3"/> },
      { label: '机器学习数据清洗', icon: <TestTube className="w-3 h-3"/> }
    ]
  },
  {
    id: 'output', name: '数据归宿 (Delivery)', type: '输出',
    desc: '将清洗好的数据保存到数据库、文件，或者通知给其他系统。一般位于最后端。',
    items: [
      { label: '持久化知识库', icon: <Database className="w-3 h-3"/> },
      { label: '文件与多媒体保存', icon: <Filter className="w-3 h-3"/> },
      { label: '即时状态分发', icon: <Bell className="w-3 h-3"/> },
      { label: '子任务下发中心', icon: <Send className="w-3 h-3"/> }
    ]
  }
];


export const getIconForLabel = (label: string, className = "w-4 h-4") => {
  switch (label) {
    case '系统定时节拍器': return <Clock className={className} />;
    case '外部接口 WebHook 触发': return <Activity className={className} />;
    case '任务调度队列': return <List className={className} />;
    case '数据读取与加载': return <FileJson className={className} />;
    case '指纹与 Headers 随机化': return <Fingerprint className={className} />;
    case '代理 IP 调度池': return <Shield className={className} />;
    case '会话身份驻留池': return <Database className={className} />;
    case '动态载荷智能剥壳': return <Unlock className={className} />;
    case 'HTTP 状态码路由': return <Filter className={className} />;
    case '智能风控路由哨兵': return <PauseCircle className={className} />;
    case '人工战术挂起断点': return <PauseCircle className={className} />;
    case '轻量静态 HTTP 抓取': return <Globe className={className} />;
    case 'Playwright 拟真沙箱': return <Monitor className={className} />;
    case '验证码视觉对抗突破': return <Shield className={className} />;
    case '脉冲并发请求': return <Zap className={className} />;
    case '大模型智能萃取与清洗': return <Brain className={className} />;
    case 'AI 隐匿具身雷达': return <Bot className={className} />;
    case '特征与 DOM 萃取': return <Code className={className} />;
    case '万能数据清洗转换': return <Filter className={className} />;
    case '机器学习数据清洗': return <TestTube className={className} />;
    case '持久化知识库': return <Database className={className} />;
    case '文件与多媒体保存': return <Filter className={className} />;
    case '即时状态分发': return <Bell className={className} />;
    case '子任务下发中心': return <Send className={className} />;
    default: return <Server className={className} />;
  }
};

// Custom Node Component
// Custom Node Component (Neural Inspired)
const CustomNode = ({ data, selected, id }: { data: any, selected?: boolean, id: string }) => {
  const getTheme = (type: string) => {
    switch(type) {
      case '触发': return { c: 'emerald', hex: '#10b981', light: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
      case '对抗': return { c: 'red', hex: '#ef4444', light: 'bg-red-500/10', border: 'border-red-500/30' };
      case '操作': return { c: 'blue', hex: '#3b82f6', light: 'bg-blue-500/10', border: 'border-blue-500/30' };
      case '智能': return { c: 'purple', hex: '#a855f7', light: 'bg-purple-500/10', border: 'border-purple-500/30' };
      case '输出': return { c: 'amber', hex: '#f59e0b', light: 'bg-amber-500/10', border: 'border-amber-500/30' };
      case '网关': return { c: 'indigo', hex: '#6366f1', light: 'bg-indigo-500/10', border: 'border-indigo-500/30' };
      default: return { c: 'zinc', hex: '#71717a', light: 'bg-zinc-500/10', border: 'border-zinc-500/30' };
    }
  };

  const theme = getTheme(data.type);
  const isStartNode = data.type === '触发';
  const isEndNode = data.type === '输出';

  return (
    <div className={`relative flex flex-col w-[260px] rounded-2xl transition-all duration-300 ${selected ? 'z-50 scale-[1.02]' : 'z-10'}
      bg-[#0c0c0e] border shadow-2xl backdrop-blur-xl shrink-0 group ${selected ? 'border-zinc-500/50 shadow-[0_0_50px_rgba(0,0,0,0.8)]' : 'border-white/5 shadow-[0_20px_40px_rgba(0,0,0,0.4)] hover:border-white/10'}`}>
      
      {/* Top Accent Line */}
      <div className="absolute top-[-1px] left-[10%] right-[10%] h-[2px] rounded-full opacity-80" style={{ backgroundColor: theme.hex, filter: `drop-shadow(0 0 8px ${theme.hex})` }}></div>

      {/* Header */}
      <div className="flex items-start gap-3.5 p-4 pb-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${theme.light} ${theme.border} border ring-1 ring-black/80 shadow-inner relative overflow-hidden group-hover:scale-110 transition-transform duration-500`}>
          <div className="absolute inset-0 opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-50" style={{ backgroundColor: theme.hex }}></div>
          <div className="text-current relative z-10 drop-shadow-lg" style={{ color: theme.hex }}>
            {getIconForLabel(data.label, "w-5 h-5")}
          </div>
        </div>
        
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] uppercase tracking-[0.18em] font-mono opacity-90 font-bold" style={{ color: theme.hex }}>{data.type}</span>
            <span className="text-[9px] text-zinc-500/80 font-mono tracking-wider font-semibold">#{id.split('_').pop()?.slice(-4) || 'CORE'}</span>
          </div>
          <div className="font-semibold text-sm leading-tight truncate text-zinc-100 tracking-wide font-sans">{data.label}</div>
        </div>
      </div>

      {/* Status Bar / Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0c0c0e]/60 ring-1 ring-white/5 border-t border-white/5 rounded-b-2xl mt-1">
         <div className="flex items-center gap-2 opacity-80 pl-1">
           <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: theme.hex, boxShadow: `0 0 10px ${theme.hex}` }}></div>
           <span className="text-[9.5px] text-zinc-400 uppercase tracking-widest font-mono font-medium">Standby</span>
         </div>
         {data.config && Object.keys(data.config).length > 0 && (
           <div className="flex gap-1.5">
             <span className="text-[9.5px] text-zinc-500/80 bg-white/5 px-1.5 py-0.5 rounded-md font-mono border border-white/5 inline-block text-center shadow-inner">
               {Object.keys(data.config).length} CFG
             </span>
           </div>
         )}
      </div>
      
      {/* Input Handle (Left) */}
      {!isStartNode && (
        <Handle 
          type="target" 
          position={Position.Left} 
          className="w-3.5 h-3.5 rounded-full border-2 bg-zinc-900 !border-l-0 shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-transform hover:scale-125"
          style={{ borderColor: theme.hex, borderRadius: '0 4px 4px 0', left: '-1px' }}
        />
      )}
      
      {/* Output Handles (Right) */}
      {!isEndNode && (
        data.label === 'HTTP 状态码路由' || data.label === '智能风控路由哨兵' ? (
          // Router Has Two Outputs
          <>
            <Handle 
              type="source" 
              position={Position.Right} 
              id={data.label === '智能风控路由哨兵' ? 'main' : 'success'} 
              style={{ top: '35%', background: '#10b981', borderColor: '#10b981', borderRadius: '4px 0 0 4px', right: '-1px' }} 
              className="w-3.5 h-3.5 border-2 !border-r-0 shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-transform hover:scale-125" 
            />
            <Handle 
              type="source" 
              position={Position.Right} 
              id={data.label === '智能风控路由哨兵' ? 'evade' : 'fallback'} 
              style={{ top: '65%', background: '#ef4444', borderColor: '#ef4444', borderRadius: '4px 0 0 4px', right: '-1px' }} 
              className="w-3.5 h-3.5 border-2 !border-r-0 shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-transform hover:scale-125" 
            />
          </>
        ) : (
          // Standard Single Output
          <Handle 
            type="source" 
            position={Position.Right} 
            className="w-3.5 h-3.5 rounded border-2 bg-zinc-900 border-zinc-600 !border-r-0 shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-transform hover:scale-125"
            style={{ borderColor: theme.hex, borderRadius: '4px 0 0 4px', right: '-1px' }}
          />
        )
      )}
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

export default function FlowEditor({ 
  isRunning,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  setNodes,
  setEdges
}: { 
  isRunning: boolean;
  nodes: Node[];
  edges: Edge[];
  onNodesChange: any;
  onEdgesChange: any;
  onConnect: any;
  setNodes: any;
  setEdges: any;
}) {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const { getNode, getEdges: getEdgesFn, screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [menuState, setMenuState] = useState<{ show: boolean, x: number, y: number, top: number, left: number, isNearRight: boolean, isNearBottom: boolean } | null>(null);
  const edgeReconnectSuccessful = useRef(true);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    edgeReconnectSuccessful.current = true;
    setEdges((els: Edge[]) => reconnectEdge(oldEdge, newConnection, els));
  }, [setEdges]);

  const onReconnectEnd = useCallback((_: MouseEvent | TouchEvent, edge: Edge) => {
    if (!edgeReconnectSuccessful.current) {
      setEdges((eds: Edge[]) => eds.filter((e) => e.id !== edge.id));
    }
  }, [setEdges]);

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      
      if (!wrapperRef.current) return;
      const bounds = wrapperRef.current.getBoundingClientRect();
      
      const MENU_WIDTH = 192; // 48 * 4px
      const SUBMENU_WIDTH = 224; // 56 * 4px
      const MENU_HEIGHT = 280; // estimated height
      
      let top = event.clientY - bounds.top;
      let left = event.clientX - bounds.left;
      let isNearRight = false;
      let isNearBottom = false;

      // Determine if submenu should open to the left instead of right
      if (left + MENU_WIDTH + SUBMENU_WIDTH > bounds.width) {
        if (left - SUBMENU_WIDTH >= 0) {
          isNearRight = true;
        } else {
          left = bounds.width - MENU_WIDTH - SUBMENU_WIDTH - 20;
        }
      }
      
      // Basic bounds check for main menu
      if (left + MENU_WIDTH > bounds.width) {
        left = bounds.width - MENU_WIDTH - 10;
      }
      if (left < 10) left = 10;

      if (top + MENU_HEIGHT > bounds.height) {
        top = bounds.height - MENU_HEIGHT - 10;
      }
      if (top < 10) top = 10;
      
      if (event.clientY - bounds.top + MENU_HEIGHT/2 > bounds.height) {
        isNearBottom = true;
      }

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      
      setMenuState({ show: true, x: position.x, y: position.y, top, left, isNearRight, isNearBottom });
    },
    [screenToFlowPosition]
  );

  const onPaneClick = useCallback(() => {
    setMenuState(null);
    setSelectedNode(null);
  }, []);

  const addNode = (typeLabel: string, nodeType: string, icon: any) => {
    if (!menuState) return;
    const newNode: Node = {
      id: `node_${Date.now()}`,
      type: 'custom',
      position: { x: menuState.x, y: menuState.y },
      measured: { width: 160, height: 40 },
      data: { 
        label: typeLabel, 
        type: nodeType, 
        
        config: {}
      },
    };
    setNodes((nds: Node[]) => nds.concat(newNode));
    setMenuState(null);
    setSelectedNode(newNode);
  };

  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      // 1. Prevent self loop
      if (connection.source === connection.target) return false;

      const targetNode = getNode(connection.target);
      const sourceNode = getNode(connection.source);

      if (!targetNode || !sourceNode) return false;

      // 2. Prevent cycle loop
      const hasCycle = (node: Node, visited = new Set()) => {
        if (visited.has(node.id)) return false;
        visited.add(node.id);

        for (const outgoer of getOutgoers(node, nodes, getEdgesFn())) {
          if (outgoer.id === connection.source) return true;
          if (hasCycle(outgoer, visited)) return true;
        }
        return false;
      };

      if (hasCycle(targetNode)) {
        console.warn('连线失败：检测到死循环。');
        return false;
      }

      return true;
    },
    [getNode, getEdgesFn, nodes]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const updateNodeConfig = useCallback((nodeId: string, key: string, value: any) => {
    setNodes((nds: Node[]) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              config: {
                ...(node.data.config as Record<string, any>),
                [key]: value,
              },
            },
          };
        }
        return node;
      })
    );
    
    setSelectedNode((prev) => {
      if (prev && prev.id === nodeId) {
        return {
          ...prev,
          data: {
            ...prev.data,
            config: { ...(prev.data.config as Record<string, any>), [key]: value }
          }
        };
      }
      return prev;
    });
  }, [setNodes]);

  const onEdgeDoubleClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    setEdges((eds: Edge[]) => eds.filter((e: Edge) => e.id !== edge.id));
  }, [setEdges]);

  useEffect(() => {
    if (selectedNode) {
      if (!nodes.some(n => n.id === selectedNode.id)) {
        setSelectedNode(null);
      }
    }
  }, [nodes, selectedNode]);

  useEffect(() => {
    // Update edge animation speed based on isRunning
    setEdges((eds: Edge[]) => eds.map((e: Edge) => ({
      ...e,
      animated: isRunning,
      style: { ...e.style, animationDuration: isRunning ? '0.5s' : '2s' }
    })));
  }, [isRunning, setEdges]);

  // Derived details
  const configInfo = selectedNode 
    ? (NodeDetailsConfig[selectedNode.id] || { 
        desc: "已实例化的自定义模块，当前处于总线挂起状态待接入主动力回路。", 
        params: [], 
        status: "Standby" 
      }) 
    : null;

  return (
    <div ref={wrapperRef} className="w-full h-full relative overflow-hidden bg-[#0a0a0c] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.05),rgba(255,255,255,0))]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={onNodeClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={onPaneClick}
        deleteKeyCode={['Backspace', 'Delete']}
        selectionKeyCode="Shift"
        multiSelectionKeyCode="Control"
        nodeTypes={nodeTypes}
        panOnScroll={true}
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnDoubleClick={false}
        minZoom={0.2}
        maxZoom={2}
        elevateEdgesOnSelect={true}
        defaultEdgeOptions={{ interactionWidth: 25, type: 'smoothstep' }}
        fitView
        fitViewOptions={{ padding: 0.3, minZoom: 0.5, maxZoom: 1.2 }}
        className="touch-none"
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1.5} color="#3f3f46" />
        <Controls className="!bg-[#0c0c0e]/90 !border-white/5 !fill-zinc-400 shadow-[0_10px_20px_rgba(0,0,0,0.5)] rounded-xl overflow-hidden ring-1 ring-white/10 backdrop-blur-md" />
        <MiniMap 
          className="!bg-[#0c0c0e]/80 backdrop-blur-xl !border-none !rounded-2xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.8)] ring-1 ring-white/10 m-6"
          maskColor="rgba(0,0,0,0.7)"
          nodeColor={(n) => {
            if (n.data.type === '触发') return '#10b981';
            if (n.data.type === '操作') return '#3b82f6';
            if (n.data.type === '智能') return '#a855f7';
            if (n.data.type === '输出') return '#f59e0b';
            return '#71717a';
          }}
        />
      </ReactFlow>
      
      {/* Overlay Status */}
      <div className="absolute top-8 left-8 pointer-events-none z-10 flex flex-col gap-2">
        <div className="flex items-center gap-3 bg-[#0c0c0e]/80 w-fit px-4 py-1.5 rounded-full ring-1 ring-emerald-500/20 backdrop-blur-xl shadow-[0_10px_20px_rgba(0,0,0,0.5)] border border-emerald-500/10">
          <Scan className="w-4 h-4 text-emerald-400" />
          <h3 className="font-mono text-[11px] text-emerald-400 tracking-[0.2em] uppercase font-bold text-shadow-sm">Arachne V-Combat Engine</h3>
        </div>
        
        <div className={`text-[12px] font-mono tracking-wider flex items-center gap-3.5 bg-[#0c0c0e]/95 w-fit px-5 py-3 rounded-2xl ring-1 ring-white/10 backdrop-blur-2xl shadow-[0_20px_40px_rgba(0,0,0,0.7)] border border-white/5 ${isRunning ? 'text-emerald-400' : 'text-zinc-400'}`}>
           <div className="relative flex items-center justify-center w-4 h-4">
             <div className={`absolute inset-0 rounded-full ${isRunning ? 'bg-emerald-500/30 animate-ping' : 'bg-zinc-600/30'}`}></div>
             <div className={`w-2.5 h-2.5 rounded-full relative z-10 ${isRunning ? 'bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,1)]' : 'bg-zinc-600 shadow-inner'}`}></div>
           </div>
           <div className="flex flex-col">
             <span className="text-[9px] text-zinc-500 mb-0.5">SYSTEM STATUS</span>
             <span className="font-bold">{isRunning ? 'CORE ENGAGING...' : 'IDLE / STANDBY'}</span>
           </div>
        </div>
      </div>

      {/* Context Menu */}
      <AnimatePresence>
        {menuState && menuState.show && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 5 }}
            transition={{ duration: 0.15, type: 'spring', bounce: 0 }}
            className="absolute z-50 bg-[#0c0c0e]/95 ring-1 ring-white/10 rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.9)] backdrop-blur-3xl w-60 flex flex-col font-sans overflow-visible border border-white/5"
            style={{ top: menuState.top, left: menuState.left }}
          >
            <div className="px-4 py-3.5 bg-gradient-to-b from-white/[0.04] to-transparent border-b border-white/5 text-zinc-200 font-bold text-[13px] tracking-wide rounded-t-2xl flex items-center justify-between">
              <span className="flex items-center gap-2"><Scan className="w-4 h-4 text-emerald-500" /> Insert Node</span>
              <kbd className="font-mono text-[9px] bg-[#0c0c0e]/90 ring-1 ring-white/5 shadow-inner backdrop-blur-md ring-1 ring-white/10 text-zinc-400 px-1.5 py-0.5 rounded shell-shadow">^ A</kbd>
            </div>
            <div className="p-1.5 flex flex-col gap-0.5 relative">
              {MENU_CATEGORIES.map(category => (
                <div key={category.id} className="relative group/category">
                  <button className="w-full text-left px-3 py-2.5 hover:bg-white/5 hover:text-white text-zinc-400 rounded-xl transition-all flex items-center justify-between text-[13px] font-medium group">
                    <span className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 group-hover:bg-emerald-500 transition-all duration-300 shadow-[0_0_8px_rgba(16,185,129,0)] group-hover:shadow-[0_0_12px_rgba(16,185,129,0.8)] group-hover:scale-125"></div>
                      <span className="group-hover:translate-x-0.5 transition-transform">{category.name}</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-emerald-500/50 transition-colors" />
                  </button>
                  {/* Category Submenu form bridge */}
                  <div className={`absolute ${menuState.isNearBottom ? 'bottom-0' : 'top-0'} z-50 ${menuState.isNearRight ? 'right-full pr-2' : 'left-full pl-2'} invisible opacity-0 group-hover/category:visible group-hover/category:opacity-100 transition-all duration-300 delay-150 group-hover/category:delay-0 origin-top-left group-hover/category:translate-x-0 -translate-x-2`}>
                    <div className="bg-[#0c0c0e]/95 ring-1 ring-white/10 border border-white/5 rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.9)] backdrop-blur-3xl w-64 flex flex-col p-1.5 gap-1 font-sans max-h-[60vh] overflow-y-auto custom-scrollbar">
                      {category.desc && (
                        <div className="px-3 py-2.5 mb-1.5 text-[11px] text-zinc-400/80 border-b border-white/5 leading-relaxed bg-white/[0.02] rounded-t-xl font-medium">
                          {category.desc}
                        </div>
                      )}
                      <div className="flex flex-col gap-0.5">
                      {category.items.map(item => (
                        <button 
                          key={item.label} 
                          onClick={() => addNode(item.label, category.type, item.icon)} 
                          className="w-full text-left px-3 py-2.5 hover:bg-[#10b981]/10 hover:text-white text-zinc-300 rounded-xl transition-colors flex items-center gap-3 text-[13px] font-medium group"
                        >
                          <span className="text-zinc-500 group-hover:text-emerald-400 group-hover:scale-110 transition-all">{item.icon}</span> 
                          {item.label}
                        </button>
                      ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Node Details Panel */}
      <AnimatePresence>
        {selectedNode && configInfo && (
          <motion.div 
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-6 right-6 bottom-6 w-[420px] bg-[#0c0c0e]/95 ring-1 ring-white/10 rounded-3xl shadow-[0_30px_100px_rgba(0,0,0,0.9)] backdrop-blur-3xl flex flex-col z-20 overflow-hidden"
          >
            {/* Header */}
          <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 shrink-0 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div>
              <span className="text-[13px] tracking-wide font-semibold text-zinc-200">NODE CONFIGURATION</span>
            </div>
            <button 
              onClick={() => setSelectedNode(null)} 
              className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full transition-all text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-8 custom-scrollbar">
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <h2 className="text-xl font-bold text-white tracking-tight leading-tight flex items-center gap-2">
                  {selectedNode.data.label as string}
                </h2>
                <span className="text-xs px-2.5 py-1 rounded-md ring-1 ring-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold tracking-widest shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  {configInfo.status}
                </span>
              </div>
              <p className="text-[13px] text-zinc-400 leading-relaxed font-sans opacity-90">
                {configInfo.desc}
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="text-xs font-display text-zinc-500 uppercase tracking-widest font-bold flex items-center font-display gap-2">
                <div className="h-px bg-zinc-800 flex-1"></div>
                PARAMETERS
                <div className="h-px bg-zinc-800 flex-1"></div>
              </h3>
              <div className="bg-[#121214]/50 ring-1 ring-white/5 rounded-2xl p-5 flex flex-col gap-5 relative shadow-inner">
                
                {/* Node Dependencies Hover Area */}
                {configInfo.dependencies && configInfo.dependencies.length > 0 && (
                  <div className="absolute top-3 right-3 group cursor-help">
                    <div className="flex items-center gap-1.5 bg-zinc-900/80 px-2.5 py-1.5 rounded-full text-xs text-zinc-400 hover:text-emerald-400 ring-1 ring-white/5 hover:bg-zinc-800 transition-all shadow-sm">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-medium text-xs">{configInfo.dependencies.length}</span>
                    </div>
                    {/* Tooltip Content */}
                    <div className="hidden group-hover:flex absolute right-0 top-full mt-2 w-max max-w-[200px] flex-col gap-1.5 p-3 bg-[#060608]/95 ring-1 ring-white/10 shadow-2xl rounded-xl z-50 backdrop-blur-xl">
                      <span className="text-xs text-zinc-400 uppercase tracking-widest mb-1 font-medium font-sans">前置依赖包清单</span>
                      {configInfo.dependencies.map((dep: string) => (
                        <div key={dep} className="text-[11px] bg-white/5 font-sans text-zinc-300 px-2 py-1.5 rounded-md ring-1 ring-white/5 truncate shadow-sm">
                          {dep}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedNode.data.label === '脉冲并发请求' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block flex justify-between">
                        <span>并发协程数 (Workers)</span>
                        <span className="text-emerald-500">{(selectedNode.data.config as any)?.maxWorkers || 10}</span>
                      </label>
                      <input 
                        type="range" 
                        min="1" max="1000" step="1"
                        value={(selectedNode.data.config as any)?.maxWorkers || 10}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'maxWorkers', parseInt(e.target.value))}
                        className="accent-emerald-500"
                      />
                    </div>
                  </>
                )}

                {/* 轻量静态 HTTP 抓取 - 专属配置面板 */}
                {selectedNode.data.label === '轻量静态 HTTP 抓取' && (
                  <>
                    {/* 基础设定区 */}
                    <div className="flex gap-2">
                      <div className="flex flex-col gap-1 w-1/3">
                        <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">Method</label>
                        <select 
                          value={(selectedNode.data.config as any)?.method || 'GET'}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'method', e.target.value)}
                          className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-sans cursor-pointer shadow-inner appearance-none"
                        >
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                          <option value="HEAD">HEAD</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block -ml-1">Target URL</label>
                        <input 
                          type="text" 
                          placeholder="留空则读取上游，或用 {{id}}"
                          value={(selectedNode.data.config as any)?.url || ''}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'url', e.target.value)}
                          className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-purple-400 text-xs rounded p-1.5 outline-none focus:border-purple-500 transition-colors font-mono h-9"
                        />
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1 mt-2">
                        <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">要拼接的上游参数名 (选填，分号隔开)</label>
                        <input 
                          type="text"
                          placeholder='例如: id; keyword; page'
                          value={(selectedNode.data.config as any)?.pickParams || ''}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'pickParams', e.target.value)}
                          className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors font-sans"
                        />
                    </div>
                    
                    <div className="flex flex-col gap-1 mt-2">
                        <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">附加参数 (仅合并，不覆盖上游的同名数据)</label>
                        <textarea 
                          rows={2}
                          placeholder='例如: {"page": 1, "type": "news"}'
                          value={(selectedNode.data.config as any)?.params || ''}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'params', e.target.value)}
                          className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors font-mono"
                        />
                    </div>
                    
                    <div className="text-[9px] text-zinc-500 mt-2 bg-blue-500/10 p-2 border border-blue-500/20 rounded leading-relaxed">
                      💡 <b>数据源说明:</b><br/>
                      • <b>指定固定链接：</b>例如 <code>https://...</code>。<br/>
                      • <b>参数模板化：</b>您可以使用 <code>{`{{变量名}}`}</code> 来将上游传来的字典拼接成 URL (例如 <code>https://.../api?id={`{{id}}`}</code>)。<br/>
                      • <b>完全留空：</b>自动获取上游任务派发过来的专属原生链接！<br/>
                      • <b>智能附加参数拼接：</b>只有当您显式指定了<b>要拼接的上游参数名</b>，系统才会自动将其拼接到 URL (GET) 或 Body (POST) 中。<b>附加参数</b>也会一并安全合并。
                    </div>

                    {/* 性能调整区 */}
                    <div className="flex gap-2 mt-2">
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block flex justify-between">
                          <span>超时 (Timeout)</span>
                          <span className="text-zinc-400">{(selectedNode.data.config as any)?.timeout || 10}s</span>
                        </label>
                        <input 
                          type="range" min="1" max="60" step="1"
                          value={(selectedNode.data.config as any)?.timeout || 10}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'timeout', parseInt(e.target.value))}
                          className="accent-emerald-500"
                        />
                      </div>
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block flex justify-between">
                          <span>重试 (Retries)</span>
                          <span className="text-zinc-400">{(selectedNode.data.config as any)?.retries || 0}</span>
                        </label>
                        <input 
                          type="range" min="0" max="5" step="1"
                          value={(selectedNode.data.config as any)?.retries || 0}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'retries', parseInt(e.target.value))}
                          className="accent-emerald-500"
                        />
                      </div>
                    </div>

                    {/* 高级选项 (Headers & JA3) */}
                    <div className="flex flex-col gap-1 mt-2">
                       <label className="text-xs text-zinc-500 font-mono">底层 JA3 握手特征伪装 (cffi-impersonate)</label>
                       <select 
                         value={(selectedNode.data.config as any)?.impersonate || 'chrome120'}
                         onChange={(e) => updateNodeConfig(selectedNode.id, 'impersonate', e.target.value)}
                         className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded p-1.5 outline-none focus:border-emerald-500 transition-colors h-8"
                       >
                         <option value="chrome120">Chrome 120 (Windows)</option>
                         <option value="chrome110">Chrome 110 (Windows)</option>
                         <option value="safari15_5">Safari 15.5 (macOS)</option>
                         <option value="edge101">Edge 101 (Windows)</option>
                       </select>
                    </div>

                    <div className="flex flex-col gap-1 mt-2">
                      <label className="text-xs text-zinc-500 font-mono">自定义 Headers (JSON)</label>
                      <textarea 
                        placeholder='{"Authorization": "Bearer token..."}'
                        value={(selectedNode.data.config as any)?.headers || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'headers', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-zinc-300 font-mono text-xs rounded p-2 outline-none h-16 resize-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </>
                )}

                {/* 代理 IP 调度池 - 专属配置面板 */}
                {selectedNode.data.label === '代理 IP 调度池' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">智能代理源</label>
                      <textarea 
                        className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono min-h-[100px] resize-y placeholder:text-zinc-600"
                        placeholder={'输入代理API链接 (http://api.proxy...)\n或直接输入静态IP (ip:port)\n支持多行，系统会自动侦测识别！'}
                        value={(selectedNode.data.config as any)?.smartProxyInput || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'smartProxyInput', e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-3 bg-[#0c0c0e]/90 ring-1 ring-white/5 shadow-inner backdrop-blur-md p-2 rounded">
                       <label className="text-sm text-zinc-300">调度策略</label>
                       <select 
                        value={(selectedNode.data.config as any)?.strategyMode || 'sequence'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'strategyMode', e.target.value)}
                        className="bg-transparent text-white text-xs outline-none text-right cursor-pointer"
                      >
                        <option value="sequence">动态轮询 (每次独立提取新IP)</option>
                        <option value="global">全局高匿 (提取一次后全局复用)</option>
                      </select>
                    </div>
                  </>
                )}

                {/* 特征与 DOM 萃取 - 专属配置面板 */}
                {selectedNode.data.label === '特征与 DOM 萃取' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex bg-[#0c0c0e]/80 p-1 rounded-lg border border-white/5">
                      <button 
                        onClick={() => updateNodeConfig(selectedNode.id, 'extractMode', 'single')}
                        className={`flex-1 text-xs py-1.5 rounded-md transition-all font-bold ${((selectedNode.data.config as any)?.extractMode || 'single') === 'single' ? 'bg-[#1a1a20] text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >单条模式</button>
                      <button 
                        onClick={() => updateNodeConfig(selectedNode.id, 'extractMode', 'multi')}
                        className={`flex-1 text-xs py-1.5 rounded-md transition-all font-bold ${((selectedNode.data.config as any)?.extractMode) === 'multi' ? 'bg-[#1a1a20] text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >多字段模式</button>
                      <button 
                        onClick={() => updateNodeConfig(selectedNode.id, 'extractMode', 'ai')}
                        className={`flex-1 text-xs py-1.5 rounded-md transition-all font-bold ${((selectedNode.data.config as any)?.extractMode) === 'ai' ? 'bg-[#1a1a20] text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.2)] ring-1 ring-purple-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >AI 智能托管</button>
                    </div>

                    {((selectedNode.data.config as any)?.extractMode || 'single') === 'single' && (
                      <div className="flex flex-col gap-3 fade-in mt-1">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-zinc-200 font-bold tracking-wide">CSS 寻址器 (Selector)</label>
                          <input 
                            type="text" 
                            placeholder="例如: .article-content p, h1.title"
                            value={(selectedNode.data.config as any)?.selector || ''}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'selector', e.target.value)}
                            className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono shadow-inner"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-zinc-400 font-medium">提取目标属性 <span className="text-xs font-normal text-zinc-600">(留空则提取文本)</span></label>
                          <input 
                            type="text" 
                            placeholder="例如: href, src"
                            value={(selectedNode.data.config as any)?.attribute || ''}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'attribute', e.target.value)}
                            className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-zinc-300 font-mono text-xs rounded-lg p-2 outline-none focus:border-zinc-600 transition-colors"
                          />
                        </div>
                      </div>
                    )}

                    {((selectedNode.data.config as any)?.extractMode) === 'multi' && (
                      <div className="flex flex-col gap-2 fade-in mt-1">
                        <div className="flex items-center justify-between mb-1">
                           <label className="text-xs text-zinc-200 font-bold tracking-wide">提取规则列表</label>
                           <button 
                             onClick={() => {
                                const rules = (selectedNode.data.config as any)?.multiRules || [];
                                updateNodeConfig(selectedNode.id, 'multiRules', [...rules, { key: '', selector: '', attribute: '' }]);
                             }}
                             className="text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg transition-all shadow-inner ring-1 ring-emerald-500/30"
                           >+ 添加字段</button>
                        </div>
                        
                        {((selectedNode.data.config as any)?.multiRules || []).length === 0 && (
                           <div className="text-xs text-zinc-500 italic text-center py-4 bg-white/[0.02] rounded-lg border border-dashed border-white/5">
                             暂无规则，点击右上角添加
                           </div>
                        )}

                        {((selectedNode.data.config as any)?.multiRules || []).map((rule: any, idx: number) => (
                          <div key={idx} className="flex flex-col gap-1.5 bg-[#0c0c0e]/60 ring-1 ring-white/5 p-2.5 rounded-lg border border-white/5">
                            <div className="flex gap-2">
                              <input 
                                placeholder="字段名 (如 title, avatar)" 
                                value={rule.key} 
                                onChange={(e) => {
                                   const rules = [...((selectedNode.data.config as any)?.multiRules || [])];
                                   rules[idx].key = e.target.value;
                                   updateNodeConfig(selectedNode.id, 'multiRules', rules);
                                }} 
                                className="flex-1 bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-white text-xs px-2 py-1.5 rounded focus:border-emerald-500 outline-none transition-colors font-mono" 
                              />
                              <button 
                                onClick={() => {
                                   const rules = [...((selectedNode.data.config as any)?.multiRules || [])];
                                   rules.splice(idx, 1);
                                   updateNodeConfig(selectedNode.id, 'multiRules', rules);
                                }}
                                className="text-red-400/80 hover:text-red-400 px-2 font-bold text-xs transition-all bg-red-500/5 hover:bg-red-500/20 rounded-md"
                              >删除</button>
                            </div>
                            <input 
                              placeholder="CSS 选择器 (如 h1, .item img)" 
                              value={rule.selector} 
                              onChange={(e) => {
                                   const rules = [...((selectedNode.data.config as any)?.multiRules || [])];
                                   rules[idx].selector = e.target.value;
                                   updateNodeConfig(selectedNode.id, 'multiRules', rules);
                              }} 
                              className="w-full bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 font-mono text-xs px-2 py-1.5 rounded focus:border-emerald-500 outline-none transition-colors" 
                            />
                            <input 
                              placeholder="元素属性 (留空提取文本, 如 src, href)" 
                              value={rule.attribute} 
                              onChange={(e) => {
                                   const rules = [...((selectedNode.data.config as any)?.multiRules || [])];
                                   rules[idx].attribute = e.target.value;
                                   updateNodeConfig(selectedNode.id, 'multiRules', rules);
                              }} 
                              className="w-full bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-zinc-400 font-mono text-xs px-2 py-1.5 rounded focus:border-emerald-500 outline-none transition-colors" 
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {((selectedNode.data.config as any)?.extractMode) === 'ai' && (
                      <div className="mt-1 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg flex gap-3 text-purple-300 text-xs leading-relaxed fade-in">
                         <Brain className="w-5 h-5 shrink-0 mt-0.5 text-purple-400" />
                         <div className="flex flex-col gap-1.5">
                           <p>
                             <strong className="text-purple-200">AI 深空接管已激活</strong><br/>
                             本节点将隐式监听上一层【大模型智能萃取】下发的特征图谱，自动进行 DOM 爆破提取。
                           </p>
                           <p className="text-xs text-purple-400/80 bg-white/[0.02] p-2 rounded border border-purple-500/10">
                             最佳编排路线：<br/>
                             1. 在前置大模型节点中，写入 Prompt：<i>"分析网页并输出 title_selector, items_selector"</i><br/>
                             2. 将大模型连接至本节点。<br/>
                             3. 享受零规则、全自动、抗变化的长效爬取。
                           </p>
                         </div>
                      </div>
                    )}
                  </div>
                )}



                {/* Playwright 拟真沙箱 - 专属配置面板 */}
                {selectedNode.data.label === 'Playwright 拟真沙箱' && (
                  <div className="flex flex-col gap-5">
                    
                    {/* Section 1: Target & HTTP Setup */}
                    <div className="flex flex-col gap-3">
                      <h4 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest border-b border-white/5 pb-1 flex items-center gap-2">
                        <Globe className="w-3 h-3 text-emerald-500" />
                        目标挂载与传参 (Target Setup)
                      </h4>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-zinc-300 font-medium">目标入口 URL</label>
                        <input 
                          type="text" 
                          placeholder="自动接管上游 URL，或手写如 https://a.com/{{id}}"
                          value={(selectedNode.data.config as any)?.url || ''}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'url', e.target.value)}
                          className="bg-black/40 ring-1 ring-white/5 text-emerald-400 text-xs rounded-lg px-3 py-2.5 outline-none focus:ring-emerald-500/50 transition-all font-mono shadow-inner w-full"
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[11px] text-zinc-300 font-medium">接管参数 (;)分隔</label>
                            <input 
                              type="text"
                              placeholder='例如: dict_id; token'
                              value={(selectedNode.data.config as any)?.pickParams || ''}
                              onChange={(e) => updateNodeConfig(selectedNode.id, 'pickParams', e.target.value)}
                              className="bg-black/40 ring-1 ring-white/5 text-emerald-400 text-[11px] rounded-lg p-2.5 outline-none focus:ring-emerald-500/50 transition-all font-mono"
                            />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[11px] text-zinc-300 font-medium">注入固定载荷 (JSON)</label>
                            <input 
                              type="text"
                              placeholder='{"page": 1}'
                              value={(selectedNode.data.config as any)?.params || ''}
                              onChange={(e) => updateNodeConfig(selectedNode.id, 'params', e.target.value)}
                              className="bg-black/40 ring-1 ring-white/5 text-emerald-400 text-[11px] rounded-lg p-2.5 outline-none focus:ring-emerald-500/50 transition-all font-mono"
                            />
                        </div>
                      </div>
                      <div className="text-[10px] text-zinc-500 bg-emerald-500/5 p-2.5 border border-emerald-500/10 rounded-lg leading-relaxed flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-emerald-500/80 mt-0.5 shrink-0" />
                        <span>未写死 URL 时响应上游请求。显式提取的参数/载荷将通过查询字符串混合。支持 <code>{`{{模板}}`}</code>。</span>
                      </div>
                    </div>

                    {/* Section 2: Sandbox Engine Execution */}
                    <div className="flex flex-col gap-3">
                      <h4 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest border-b border-white/5 pb-1 flex items-center gap-2">
                        <Cpu className="w-3 h-3 text-blue-500" />
                        沙箱运行指标 (Execution Runtime)
                      </h4>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-zinc-300 font-medium">视窗渲染模式</label>
                        <select 
                          value={(selectedNode.data.config as any)?.headless !== false ? 'true' : 'false'}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'headless', e.target.value === 'true')}
                          className="bg-black/40 ring-1 ring-white/5 text-zinc-200 text-xs rounded-lg px-3 py-2.5 outline-none focus:ring-blue-500/50 transition-all font-sans cursor-pointer appearance-none"
                        >
                          <option value="true">Headless (无头静默加速)</option>
                          <option value="false">Headful (前台带UI调试)</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-zinc-300 font-medium">强制阻塞标识 (待出现元素)</label>
                        <input 
                          type="text" 
                          placeholder="例如 .comment-list (风控脱出特征)"
                          value={(selectedNode.data.config as any)?.waitForSelector || ''}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'waitForSelector', e.target.value)}
                          className="bg-black/40 ring-1 ring-white/5 text-zinc-200 text-xs rounded-lg px-3 py-2.5 outline-none focus:ring-blue-500/50 transition-all font-mono"
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex flex-col gap-1 flex-1">
                          <label className="text-[11px] text-zinc-300 font-medium">沙箱熔断(秒)</label>
                          <input 
                            type="number" 
                            placeholder="30"
                            value={(selectedNode.data.config as any)?.timeout || 30}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'timeout', parseInt(e.target.value) || 30)}
                            className="bg-black/40 ring-1 ring-white/5 text-zinc-200 text-[11px] rounded-lg p-2.5 outline-none focus:ring-blue-500/50 font-mono"
                          />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                          <label className="text-[11px] text-zinc-300 font-medium">崩溃重试上线</label>
                          <input 
                            type="number" 
                            placeholder="0"
                            value={(selectedNode.data.config as any)?.retries || 0}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'retries', parseInt(e.target.value) || 0)}
                            className="bg-black/40 ring-1 ring-white/5 text-zinc-200 text-[11px] rounded-lg p-2.5 outline-none focus:ring-blue-500/50 font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Anti-bot Tactics */}
                    <div className="flex flex-col gap-3">
                      <h4 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest border-b border-white/5 pb-1 flex items-center gap-2">
                        <ShieldAlert className="w-3 h-3 text-purple-500" />
                        反侦察阻断对抗 (Anti-Bot Array)
                      </h4>
                      <div className="flex flex-col gap-2 bg-purple-500/5 ring-1 ring-purple-500/20 p-3 rounded-xl">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] text-purple-200">擦除驱动指纹特征 (Stealth Inject)</label>
                          <input 
                            type="checkbox" 
                            checked={(selectedNode.data.config as any)?.stealthMode ?? true}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'stealthMode', e.target.checked)}
                            className="accent-purple-500 w-3 h-3 cursor-pointer"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] text-purple-200">注入仿生鼠标游离 (Human Behavior)</label>
                          <input 
                            type="checkbox" 
                            checked={(selectedNode.data.config as any)?.humanMode ?? true}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'humanMode', e.target.checked)}
                            className="accent-purple-500 w-3 h-3 cursor-pointer"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] text-purple-200">释放图像网络阻断 (Avoid Deadlock)</label>
                          <input 
                            type="checkbox" 
                            checked={(selectedNode.data.config as any)?.allowImages ?? false}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'allowImages', e.target.checked)}
                            className="accent-purple-500 w-3 h-3 cursor-pointer"
                          />
                        </div>
                      </div>
                      <div className="text-[10px] text-zinc-500 bg-purple-500/5 p-2.5 border border-purple-500/10 rounded-lg leading-relaxed flex items-start gap-2">
                         <Bot className="w-3.5 h-3.5 text-purple-500/80 mt-0.5 shrink-0" />
                         <span>提示：沙箱网络指纹与设备环境将主动承继自【指纹与 Headers 随机化】节点生成的 JA3/TLS 及 User-Agent 上下文。</span>
                      </div>
                    </div>

                    {/* Section 4: Scroll Automation */}
                    <div className="flex flex-col gap-3">
                      <h4 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest border-b border-white/5 pb-1 flex items-center gap-2">
                        <List className="w-3 h-3 text-cyan-500" />
                        无限滚动探测 (Auto Waterfall)
                      </h4>
                      <div className={`flex flex-col gap-2 transition-all p-3 rounded-xl border ${((selectedNode.data.config as any)?.autoScroll ?? false) ? 'bg-cyan-500/10 ring-1 ring-cyan-500/30' : 'bg-black/30 ring-1 ring-white/5'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <label className={`text-[11px] font-bold uppercase tracking-widest ${((selectedNode.data.config as any)?.autoScroll ?? false) ? 'text-cyan-400' : 'text-zinc-500'}`}>触底加载引擎</label>
                          </div>
                          <input 
                            type="checkbox" 
                            checked={(selectedNode.data.config as any)?.autoScroll ?? false}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'autoScroll', e.target.checked)}
                            className="accent-cyan-500 w-3.5 h-3.5 cursor-pointer"
                          />
                        </div>
                        
                        {((selectedNode.data.config as any)?.autoScroll ?? false) && (
                          <div className="flex flex-col gap-3 mt-3 fade-in border-t border-cyan-500/20 pt-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] text-cyan-300/80 flex justify-between uppercase tracking-widest font-mono">
                                <span>MAX SCROLL LIMIT</span>
                                <span className="text-cyan-400 font-bold">{(selectedNode.data.config as any)?.maxScrollTimes || 5}</span>
                              </label>
                              <input 
                                type="range" min="1" max="50" step="1"
                                value={(selectedNode.data.config as any)?.maxScrollTimes || 5}
                                onChange={(e) => updateNodeConfig(selectedNode.id, 'maxScrollTimes', parseInt(e.target.value))}
                                className="accent-cyan-500 cursor-pointer w-full h-1 bg-black/40 rounded-full appearance-none outline-none"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] text-cyan-300/80 flex justify-between uppercase tracking-widest font-mono">
                                <span>INTERVAL / JITTER (ms)</span>
                                <span className="text-cyan-400 font-bold">{(selectedNode.data.config as any)?.scrollInterval || 1500}</span>
                              </label>
                              <input 
                                type="range" min="500" max="5000" step="100"
                                value={(selectedNode.data.config as any)?.scrollInterval || 1500}
                                onChange={(e) => updateNodeConfig(selectedNode.id, 'scrollInterval', parseInt(e.target.value))}
                                className="accent-cyan-500 cursor-pointer w-full h-1 bg-black/40 rounded-full appearance-none outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 登录挂载模块 */}
                    <div className="flex flex-col gap-2 mt-4 bg-purple-500/5 p-3 rounded-xl border border-purple-500/20">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <label className="text-[11px] text-purple-400 font-bold uppercase tracking-widest">挂载破壁登录模块</label>
                          <span className="text-[9px] text-zinc-500">开启后接管沙箱，获取高权限 Cookie</span>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={(selectedNode.data.config as any)?.enableLogin ?? false}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'enableLogin', e.target.checked)}
                          className="accent-purple-500 w-3.5 h-3.5 cursor-pointer"
                        />
                      </div>
                      
                      {(selectedNode.data.config as any)?.enableLogin && (
                        <div className="flex flex-col gap-3 mt-3 fade-in border-t border-purple-500/10 pt-3">
                          {/* 模式切换 */}
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-400 font-medium">破壁战术选择</label>
                            <select 
                              value={(selectedNode.data.config as any)?.loginMethod || 'semi_auto'}
                              onChange={(e) => updateNodeConfig(selectedNode.id, 'loginMethod', e.target.value)}
                              className="bg-[#0c0c0e]/80 border border-white/5 text-purple-300 font-mono text-xs rounded-lg p-2 outline-none focus:border-purple-500"
                            >
                              <option value="semi_auto">👨‍💻 半自动指挥官介入 (弹出页面扫码/接码)</option>
                              <option value="ai_agent">🤖 AI 具身特工全托管 (自动填表+滑块对抗)</option>
                            </select>
                          </div>

                          {/* 成功探针 */}
                          {/* 成功探针（从必填变成了高级可选） */}
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-400 font-medium">成功标识探针 (可选, 留空则启用智能侦测)</label>
                            <input 
                              type="text" 
                              placeholder="留空即可。如需强校验可填: .user-avatar"
                              value={(selectedNode.data.config as any)?.loginSuccessSelector || ''}
                              onChange={(e) => updateNodeConfig(selectedNode.id, 'loginSuccessSelector', e.target.value)}
                              className="bg-[#0c0c0e]/80 ring-1 ring-white/5 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-purple-500/50"
                            />
                            <span className="text-[9px] text-emerald-500/80 mt-1 font-bold">
                              ⚡ 推荐留空：系统将在后台自动监控 URL跳转、Cookie下发及语义变化，实现 0 配置判断。
                            </span>
                          </div>

                          {/* 特工账号配置 */}
                          {((selectedNode.data.config as any)?.loginMethod) === 'ai_agent' && (
                            <div className="flex gap-2">
                              <input 
                                type="text" placeholder="特工代号 (Username)"
                                value={(selectedNode.data.config as any)?.username || ''}
                                onChange={(e) => updateNodeConfig(selectedNode.id, 'username', e.target.value)}
                                className="flex-1 bg-[#0c0c0e]/80 ring-1 ring-white/5 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-purple-500/50"
                              />
                              <input 
                                type="password" placeholder="特工口令 (Password)"
                                value={(selectedNode.data.config as any)?.password || ''}
                                onChange={(e) => updateNodeConfig(selectedNode.id, 'password', e.target.value)}
                                className="flex-1 bg-[#0c0c0e]/80 ring-1 ring-white/5 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-purple-500/50"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                )}

                {/* 即时状态分发 - 专属配置面板 */}
                {selectedNode.data.label === '即时状态分发' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">分发通道</label>
                      <select 
                        value={(selectedNode.data.config as any)?.channel || 'webhook'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'channel', e.target.value)}
                        className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-sans cursor-pointer shadow-inner appearance-none"
                      >
                        <option value="webhook">Webhook 推送 (钉钉/飞书/TG)</option>
                        <option value="file">本地安全落盘 (JSON Lines)</option>
                      </select>
                    </div>

                    {/* Webhook 专属配置 */}
                    {((selectedNode.data.config as any)?.channel === 'webhook' || !(selectedNode.data.config as any)?.channel) && (
                      <div className="flex flex-col gap-1 mt-2">
                        <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block flex justify-between">
                          <span>Target Webhook URL</span>
                          <span className="text-emerald-500/50">POST</span>
                        </label>
                        <input 
                          type="text" 
                          placeholder="https://oapi.dingtalk.com/robot/send?..."
                          value={(selectedNode.data.config as any)?.webhookUrl || ''}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'webhookUrl', e.target.value)}
                          className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-sans cursor-pointer shadow-inner appearance-none"
                        />
                      </div>
                    )}

                    {/* File 专属配置 */}
                    {(selectedNode.data.config as any)?.channel === 'file' && (
                      <div className="flex flex-col gap-1 mt-2">
                        <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">存储路径</label>
                        <input 
                          type="text" 
                          placeholder="./output/crawled_data.jsonl"
                          value={(selectedNode.data.config as any)?.filePath || ''}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'filePath', e.target.value)}
                          className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-sans cursor-pointer shadow-inner appearance-none"
                        />
                      </div>
                    )}
                  </>
                )}

                {/* 子任务下发中心 - 专属配置面板 */}
                {selectedNode.data.label === '子任务下发中心' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-500 font-mono">投递至目标队列 (Target Queue)</label>
                      <input 
                        type="text" 
                        placeholder="例如：detail_page_queue"
                        value={(selectedNode.data.config as any)?.queueName || 'default_queue'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'queueName', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-blue-400 text-xs rounded p-1.5 outline-none focus:border-blue-500 transition-colors font-mono h-8"
                      />
                    </div>
                    <div className="flex flex-col gap-1 mt-3">
                      <label className="text-xs text-zinc-500 font-mono">提取URL的变量名 (Data Source)</label>
                      <input 
                        type="text" 
                        placeholder="留空自动搜刮，或者填入数组变量名 (例如：product_links)"
                        value={(selectedNode.data.config as any)?.dataField || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'dataField', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-purple-400 text-xs rounded p-1.5 outline-none focus:border-purple-500 transition-colors font-mono h-8"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-3 cursor-pointer select-none" onClick={(e) => {
                      e.preventDefault();
                      updateNodeConfig(selectedNode.id, 'inheritContext', !(selectedNode.data.config as any)?.inheritContext);
                    }}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        (selectedNode.data.config as any)?.inheritContext 
                          ? 'bg-emerald-500 border-emerald-500' 
                          : 'bg-[#0c0c0e]/80 border-zinc-600'
                      }`}>
                        {(selectedNode.data.config as any)?.inheritContext && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <label className="text-xs text-zinc-400 font-mono cursor-pointer hover:text-white transition-colors">下发时继承父线 Cookie与环境变量</label>
                    </div>
                    
                    <div className="text-[9px] text-zinc-400 mt-4 bg-blue-500/10 p-2.5 border border-blue-500/20 rounded-lg leading-relaxed shadow-inner">
                      🚀 <b>裂变与并发 (Fan-Out) 核心原理解析：</b><br/>
                      <div className="mt-1 flex flex-col gap-1.5">
                        <span className="text-zinc-300"><b>1. 数组打散：</b>上游一次性提取了包含 100 个元素的数组（如只提取了ID）。本节点会将数组“拆散”，变成 <b>100个独立的子任务数据包</b>。</span>
                        <span className="text-zinc-300"><b>2. 脉冲源头：</b>后续连接【脉冲并发请求】发起挂载。它会开启多个协程 (Workers) 去队列里 <b>并发抢单</b>。</span>
                        <span className="text-zinc-300"><b>3. 动态接管：</b><br/>
                          &nbsp;&nbsp;• 如果数据包本身是 <b>链接字符串</b> 或含有 <code>url/href</code> 字段：下游节点将 <b>URL 留空</b> 即可被自动接管。<br/>
                          &nbsp;&nbsp;• 如果数据包仅是 <b>参数字典</b> (如 <code>{`{"id": 123}`}</code>)：下游节点的 <b>URL 填写纯接口地址</b> (如 <code>https://api.com/user</code>)，系统将<b>智能识别并自动把参数拼接到 URL 末尾</b> (GET) <b>或压入 Body</b> (POST)。您当然也可手工使用 <code>{`{{id}}`}</code> 模板动态替换路径。
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {/* 系统定时节拍器 - 专属配置面板 */}
                {selectedNode.data.label === '系统定时节拍器' && (
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide">任务执行的频率是？</label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {[
                          { label: '点我才运行', value: '', desc: '单次手动执行' },
                          { label: '一直盯着', value: '*/1 * * * *', desc: '每60秒一次' },
                          { label: '慢速刷新', value: '*/5 * * * *', desc: '每5分钟一次' },
                          { label: '每天一次', value: '0 0 * * *', desc: '每日凌晨启动' }
                        ].map((opt) => {
                          const isActive = ((selectedNode.data.config as any)?.cron || '') === opt.value;
                          return (
                            <div 
                              key={opt.label}
                              onClick={() => updateNodeConfig(selectedNode.id, 'cron', opt.value)}
                              className={`cursor-pointer rounded-xl p-3 flex flex-col gap-1 transition-all ${isActive ? 'bg-emerald-500/10 ring-2 ring-emerald-500/50' : 'bg-[#0c0c0e]/60 ring-1 ring-white/5 ring-1 ring-white/5 hover:ring-white/20'}`}
                            >
                              <span className={`text-sm font-medium ${isActive ? 'text-emerald-400' : 'text-zinc-300'}`}>{opt.label}</span>
                              <span className="text-xs text-zinc-500">{opt.desc}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    
                    <div className="h-px w-full bg-white/5 border-none" />

                    <div className="flex flex-col gap-2">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide">我们要去哪个网站爬取数据？</label>
                      <input 
                        type="url"
                        placeholder="例如：https://www.google.com"
                        value={(selectedNode.data.config as any)?.startUrl || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'startUrl', e.target.value)}
                        className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-sans placeholder:text-zinc-600 shadow-inner"
                      />
                      <span className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5"><Info className="w-3 h-3" /> 这是我们爬虫小队降落的第一站。</span>
                    </div>
                  </div>
                )}

                {/* 任务调度队列 - 专属配置面板 */}
                {selectedNode.data.label === '任务调度队列' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">监听队列名称</label>
                      <input 
                        type="text" 
                        placeholder="e.g., detail_page_queue"
                        value={(selectedNode.data.config as any)?.queueName || 'default_queue'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'queueName', e.target.value)}
                        className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-sans cursor-pointer shadow-inner appearance-none"
                      />
                    </div>
                    <div className="text-[9px] text-zinc-500 mt-2 leading-relaxed">
                      战术说明：此节点作为整条流水线的触发发条，会持续监听中央调度队列。一旦有上游丢入新的任务（例如产品详情页 URL），即刻唤醒后续所有节点并发干活。
                    </div>
                  </>
                )}

                {/* 外部接口 WebHook 触发 - 专属配置面板 */}
                {selectedNode.data.label === '外部接口 WebHook 触发' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-500 font-mono">分配给您的专属 WebHook URL</label>
                      <div className="flex bg-[#0c0c0e]/80 border border-white/5 shadow-inner/50 rounded-xl overflow-hidden focus-within:border-emerald-500 transition-colors">
                        <span className="text-xs text-zinc-500 py-3 pl-3 select-none flex-shrink-0 bg-white/5 border-r border-white/5">https://.../api/webhook/</span>
                        <input 
                          type="text" 
                          placeholder="例如：my_custom_task"
                          value={(selectedNode.data.config as any)?.listenPath || ''}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'listenPath', e.target.value)}
                          className="bg-transparent text-emerald-400 text-xs px-2 py-3 outline-none font-mono flex-1 min-w-0 placeholder-zinc-600"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 mt-3">
                      <label className="text-xs text-zinc-500 font-mono flex justify-between">
                        <span>API 鉴权令牌 (Bearer Token)</span>
                        <span className="text-emerald-500/50 cursor-pointer hover:text-emerald-400" onClick={() => updateNodeConfig(selectedNode.id, 'secret', Math.random().toString(36).substring(2, 15))}>随机生成</span>
                      </label>
                      <input 
                        type="password" 
                        placeholder="留空则任何人均可触发此流水线"
                        value={(selectedNode.data.config as any)?.secret || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'secret', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-colors font-mono"
                      />
                    </div>
                    <div className="text-[9px] text-zinc-500 mt-2 bg-[#0c0c0e]/60 ring-1 ring-white/5 p-2 border border-white/5 rounded leading-relaxed">
                      💡 外部系统 (如 n8n/钉钉群机器人/自定义业务服务) 向此 URL 发起 POST/GET 请求，即可唤醒该条爬虫流水线并将参数传入。
                    </div>
                  </>
                )}

                {/* 指纹与 Headers 随机化 - 专属配置面板 */}
                {selectedNode.data.label === '指纹与 Headers 随机化' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">使用模式</label>
                      <select 
                        value={(selectedNode.data.config as any)?.strategyMode || 'sequence'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'strategyMode', e.target.value)}
                        className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-sans cursor-pointer shadow-inner appearance-none"
                      >
                         <option value="sequence">每个序列独立分配</option>
                         <option value="global">全局复用同一套</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1 mt-3">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">伪造策略</label>
                      <select 
                        value={(selectedNode.data.config as any)?.strategy || 'browser_matched'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'strategy', e.target.value)}
                        className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-sans cursor-pointer shadow-inner appearance-none"
                      >
                        <option value="browser_matched">严格匹配 (UA/JA3/HTTP2完美对应)</option>
                        <option value="random">高频随机生成 (易触发风控但量大)</option>
                        <option value="mobile_only">纯移动端指纹 (App/M站扒谱专用)</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between mt-3 bg-[#0c0c0e]/90 ring-1 ring-white/5 shadow-inner backdrop-blur-md p-2 rounded border border-red-500/30">
                      <div className="flex flex-col">
                        <label className="text-xs text-zinc-400 font-mono">TLS/JA3 握手包伪造</label>
                        <span className="text-[8px] text-zinc-500">穿透 Cloudflare 等底层 TCP 拦截</span>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={(selectedNode.data.config as any)?.ja3Spoof ?? true}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'ja3Spoof', e.target.checked)}
                        className="accent-red-500 w-3 h-3"
                      />
                    </div>
                  </>
                )}

                {/* 会话身份驻留池 - 专属配置面板 */}
                {selectedNode.data.label === '会话身份驻留池' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">领域空间 (Domain)</label>
                      <input 
                        type="text" 
                        value={(selectedNode.data.config as any)?.domain || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'domain', e.target.value)}
                        placeholder="如 bilibili, xiaohongshu"
                        className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1 mt-4">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">工作模式</label>
                      <div className="flex flex-col gap-3 pl-1">
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input 
                            type="radio" 
                            name="poolMode"
                            value="inject"
                            checked={((selectedNode.data.config as any)?.poolMode || 'extract') === 'inject'}
                            onChange={() => updateNodeConfig(selectedNode.id, 'poolMode', 'inject')}
                            className="w-4 h-4 text-emerald-500 bg-[#0c0c0e] border-white/20 focus:ring-emerald-500/50"
                          />
                          <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">Inject (存入新鲜凭证)</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input 
                            type="radio" 
                            name="poolMode"
                            value="extract"
                            checked={((selectedNode.data.config as any)?.poolMode || 'extract') === 'extract'}
                            onChange={() => updateNodeConfig(selectedNode.id, 'poolMode', 'extract')}
                            className="w-4 h-4 text-emerald-500 bg-[#0c0c0e] border-white/20 focus:ring-emerald-500/50"
                          />
                          <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">Extract (提取分发独立凭证)</span>
                        </label>
                      </div>
                    </div>

                    <div className="text-[11px] text-zinc-500 mt-4 font-mono leading-relaxed bg-blue-500/5 p-3 rounded-lg border border-blue-500/10">
                      提示：选择 Inject 将上游的新鲜 Cookie 安全持久化至全局池。选择 Extract 则在裂变脉冲并发时启用 Round-Robin (轮询) 算法分发子账号。当遭遇反爬风控 (HTTP 4XX) 时系统将触发断尾自愈，自动剔除无效账号。
                    </div>
                  </>
                )}

                {/* 持久化知识库 - 专属配置面板 */}
                {selectedNode.data.label === '持久化知识库' && (
                  <>
                    <div className="flex flex-col gap-1 mb-3">
                      <label className="text-[10px] text-zinc-400 font-mono">指向目标数据来源路径 (支持 context.xxx)</label>
                      <input 
                        type="text"
                        placeholder="留空默认: context.extracted_data"
                        value={(selectedNode.data.config as any)?.dataField || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'dataField', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors font-mono"
                      />
                    </div>
                  
                    <div className="flex flex-col gap-1">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">数据库类型</label>
                      <select 
                        value={(selectedNode.data.config as any)?.dbType || 'mongodb'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'dbType', e.target.value)}
                        className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-sans cursor-pointer shadow-inner appearance-none"
                      >
                        <option value="mongodb">MongoDB (文档型数据库)</option>
                        <option value="postgresql">PostgreSQL (关系型数据库)</option>
                        <option value="mysql">MySQL / TiDB</option>
                        <option value="pinecone">Pinecone (向量知识库)</option>
                        <option value="redis">Redis (内存缓存储存)</option>
                      </select>
                    </div>

                    <div className="flex gap-2 mt-2 flex-wrap">
                       <div className="flex flex-col gap-1 flex-1 min-w-[50%]">
                          <label className="text-xs text-zinc-500 font-mono">服务器地址 (Host)</label>
                          <input 
                            type="text" 
                            placeholder="127.0.0.1 或 api.db.com"
                            value={(selectedNode.data.config as any)?.dbHost || ''}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'dbHost', e.target.value)}
                            className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-zinc-300 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors font-mono"
                          />
                       </div>
                       <div className="flex flex-col gap-1 flex-1">
                          <label className="text-xs text-zinc-500 font-mono">端口 (Port)</label>
                          <input 
                            type="text" 
                            placeholder="如 3306"
                            value={(selectedNode.data.config as any)?.dbPort || ''}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'dbPort', e.target.value)}
                            className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-zinc-300 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors font-mono"
                          />
                       </div>
                    </div>

                    <div className="flex gap-2 mt-2">
                       <div className="flex flex-col gap-1 flex-1">
                          <label className="text-xs text-zinc-500 font-mono">账号 (Username)</label>
                          <input 
                            type="text" 
                            placeholder="root"
                            value={(selectedNode.data.config as any)?.dbUser || ''}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'dbUser', e.target.value)}
                            className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-zinc-300 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors font-mono"
                          />
                       </div>
                       <div className="flex flex-col gap-1 flex-1">
                          <label className="text-xs text-zinc-500 font-mono">密码 (Password)</label>
                          <input 
                            type="password" 
                            placeholder="******"
                            value={(selectedNode.data.config as any)?.dbPassword || ''}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'dbPassword', e.target.value)}
                            className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-zinc-300 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors font-mono"
                          />
                       </div>
                    </div>

                    <div className="flex flex-col gap-1 mt-2">
                       <label className="text-xs text-zinc-500 font-mono">库名与集合 (DB & Table/Collection)</label>
                       <input 
                          type="text" 
                          placeholder="例如: ai_data / user_info"
                          value={(selectedNode.data.config as any)?.dbTable || ''}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'dbTable', e.target.value)}
                          className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-purple-400 text-xs rounded p-2 outline-none focus:border-purple-500 transition-colors font-mono"
                        />
                    </div>
                  </>
                )}

                {/* 文件与多媒体保存 - 专属配置面板 */}
                {selectedNode.data.label === '文件与多媒体保存' && (
                  <>
                    <div className="flex flex-col gap-1 mb-3">
                      <label className="text-[10px] text-zinc-400 font-mono">指向目标数据来源路径 (支持 context.xxx)</label>
                      <input 
                        type="text"
                        placeholder="留空默认: context.extracted_data"
                        value={(selectedNode.data.config as any)?.dataField || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'dataField', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors font-mono"
                      />
                    </div>
                  
                    <div className="flex flex-col gap-1">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">保存文件名 (勿带后缀)</label>
                      <input 
                        type="text" 
                        placeholder="例如: crawled_target_data"
                        value={(selectedNode.data.config as any)?.fileName || ''}
                        // 自动替换非法字符，防止路径注入或保存失败
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'fileName', e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_'))}
                        className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-emerald-400 text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
                      />
                      <span className="text-[9px] text-zinc-500 mt-1">系统会自动拼装时间戳防覆盖，并统一保存至 output 目录。</span>
                    </div>

                    <div className="flex flex-col gap-1 mt-3">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">期望导出格式</label>
                      <select 
                        value={(selectedNode.data.config as any)?.format || 'json'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'format', e.target.value)}
                        className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-sans cursor-pointer"
                      >
                        <optgroup label="文本与结构化数据">
                          <option value="json">JSON (最安全，支持所有复杂结构)</option>
                          <option value="csv">CSV 表格 (仅支持单层扁平列表)</option>
                          <option value="excel">Excel / XLSX (支持扁平表格)</option>
                          <option value="txt">TXT 纯文本格式</option>
                        </optgroup>
                        <optgroup label="二进制与文件">
                          <option value="media">智能媒体保存 (图片/视频/PDF 自动识别)</option>
                        </optgroup>
                      </select>
                    </div>

                    <div className="text-[10px] text-zinc-500 mt-4 bg-emerald-500/5 p-3 border border-emerald-500/10 rounded-lg leading-relaxed shadow-inner">
                      💡 <b>智能纠偏与时光机引擎已激活：</b><br/>
                      系统在最终落盘时，会严格校验您的数据格式。若发现数据类型与期望格式冲突（如试图将图片保存为 CSV），系统将<b>自动进行格式修正</b>。同时，文件末尾会自动追加精确到秒的时间戳以防止覆盖。
                    </div>
                  </>
                )}

                {/* 智能风控路由哨兵 - 专属配置面板 */}
                {selectedNode.data.label === '智能风控路由哨兵' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-500 font-mono">自动检测触发条件 (Auto-Suspend Conditions)</label>
                      <select 
                        value={(selectedNode.data.config as any)?.detectMode || 'auto_captcha'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'detectMode', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-amber-400 text-xs rounded p-1.5 outline-none focus:border-amber-500 transition-colors h-8"
                      >
                        <option value="auto_captcha">智能视觉&DOM异常分析 (自动识别滑块/云盾防火墙)</option>
                        <option value="http_error">仅监控被拒 HTTP 状态码 (403/429/503)</option>
                        <option value="keyword">页面包含特定的异常风控提示词</option>
                        <option value="always">无条件强制路由至 evade (用作调试断点)</option>
                      </select>
                    </div>

                    {(selectedNode.data.config as any)?.detectMode === 'keyword' && (
                      <div className="flex flex-col gap-1 mt-2">
                        <label className="text-xs text-zinc-500 font-mono">异常关键词 (如: 请求过于频繁)</label>
                        <input 
                          type="text" 
                          placeholder="此处输入会被拦截路由的关键词"
                          value={(selectedNode.data.config as any)?.keyword || ''}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'keyword', e.target.value)}
                          className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-amber-400 text-xs rounded p-1.5 outline-none focus:border-amber-500 transition-colors font-mono h-8"
                        />
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-500 mt-2 font-mono leading-relaxed bg-amber-500/5 p-2 rounded border border-amber-500/10">
                      ⚠️ <b>路线合并说明:</b> 若请求安全，走 <span className="text-emerald-400">[main]</span> 主线。若触发风控，则走 <span className="text-red-400">[evade]</span> 支线，进入您后续连接的【人工/视觉】破壁卡点。<br/><br/>
                      <b>核心技巧：</b>为保持流程向前，解决完风控后，<b>只需将 [evade] 支线处理完的最后一个节点，重新连回主线的下游节点</b>，数据即可自动重新汇合进主分支，继续完美执行！
                    </div>
                  </>
                )}

                {/* 人工战术挂起断点 - 专属配置面板 */}
                {selectedNode.data.label === '人工战术挂起断点' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-500 font-mono">挂机提示语 (Suspend Reason)</label>
                      <input 
                        type="text" 
                        placeholder="默认为: 人工调试检查点"
                        value={(selectedNode.data.config as any)?.suspendReason || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'suspendReason', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-amber-400 text-xs rounded p-1.5 outline-none focus:border-amber-500 transition-colors font-mono h-8"
                      />
                    </div>
                    
                    <div className="text-[10px] text-zinc-500 mt-2 font-mono leading-relaxed bg-amber-500/5 p-2 rounded border border-amber-500/10">
                      ⚠️ <b>人工断点说明:</b> 测试运行到此节点时，将锁定链路，在左下角弹出调试控制台等待人工介入操作。既可用在主线上作为调试断点，也可挂在风控节点后的 [evade] 旁路使用。
                    </div>
                  </>
                )}

                {/* HTTP 状态码路由 - 专属配置面板 */}
                {selectedNode.data.label === 'HTTP 状态码路由' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-zinc-500 font-mono">当遭遇哪些状态码时判定为拦截 (Ban Codes)</label>
                      <input 
                        type="text" 
                        placeholder="例: 403, 429, 404. 留空则拦截所有 >=400 的状态"
                        value={(selectedNode.data.config as any)?.failCodes || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'failCodes', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-red-400 text-xs rounded p-1.5 outline-none focus:border-red-500 transition-colors font-mono h-8"
                      />
                    </div>
                    <div className="text-[9px] text-zinc-500 mt-2 bg-blue-500/10 p-2 border border-blue-500/20 rounded leading-relaxed">
                      💡 <b>分流说明：</b><br/>
                      • 上方绿色的【通行端口】会往下游输送成功获取的结果。<br/>
                      • 下方红色的【降级端口】会在遇到指定错误码时激活。请自行将降级动作（如代理切换、暂停）连至红色端口。
                    </div>
                  </>
                )}

                {/* 机器学习数据清洗 - 专属配置面板 */}
                {selectedNode.data.label === '机器学习数据清洗' && (
                  <>
                    <div className="flex flex-col gap-1 mb-3">
                      <label className="text-[10px] text-zinc-400 font-mono">目标清洗字段 (支持 context.xxx)</label>
                      <input 
                        type="text"
                        placeholder="留空默认: context.extracted_data.read_data"
                        value={(selectedNode.data.config as any)?.dataField || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'dataField', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors font-mono"
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1 mt-1">
                      <label className="text-xs text-zinc-300 font-bold mb-1">1. 处理缺失值 (Missing Values)</label>
                      <select 
                        value={(selectedNode.data.config as any)?.fillMissing || 'none'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'fillMissing', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors h-8"
                      >
                        <option value="none">保留原样 (None)</option>
                        <option value="drop">删除缺失行 (Dropna)</option>
                        <option value="mean">均值填充 - 稳健性平均 (Mean)</option>
                        <option value="median">中位数填充 - 极值不敏感 (Median)</option>
                        <option value="mode">众数填充 - 离散分类 (Mode)</option>
                        <option value="constant_zero">常数0填充 (Constant 0)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1 mt-3">
                      <label className="text-xs text-zinc-300 font-bold mb-1">2. 处理异常值 (Outliers)</label>
                      <select 
                        value={(selectedNode.data.config as any)?.outliers || 'none'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'outliers', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors h-8"
                      >
                        <option value="none">保留原样 (None)</option>
                        <optgroup label="盖帽法 - 保留样本数量 (Clip)">
                          <option value="iqr_clip">四分位距盖帽 (IQR 拉平极大极小值)</option>
                          <option value="zscore_clip">Z-Score 盖帽 (3倍标准差拉平)</option>
                        </optgroup>
                        <optgroup label="剔除法 - 净化数据纯度 (Drop)">
                          <option value="iqr_drop">四分位距剔除 (彻底删除异常行)</option>
                          <option value="zscore_drop">Z-Score 剔除 (彻底删除异常行)</option>
                        </optgroup>
                      </select>
                      <span className="text-[9px] text-zinc-500 mt-1">提示：若极值属于真实业务数据，推荐使用盖帽法；若极值为脏数据抓取错误，推荐剔除法。</span>
                    </div>

                    <div className="flex flex-col gap-1 mt-3">
                      <label className="text-xs text-zinc-300 font-bold mb-1">3. 数据标准化与归一化 (Scaling)</label>
                      <select 
                        value={(selectedNode.data.config as any)?.scale || 'none'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'scale', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors h-8"
                      >
                        <option value="none">保留原样 (None)</option>
                        <option value="standard">Z-Score 强健标准化 (Standardization)</option>
                        <option value="minmax">0-1 柔和归一化 (Normalization)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1 mt-3">
                      <label className="text-xs text-zinc-300 font-bold mb-1">4. 类别数据编码 (Encoding)</label>
                      <select 
                        value={(selectedNode.data.config as any)?.encode || 'none'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'encode', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors h-8"
                      >
                        <option value="none">保留原样 (None)</option>
                        <option value="label">整数标签编码 (Label: 0,1,2)</option>
                        <option value="one_hot">独热展开编码 (One-Hot / Dummies)</option>
                      </select>
                    </div>
                    
                    <div className="flex items-center justify-between mt-4 bg-[#0c0c0e]/90 ring-1 ring-white/5 shadow-inner backdrop-blur-md p-3 rounded-lg border border-purple-500/30">
                      <div className="flex flex-col">
                        <label className="text-[13px] font-bold text-zinc-200">去重清理 (Drop Duplicates)</label>
                        <span className="text-[10px] text-zinc-400 mt-1 leading-relaxed">识别数据集内完全相同或高度相似的克隆样本并抹除。</span>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={(selectedNode.data.config as any)?.dropDuplicates ?? false}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'dropDuplicates', e.target.checked)}
                        className="accent-emerald-500 w-4 h-4 mt-1 shrink-0 cursor-pointer"
                      />
                    </div>
                  </>
                )}

                {/* 大模型智能萃取与清洗 - 专属配置面板 */}
                {selectedNode.data.label === '大模型智能萃取与清洗' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex bg-[#0c0c0e]/80 p-1 rounded-lg border border-white/5">
                      <button 
                        onClick={() => updateNodeConfig(selectedNode.id, 'extractMode', 'data')}
                        className={`flex-1 text-xs py-1.5 rounded-md transition-all font-bold ${((selectedNode.data.config as any)?.extractMode || 'data') === 'data' ? 'bg-[#1a1a20] text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.2)] ring-1 ring-purple-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >标准数据提纯</button>
                      <button 
                        onClick={() => updateNodeConfig(selectedNode.id, 'extractMode', 'selector')}
                        className={`flex-1 text-xs py-1.5 rounded-md transition-all font-bold ${((selectedNode.data.config as any)?.extractMode) === 'selector' ? 'bg-[#1a1a20] text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >DOM 寻址分析器</button>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">
                        {((selectedNode.data.config as any)?.extractMode) === 'selector' ? '寻址目标描述 (需找哪些元素的CSS)' : '萃取指令 (Intent)'}
                      </label>
                      <textarea 
                        rows={3}
                        placeholder={((selectedNode.data.config as any)?.extractMode) === 'selector' 
                          ? "例如：寻找这个页面的文章标题和正文内容的CSS选择器" 
                          : "例如：提炼页面里的商品名称和价格..."}
                        value={(selectedNode.data.config as any)?.intent || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'intent', e.target.value)}
                        className={`bg-[#0c0c0e]/80 ring-1 ring-zinc-700 ${((selectedNode.data.config as any)?.extractMode) === 'selector' ? 'text-emerald-400 focus:ring-emerald-500/50' : 'text-purple-400 focus:ring-purple-500/50'} text-xs rounded px-4 py-3 outline-none transition-all font-sans placeholder:text-zinc-600 shadow-inner resize-none`}
                      />
                    </div>

                    {((selectedNode.data.config as any)?.extractMode) === 'selector' && (
                      <div className="text-[9px] text-zinc-400 mt-1 leading-relaxed bg-emerald-500/5 p-2 rounded border border-emerald-500/10">
                        💡 <b>寻址分析器说明：</b><br />
                        本模式将指令固化为：让大模型分析 HTML 结构，并强制输出含有 <code>_selector</code> 后缀的 JSON (如 title_selector, list_selector)。<br/>
                        您只需将本节点连接至【特征与 DOM 萃取】(选择 <b>AI智能托管模式</b>)，即可完成由 AI 定位、由代码高速提取的混合双打。
                      </div>
                    )}

                    <div className="flex flex-col gap-2 mt-1">
                      <label className="text-xs text-zinc-500 font-mono">驱动模型 (Model)</label>
                      <select 
                        value={(selectedNode.data.config as any)?.model || 'qwen-vl-max-latest'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'model', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-purple-400 text-xs rounded p-2 outline-none focus:border-purple-500 transition-colors"
                      >
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                        <option value="deepseek-chat">DeepSeek V3 (deepseek-chat)</option>
                        <option value="deepseek-reasoner">DeepSeek R1 (deepseek-reasoner)</option>
                        <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                        <option value="gpt-4o">GPT-4o</option>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                        <option value="qwen-max">千问 Max (qwen-max)</option>
                        <option value="qwen-plus">千问 Plus (qwen-plus)</option>
                        <option value="qwen-turbo">千问 Turbo (qwen-turbo)</option>
                        <option value="glm-4-plus">智谱 GLM-4-Plus</option>
                        <option value="glm-4-air">智谱 GLM-4-Air</option>
                      </select>
                    </div>

                    {((selectedNode.data.config as any)?.extractMode || 'data') === 'data' && (
                      <div className="flex flex-col gap-2 mt-2 fade-in">
                        <label className="text-xs text-zinc-500 font-mono text-xs text-zinc-500 font-mono">严格格式输出 (JSON Schema，可选)</label>
                        <textarea 
                          rows={3}
                          placeholder='{ "title": "string", "price": "number" }'
                          value={(selectedNode.data.config as any)?.schema || ''}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'schema', e.target.value)}
                          className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-zinc-300 font-mono text-xs rounded p-2 outline-none resize-none focus:border-purple-500 transition-colors"
                        />
                      </div>
                    )}
                    
                    <div className="flex flex-col gap-2 mt-3 bg-[#0c0c0e]/90 ring-1 ring-white/5 shadow-inner backdrop-blur-md p-3 rounded-lg border border-purple-500/30 transition-all hover:border-purple-500/50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col">
                          <label className="text-[13px] font-bold text-zinc-200">自动降噪滤清器 (Token 压缩)</label>
                          <span className="text-[10px] text-zinc-400 mt-1 leading-relaxed">开启后将非侵入式地提取底层网页文本，将庞大脏乱的 HTML 物理蜕壳为极简 Markdown。<br/><span className="text-emerald-400 font-bold">最高节省 80% 令牌耗量</span>，并大幅减少大模型提取幻觉率。</span>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={(selectedNode.data.config as any)?.autoSlim !== false}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'autoSlim', e.target.checked)}
                          className="accent-purple-500 w-4 h-4 mt-1 shrink-0 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 本地/远程数据读取 - 专属配置面板 */}
                {selectedNode.data.label === '数据读取与加载' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">数据源类型 (Source Type)</label>
                      <select 
                        value={(selectedNode.data.config as any)?.sourceType || 'local'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'sourceType', e.target.value)}
                        className="bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-inner backdrop-blur-md text-emerald-400 text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-sans cursor-pointer appearance-none"
                      >
                        <option value="local">本地文件路径 (Local File)</option>
                        <option value="url">远程下载直链 (Remote URL)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1 mt-3">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">路径或链接 (Path / URL)</label>
                      <input 
                        type="text" 
                        placeholder={(selectedNode.data.config as any)?.sourceType === 'url' ? "https://example.com/data.csv" : "D:/data/raw_input.xlsx"}
                        value={(selectedNode.data.config as any)?.path || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'path', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-white text-xs rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-colors font-mono"
                      />
                    </div>

                    <div className="flex flex-col gap-1 mt-3">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">文件格式声明</label>
                      <select 
                        value={(selectedNode.data.config as any)?.format || 'auto'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'format', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-zinc-300 text-xs rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                      >
                        <option value="auto">🤖 智能自动推断 (根据后缀识别)</option>
                        <option value="json">JSON 结构化文本</option>
                        <option value="csv">CSV 逗号分隔表</option>
                        <option value="excel">Excel 表格 (xlsx/xls)</option>
                        <option value="txt">TXT 纯文本格式</option>
                      </select>
                    </div>

                    <div className="text-[10px] text-zinc-500 mt-4 bg-emerald-500/5 p-3 border border-emerald-500/10 rounded-lg leading-relaxed shadow-inner">
                      💡 <b>节点功能：</b><br/>
                      系统将读取指定的数据源，并将其解析为标准的 Python 列表或字典，注入至 <code>context.extracted_data['read_data']</code> 中，以便下游节点进行清洗或再加工。
                    </div>
                  </>
                )}

                {/* 万能数据清洗转换 - 专属配置面板 */}
                {selectedNode.data.label === '万能数据清洗转换' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">目标字段 (Target Field)</label>
                      <input 
                        type="text" 
                        placeholder="例如: read_data 或 api_response"
                        value={(selectedNode.data.config as any)?.targetField || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'targetField', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-colors font-mono"
                      />
                      <span className="text-[9px] text-zinc-500 mt-1">留空则默认清洗整个上下文数据集。</span>
                    </div>

                    <div className="flex flex-col gap-1 mt-3">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">清洗模式选择</label>
                      <select 
                        value={(selectedNode.data.config as any)?.cleanMode || 'rule_based'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'cleanMode', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-purple-300 text-xs rounded-xl px-4 py-3 outline-none focus:border-purple-500 transition-colors cursor-pointer"
                      >
                        <option value="rule_based">⚙️ 极速物理规则清洗 (正则/类型转换/提取)</option>
                        <option value="ai_assisted">🧠 AI 智能语义清洗 (纠错/拆分/降维打击)</option>
                      </select>
                    </div>

                    {/* 规则模式 UI */}
                    {((selectedNode.data.config as any)?.cleanMode || 'rule_based') === 'rule_based' && (
                      <div className="flex flex-col gap-2 fade-in mt-3">
                        <div className="flex items-center justify-between mb-1">
                           <label className="text-xs text-zinc-200 font-bold tracking-wide">ETL 清洗规则管道 (顺序执行)</label>
                           <button 
                             onClick={() => {
                                const rules = (selectedNode.data.config as any)?.rules || [];
                                updateNodeConfig(selectedNode.id, 'rules', [...rules, { field: '', action: 'trim_spaces' }]);
                             }}
                             className="text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg transition-all shadow-inner ring-1 ring-emerald-500/30"
                           >+ 添加规则</button>
                        </div>
                        
                        {((selectedNode.data.config as any)?.rules || []).map((rule: any, idx: number) => (
                          <div key={idx} className="flex flex-col gap-2 bg-[#0c0c0e]/60 ring-1 ring-white/5 p-3 rounded-xl border border-white/5 shadow-inner">
                            <div className="flex gap-2">
                              <input 
                                placeholder="目标键名 (如 price, title)" 
                                value={rule.field} 
                                onChange={(e) => {
                                   const rules = [...((selectedNode.data.config as any)?.rules || [])];
                                   rules[idx].field = e.target.value;
                                   updateNodeConfig(selectedNode.id, 'rules', rules);
                                }} 
                                className="flex-1 bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-white text-xs px-2 py-2 rounded-lg focus:border-emerald-500 outline-none transition-colors font-mono" 
                              />
                              <button 
                                onClick={() => {
                                   const rules = [...((selectedNode.data.config as any)?.rules || [])];
                                   rules.splice(idx, 1);
                                   updateNodeConfig(selectedNode.id, 'rules', rules);
                                }}
                                className="text-red-400/80 hover:text-red-400 px-3 font-bold text-xs transition-all bg-red-500/5 hover:bg-red-500/20 rounded-lg"
                              >删除</button>
                            </div>
                            
                            <select 
                              value={rule.action} 
                              onChange={(e) => {
                                   const rules = [...((selectedNode.data.config as any)?.rules || [])];
                                   rules[idx].action = e.target.value;
                                   updateNodeConfig(selectedNode.id, 'rules', rules);
                              }} 
                              className="w-full bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 font-sans text-xs px-2 py-2 rounded-lg focus:border-emerald-500 outline-none transition-colors" 
                            >
                              <optgroup label="文本处理 (Text)">
                                <option value="trim_spaces">去除首尾空格与换行</option>
                                <option value="remove_html">剔除所有 HTML 标签</option>
                                <option value="replace_text">基础文本替换</option>
                                <option value="regex_replace">高级正则替换 (Regex)</option>
                              </optgroup>
                              <optgroup label="数值处理 (Number)">
                                <option value="extract_number">提取并转化为 Float 数字</option>
                              </optgroup>
                              <optgroup label="类型与结构 (Structure)">
                                <option value="parse_json">字符串解析为 JSON 对象</option>
                                <option value="format_date">日期文本格式化 (如转 YYYY-MM-DD)</option>
                                <option value="to_timestamp">日期文本转化为时间戳 (秒)</option>
                              </optgroup>
                              <optgroup label="键值流控 (Flow)">
                                <option value="fill_default">如果为空，则填充默认值</option>
                                <option value="rename_key">重命名此键名</option>
                                <option value="delete_key">直接删除此字段 (减脂)</option>
                              </optgroup>
                            </select>

                            {/* 动态参数输入面板 (根据不同的 action 渲染不同的附加参数框) */}
                            <div className="flex flex-col gap-1.5 mt-1">
                              {rule.action === 'rename_key' && (
                                <input placeholder="新键名 (如 user_name)" value={rule.param1 || ''} onChange={(e) => { const r = [...((selectedNode.data.config as any)?.rules || [])]; r[idx].param1 = e.target.value; updateNodeConfig(selectedNode.id, 'rules', r); }} className="w-full bg-[#0c0c0e]/80 border border-white/5 text-blue-400 font-mono text-xs px-2 py-2 rounded-lg outline-none" />
                              )}
                              {rule.action === 'replace_text' && (
                                <div className="flex gap-2">
                                  <input placeholder="被替换的词" value={rule.param1 || ''} onChange={(e) => { const r = [...((selectedNode.data.config as any)?.rules || [])]; r[idx].param1 = e.target.value; updateNodeConfig(selectedNode.id, 'rules', r); }} className="flex-1 bg-black/40 border border-white/5 text-zinc-300 text-xs px-2 py-2 rounded-lg outline-none" />
                                  <input placeholder="替换为 (可为空)" value={rule.param2 || ''} onChange={(e) => { const r = [...((selectedNode.data.config as any)?.rules || [])]; r[idx].param2 = e.target.value; updateNodeConfig(selectedNode.id, 'rules', r); }} className="flex-1 bg-black/40 border border-white/5 text-emerald-400 text-xs px-2 py-2 rounded-lg outline-none" />
                                </div>
                              )}
                              {rule.action === 'regex_replace' && (
                                <div className="flex gap-2">
                                  <input placeholder="正则模式 (如 \d+)" value={rule.param1 || ''} onChange={(e) => { const r = [...((selectedNode.data.config as any)?.rules || [])]; r[idx].param1 = e.target.value; updateNodeConfig(selectedNode.id, 'rules', r); }} className="flex-1 bg-black/40 border border-white/5 text-purple-400 font-mono text-xs px-2 py-2 rounded-lg outline-none" />
                                  <input placeholder="替换为" value={rule.param2 || ''} onChange={(e) => { const r = [...((selectedNode.data.config as any)?.rules || [])]; r[idx].param2 = e.target.value; updateNodeConfig(selectedNode.id, 'rules', r); }} className="w-1/3 bg-black/40 border border-white/5 text-emerald-400 text-xs px-2 py-2 rounded-lg outline-none" />
                                </div>
                              )}
                              {rule.action === 'fill_default' && (
                                <input placeholder="兜底默认值 (如 0 或 未知)" value={rule.param1 || ''} onChange={(e) => { const r = [...((selectedNode.data.config as any)?.rules || [])]; r[idx].param1 = e.target.value; updateNodeConfig(selectedNode.id, 'rules', r); }} className="w-full bg-[#0c0c0e]/80 border border-white/5 text-amber-400 font-mono text-xs px-2 py-2 rounded-lg outline-none" />
                              )}
                              {rule.action === 'format_date' && (
                                <input placeholder="目标格式 (如 %Y-%m-%d %H:%M:%S)" value={rule.param1 || ''} onChange={(e) => { const r = [...((selectedNode.data.config as any)?.rules || [])]; r[idx].param1 = e.target.value; updateNodeConfig(selectedNode.id, 'rules', r); }} className="w-full bg-[#0c0c0e]/80 border border-white/5 text-blue-400 font-mono text-xs px-2 py-2 rounded-lg outline-none" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* AI 模式 UI */}
                    {((selectedNode.data.config as any)?.cleanMode) === 'ai_assisted' && (
                      <div className="flex flex-col gap-1 mt-3 fade-in">
                        <label className="text-[10px] text-zinc-400 font-mono">AI 清洗与修正指令 (Prompt)</label>
                        <textarea 
                          placeholder="例如：将数据中 address 字段的错别字修正，并拆分为 province, city 两个新字段，价格如果有外币请按照今日汇率转为人民币数字。"
                          value={(selectedNode.data.config as any)?.aiPrompt || ''}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'aiPrompt', e.target.value)}
                          className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-purple-400 text-xs rounded-xl px-4 py-3 outline-none focus:border-purple-500 transition-colors font-sans h-24 resize-none"
                        />
                      </div>
                    )}
                  </>
                )}

                {/* AI 隐匿具身雷达 - 专属配置面板 */}
                {selectedNode.data.label === 'AI 隐匿具身雷达' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-zinc-400 font-mono">全局战术大脑 (大模型引擎选择)</label>
                      <select 
                        value={(selectedNode.data.config as any)?.model || 'qwen-vl-max-latest'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'model', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-purple-300 text-xs rounded p-2 outline-none font-sans"
                      >
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                        <option value="qwen-vl-max-latest">Qwen VL Max (千问视觉极客版)</option>
                        <option value="qwen-vl-plus-latest">Qwen VL Plus (千问视觉增强版)</option>
                        <option value="glm-4v-plus">GLM-4V-Plus (智谱视觉)</option>
                        <option value="gpt-4o">OpenAI GPT-4o</option>
                        <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                      </select>
                    </div>
                    <div className="text-[9px] text-zinc-500 mt-2 leading-relaxed bg-purple-500/10 p-2 border border-purple-500/20 rounded">
                      战术说明：该特工已放弃传统的前台自主乱点爬取模式。现在它作为「隐形智脑辅助」，专注于在后台辅佐【验证码对抗】与【智能剥壳】等节点，为它们提供页面元素的智能坐标系标定和解析工作。您只需要在此选择驱动它的模型核即可。
                    </div>
                  </>
                )}

                {/* 验证码视觉对抗突破 - 专属配置面板 */}
                {selectedNode.data.label === '验证码视觉对抗突破' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-zinc-400 font-mono">验证码破解战术 (全自动 AI 接管)</label>
                      <select 
                        value={(selectedNode.data.config as any)?.tactic || 'slider_cv'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'tactic', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors h-9"
                      >
                        <option value="slider_cv">滑动拼图验证码 (AI感知 + 仿生轨迹计算)</option>
                        <option value="click_ai">多模态点选/红绿灯/字序点击 (AI多模态直攻)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-2 mt-3 bg-[#0c0c0e]/60 ring-1 ring-white/5 p-3 border border-emerald-500/20 rounded shadow-inner">
                      <div className="text-xs text-emerald-400 font-bold tracking-widest flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5" />
                        AI 侦察联动就绪
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono leading-relaxed">
                        由于接驳了具身特工，您的战术选择已确认闭环。无需繁琐地填写 DOM Selector 或目标特征系提取指令，系统将在后台自动唤醒联动<span className="text-purple-400 px-1">AI 隐匿具身雷达</span>为您完成环境感知、目标锚点捕获以及大模型图像指令下达。
                      </div>
                    </div>
                    
                    <div className="text-[9px] text-zinc-500 mt-4 font-mono leading-relaxed bg-red-500/5 p-2 rounded border border-red-500/10">
                      💡 <b>执行提示:</b> 本节点已实现全托管。验证系统和需要点击的选项可从截图中自解译，如果需要切换特工的思考核算型号，可以在【AI 隐匿具身雷达】节点的配置面板中统一指定。
                    </div>
                  </>
                )}

                {/* 动态载荷智能剥壳 - 专属配置面板 */}
                {selectedNode.data.label === '动态载荷智能剥壳' && (
                  <>
                    <div className="flex flex-col gap-1 mt-3">
                      <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">解密模式</label>
                      <select 
                        value={(selectedNode.data.config as any)?.cryptoMode || 'conventional'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'cryptoMode', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-purple-300 text-xs rounded p-2 outline-none focus:border-purple-500 transition-colors cursor-pointer"
                      >
                         <option value="conventional">常规多字段解密 (Base64/URLDecode/正则)</option>
                         <option value="ai_assisted">AI 大模型特征提取解密</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1 mt-3">
                      <label className="text-[10px] text-zinc-400 font-mono">目标字段路径 (支持层级与逗号分隔)</label>
                      <input 
                        type="text"
                        placeholder="留空默认 html 根节点, 例: context.token, context.extracted_data.token"
                        value={(selectedNode.data.config as any)?.targetFields ?? 'context.html'}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'targetFields', e.target.value)}
                        className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-emerald-400 text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors font-mono"
                      />
                      <span className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
                        提示: 解密后将<b>直接替换/覆写原路径</b>对应的值。例如输入 <code>context.token</code>
                      </span>
                    </div>

                    {(selectedNode.data.config as any)?.cryptoMode === 'ai_assisted' ? (
                      <>
                        <div className="flex flex-col gap-1 mt-3">
                          <label className="text-[10px] text-zinc-400 font-mono">核算模型引擎 (Model)</label>
                          <select 
                            value={(selectedNode.data.config as any)?.model || 'gpt-4o-mini'}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'model', e.target.value)}
                            className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-purple-300 text-xs rounded p-2 outline-none focus:border-purple-500 transition-colors"
                          >
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                            <option value="deepseek-chat">DeepSeek V3 (deepseek-chat)</option>
                            <option value="deepseek-reasoner">DeepSeek R1 (deepseek-reasoner)</option>
                            <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                            <option value="gpt-4o">GPT-4o</option>
                            <option value="gpt-4o-mini">GPT-4o Mini</option>
                            <option value="qwen-max">千问 Max (qwen-max)</option>
                            <option value="qwen-plus">千问 Plus (qwen-plus)</option>
                            <option value="qwen-turbo">千问 Turbo (qwen-turbo)</option>
                            <option value="glm-4-plus">智谱 GLM-4-Plus</option>
                            <option value="glm-4-air">智谱 GLM-4-Air</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-2 mt-3 bg-[#0c0c0e]/90 ring-1 ring-white/5 shadow-inner backdrop-blur-md p-3 rounded-lg border border-purple-500/30 transition-all hover:border-purple-500/50">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-col">
                              <label className="text-[13px] font-bold text-zinc-200">自动降噪滤清器 (Token 压缩)</label>
                              <span className="text-[10px] text-zinc-400 mt-1 leading-relaxed">开启后将非侵入式地提取底层网页文本，将庞大脏乱的 HTML 物理蜕壳为极简 Markdown。<br/><span className="text-emerald-400 font-bold">最高节省 80% 令牌耗量</span>，并大幅减少大模型提取幻觉率。</span>
                            </div>
                            <input 
                              type="checkbox" 
                              checked={(selectedNode.data.config as any)?.autoSlim !== false}
                              onChange={(e) => updateNodeConfig(selectedNode.id, 'autoSlim', e.target.checked)}
                              className="accent-purple-500 w-4 h-4 mt-1 shrink-0 cursor-pointer"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1 mt-3">
                          <label className="text-[10px] text-zinc-400 font-mono">AI 解密提取指令</label>
                          <textarea 
                            placeholder="例如：读取以下乱码特征，找到对应的真实价格数字，将其转换为纯数字格式返回"
                            value={(selectedNode.data.config as any)?.aiPrompt || ''}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'aiPrompt', e.target.value)}
                            className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-purple-400 text-xs rounded p-2 outline-none focus:border-purple-500 transition-colors font-mono h-24 resize-none"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1 mt-3">
                          <label className="text-[10px] text-zinc-400 font-mono">处理算法</label>
                          <select 
                            value={(selectedNode.data.config as any)?.algorithm || 'base64'}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'algorithm', e.target.value)}
                            className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-white text-xs rounded p-2 outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                          >
                             <option value="base64">Base64 解码</option>
                             <option value="urldecode">URL 解码 (URL Decode)</option>
                             <option value="html_slim">HTML 物理降噪 (转化为 Markdown)</option>
                             <option value="regex_extract">正则/字符截取</option>
                          </select>
                        </div>
                        
                        {(selectedNode.data.config as any)?.algorithm === 'regex_extract' && (
                            <div className="flex flex-col gap-1 mt-3">
                              <label className="text-sm text-zinc-200 font-bold tracking-wide mb-1.5 inline-block">正则表达式 (匹配组1将作为结果)</label>
                              <input 
                                type="text"
                                placeholder="例如：window.__INITIAL_STATE__=(.*?);"
                                value={(selectedNode.data.config as any)?.regexPattern || ''}
                                onChange={(e) => updateNodeConfig(selectedNode.id, 'regexPattern', e.target.value)}
                                className="bg-[#0c0c0e]/80 border border-white/5 shadow-inner text-purple-400 text-xs rounded p-2 outline-none focus:border-purple-500 transition-colors font-mono"
                              />
                            </div>
                        )}
                      </>
                    )}

                    <div className="text-[9px] text-zinc-500 mt-5 font-mono leading-relaxed bg-blue-500/5 p-2 rounded border border-blue-500/10">
                      💡 <b>解密说明:</b> 对载荷进行剥离解密。支持单/多字段常规剥壳，以及使用 AI 隐匿具身雷达进行定点或复杂的智能解密。
                    </div>
                  </>
                )}

                {!selectedNode.data.config && selectedNode.data.label !== '人工战术挂起断点' && selectedNode.data.label !== '智能风控路由哨兵' && selectedNode.data.label !== '验证码视觉对抗突破' && selectedNode.data.label !== 'HTTP 状态码路由' && selectedNode.data.label !== 'AI 隐匿具身雷达' && selectedNode.data.label !== '轻量静态 HTTP 抓取' && selectedNode.data.label !== '特征与 DOM 萃取' && selectedNode.data.label !== '大模型智能萃取与清洗' && selectedNode.data.label !== '脉冲并发请求' && selectedNode.data.label !== '即时状态分发' && selectedNode.data.label !== '子任务下发中心' && selectedNode.data.label !== 'Playwright 拟真沙箱' && selectedNode.data.label !== '代理 IP 调度池' && selectedNode.data.label !== '系统定时节拍器' && selectedNode.data.label !== '任务调度队列' && selectedNode.data.label !== '外部接口 WebHook 触发' && selectedNode.data.label !== '指纹与 Headers 随机化' && selectedNode.data.label !== '会话身份驻留池' && selectedNode.data.label !== '持久化知识库' && selectedNode.data.label !== '文件与多媒体保存' && selectedNode.data.label !== '动态载荷智能剥壳' && (
                  <div className="text-xs text-zinc-600 font-mono italic">
                    暂无暴露的配置参数...
                  </div>
                )}
              </div>
            </div>

            {/* Dependencies Section */}
            {(() => {
              const deps = edges
                .filter(e => e.target === selectedNode.id)
                .map(e => nodes.find(n => n.id === e.source))
                .filter(Boolean);
                
              const getExpectedDeps = (label: string): string[] => {
                switch(label) {
                  case '大模型智能萃取与清洗':
                  case '特征与 DOM 萃取':
                  return ['[前置要求]: 网页生肉 HTML (必须连接在【操作节点】之后)'];
                  case '数据读取与加载':
                  return ['[数据引入]: 可作为源头加载本地/远程文件，也可放置在任意流程中注入额外数据'];
                  case '即时状态分发':
                  case '持久化知识库':
                  case '文件与多媒体保存':
                    return ['[前置要求]: 结构化 JSON 数据 (必须连接在【智能清洗/提取节点】之后)'];
                  case '子任务下发中心':
                    return ['[前置要求]: 提取到的 URL 碎片字典 (必须连接在【链接特征提取器】之后)'];
                  case '轻量静态 HTTP 抓取':
                  case 'Playwright 拟真沙箱':
                    return ['[战术配件]: 可连入【代理 IP 调度池】隐匿行踪，或【脉冲并发请求】实现爆破'];
                  case '代理 IP 调度池':
                  case '指纹与 Headers 随机化':
                    return ['[位置约束]: 必须放置于【发包抓取节点】之前，仅起修改 Context 的作用'];
                  case '脉冲并发请求':
                    return ['[阵型要求]: 建议挂载在【触发器】之后作为裂变源头'];
                  case '验证码视觉对抗突破':
                  return ['[前置要求]: 必须有浏览器上下文 (推荐直接跟在【Playwright 拟真沙箱】之后)'];
                  case '会话身份驻留池':
                    return ['[前置要求]: 推荐挂载在成功登录/过验证的节点之后，保存凭证提取会话'];
                  case 'AI 隐匿具身雷达':
                    return ['[定位说明]: 作为辅助感知雷达驻留后台。', '[用途]: 辅佐【验证码对抗】/【智能剥壳】等节点进行 DOM 坐标系自动标定与元素提取。'];
                  default:
                    return [];
                }
              };
              
              const expectedDeps = getExpectedDeps(selectedNode.data.label as string);
              
              // Validate connections
              let isValidConnection = true;
              let validationMsg = "";
              if ((selectedNode.data.type === '智能' && selectedNode.data.label !== '数据读取与加载') || selectedNode.data.type === '输出') {
                if (deps.length === 0) {
                  isValidConnection = false;
                  validationMsg = "等待上游数据节点连接...";
                }
              }
              if (selectedNode.data.type === '对抗' && selectedNode.data.label !== '会话身份驻留池') {
                 if (!edges.find(e => e.source === selectedNode.id)) {
                    isValidConnection = false;
                    validationMsg = "对抗节点必须作为前置连接到操作节点 (如下游抓取)";
                 }
              }

              if (expectedDeps.length > 0 || deps.length > 0 || !isValidConnection) {
                return (
                  <div className="flex flex-col gap-2">
                    <details className="group" open>
                      <summary className="text-xs font-mono text-indigo-400/80 uppercase tracking-widest border-b border-indigo-500/20 pb-1 flex items-center cursor-pointer list-none outline-none hover:text-indigo-400 transition-colors">
                        <ChevronRight className="w-3 h-3 mr-1 transition-transform group-open:rotate-90 text-indigo-600/50" />
                        数据流与前置约束 (Data Flow Constraints)
                      </summary>
                      <div className="mt-2 flex flex-col gap-1.5 pl-4 border-l border-indigo-500/20 ml-1.5">
                        {!isValidConnection && (
                           <div className="text-xs text-red-400 font-mono flex items-start gap-2 p-1.5 rounded bg-red-500/10 border border-red-500/30 cursor-default leading-relaxed animate-pulse">
                             <div className="text-red-400 shrink-0 mt-0.5"><ShieldAlert className="w-3 h-3"/></div>
                             <span>[连线异常]: {validationMsg}</span>
                           </div>
                        )}
                        {expectedDeps.map((dep, idx) => (
                          <div key={`exp-${idx}`} className="text-xs text-zinc-300 font-mono flex items-start gap-2 p-1.5 rounded bg-indigo-500/5 border border-indigo-500/20 cursor-default leading-relaxed">
                             <div className="text-indigo-400 shrink-0 mt-0.5"><Info className="w-3 h-3"/></div>
                             <span>{dep}</span>
                          </div>
                        ))}
                        
                        {deps.length > 0 && (
                          <div className="mt-2 text-[9px] text-zinc-500 font-mono uppercase tracking-widest">
                            当前已挂载链路 (Mounted Upstreams):
                          </div>
                        )}
                        {deps.map((dep: any) => (
                          <div key={dep.id} className="text-xs text-zinc-400 font-mono flex items-center gap-2 p-1.5 rounded bg-white/5 ring-1 ring-white/10/50 hover:bg-[#0c0c0e]/80 transition-colors cursor-default">
                             <div className="text-zinc-500">{getIconForLabel(dep.data.label, "w-3 h-3")}</div>
                             <span className="truncate">{dep.data.label}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                );
              }
              return null;
            })()}

              <div className="flex flex-col gap-4 mt-4 shadow-2xl">
                <h3 className="text-xs font-display text-zinc-500 uppercase tracking-widest font-bold flex items-center font-display gap-2">
                  <div className="h-px bg-zinc-800 flex-1"></div>
                  SYSTEM LOGS & MONITOR
                  <div className="h-px bg-zinc-800 flex-1"></div>
                </h3>
                <div className="h-44 bg-[#030304] border border-white/5 shadow-[inset_0_0_30px_rgba(0,0,0,0.8)] rounded-xl flex flex-col p-4 overflow-hidden relative font-mono text-[11px] leading-relaxed break-all">
                  {/* Top terminal bar */}
                  <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                     <div className="flex gap-1.5">
                       <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                       <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                       <div className="w-2 h-2 rounded-full bg-emerald-500/50"></div>
                     </div>
                     <span className="text-[9px] text-zinc-600 tracking-widest font-bold">TERMINAL v1.2.0-beta</span>
                  </div>

                  <div className="flex-1 opacity-90 text-zinc-400 overflow-y-auto">
                    <div className="text-emerald-500/80 flex gap-2"><span className="text-zinc-600">&gt;</span> 模块自检通过... [OK]</div>
                    <div className="text-emerald-500/80 flex gap-2"><span className="text-zinc-600">&gt;</span> 节点依赖已加载... [SUCCESS]</div>
                    <div className="text-zinc-500 flex gap-2"><span className="text-zinc-600">&gt;</span> 等待调度信号... O_O</div>
                    {isRunning && (
                      <div className="mt-2 text-zinc-300 flex flex-col gap-1.5">
                        <div className="text-blue-400 flex gap-2"><span className="text-zinc-600">&gt;</span> [SYS::REQ] 接收到执行指令</div>
                        <div className="flex gap-2 text-emerald-300"><span className="text-zinc-600">&gt;</span> PID: {selectedNode.id.split('_').pop()?.slice(-4) || 'CORE'} 初始化引擎...</div>
                        <div className="flex gap-2 text-purple-400"><span className="text-zinc-600">&gt;</span> 分配计算资源... [OK]</div>
                        <div className="text-emerald-400 animate-pulse mt-1 ml-4 shadow-emerald-400/50 drop-shadow-md">&#9608;</div>
                      </div>
                    )}
                  </div>
                  {/* scanline and noise effects */}
                  <div className="absolute inset-0 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 mix-blend-overlay"></div>
                  <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.3)_51%)] bg-[length:100%_4px] opacity-40 mix-blend-overlay" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
