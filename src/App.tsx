import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Square, Settings, ShieldAlert, Cpu, Activity, Clock, Zap, X, ChevronDown, HelpCircle, BookOpen, Minus, Maximize2, Save, Download, BrainCircuit, Globe } from 'lucide-react';
import { useNodesState, useEdgesState, addEdge, Connection, Edge, ReactFlowProvider } from '@xyflow/react';
import FlowEditor, { initialNodes, initialEdges } from './components/FlowEditor';
import Dashboard from './components/Dashboard';
import TerminalLog from './components/TerminalLog';
import { predefinedTemplates } from './lib/templates';
import { motion, AnimatePresence } from 'motion/react';

function LiveTelemetry({ isRunning, nodes }: { isRunning: boolean; nodes: any[] }) {
  const [activeTasks, setActiveTasks] = useState(0);
  const [successRate, setSuccessRate] = useState(100);

  useEffect(() => {
    if (isRunning) {
      setActiveTasks(0);
      setSuccessRate(100);
    }
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'telemetry') {
          setActiveTasks(payload.throughput || 0);
          setSuccessRate(payload.evasionRate ?? 100);
        }
      } catch (e) {}
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [isRunning]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="p-3 bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] backdrop-blur-md rounded-xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <span className="text-xs text-zinc-500 uppercase tracking-[0.2em] font-display font-medium" title="当前发包量 (Throughput)">并发活跃吞吐量</span>
        <div className="flex items-baseline gap-1 mt-1 relative z-10">
          <span className="text-2xl font-semibold text-blue-400 tracking-tight">{activeTasks}</span>
        </div>
      </div>
      <div className="p-3 bg-[#0c0c0e]/80 ring-1 ring-white/5 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] backdrop-blur-md rounded-xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <span className="text-xs text-zinc-500 uppercase tracking-[0.2em] font-display font-medium" title="防风控穿透率 (Evasion Rate)">流水线健康度</span>
        <div className="flex items-baseline gap-1 mt-1 relative z-10">
          <span className="text-2xl font-semibold text-emerald-400 tracking-tight">{successRate.toFixed(1)}</span>
          <span className="text-xs text-emerald-500/50 font-medium">%</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'flow' | 'metrics'>('flow');
  const [showTemplates, setShowTemplates] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const [globalStats, setGlobalStats] = useState({
    totalScraped: 0,
    totalBlocked: 0,
    llmTokens: 0,
    sessionLlmTokens: 0,
    sessionScraped: 0,
    sessionBlocked: 0,
    sessionLlms: 0,
    savedCharacters: 0,
    system: {
      os: 'Loading',
      python: '...',
      encoding: '...',
      port: '3000'
    }
  });

  useEffect(() => {
    let isMounted = true;
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        const d = await res.json();
        if (isMounted && d) {
          setIsBackendOnline(true);
          setGlobalStats({
            totalScraped: d.totalScraped || 0,
            totalBlocked: d.totalBlocked || 0,
            llmTokens: d.llmTokens || 0,
            sessionLlmTokens: d.sessionLlmTokens || 0,
            sessionScraped: d.sessionScraped || 0,
            sessionBlocked: d.sessionBlocked || 0,
            sessionLlms: d.sessionLlms || 0,
            savedCharacters: d.savedCharacters || 0,
            system: d.system || {
              os: 'Unknown',
              python: 'Unknown',
              encoding: 'Unknown',
              port: '3000'
            }
          });
        }
      } catch (e) {
        if (isMounted) setIsBackendOnline(false);
      }
    };

    fetchStats();
    const statsInterval = setInterval(fetchStats, 2000);
    return () => {
      isMounted = false;
      clearInterval(statsInterval);
    };
  }, []);

  // --- 架构重构：同步真实后端引擎状态 ---
  // 组件挂载时拉取引擎状态，确保页面刷新不丢失执行状态
  useEffect(() => {
    fetch('/api/pipeline/status')
      .then(res => res.json())
      .then(data => {
        if (data.isRunning) setIsRunning(true);
      })
      .catch((e) => console.log('引擎尚未就绪或网络异常', e));
  }, []);

  const isInitialized = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('arachne_saved_flow');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.nodes && parsed.edges && parsed.nodes.length > 0) {
          setNodes(parsed.nodes);
          setEdges(parsed.edges);
        }
      } catch (e) {
        console.error("Failed to parse saved flow");
      }
    }
    isInitialized.current = true;
    setTimeout(() => {
      setIsLoaded(true);
    }, 50);
  }, [setNodes, setEdges]);

  // --- 优化：防抖自动持久化到本地存储 ---
  useEffect(() => {
    // 确保初始化完成后才开始监听与自动保存，防止初始空画布覆盖用户的本地存档
    if (!isInitialized.current || !isLoaded) return;
    
    // 使用800ms防抖，避免频繁拖拽造成严重的性能问题
    const timer = setTimeout(() => {
      localStorage.setItem('arachne_saved_flow', JSON.stringify({ nodes, edges }));
    }, 800);
    
    return () => clearTimeout(timer);
  }, [nodes, edges, isLoaded]);

  const loadTemplate = (key: string) => {
    const template = predefinedTemplates[key];
    if (template) {
      setIsLoaded(false);
      setNodes(template.nodes);
      setEdges(template.edges);
      setShowTemplates(false);
      setTimeout(() => setIsLoaded(true), 50);
    }
  };

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge({
      ...params,
      type: 'smoothstep',
      animated: isRunning,
      interactionWidth: 25,
      style: { stroke: '#10b981', strokeWidth: 3 }
    } as any, eds)),
    [setEdges, isRunning],
  );

  const handleStartAttack = async () => {
    const nextState = !isRunning;
    setIsRunning(nextState);
    
    if (nextState) {
      try {
        await fetch('/api/pipeline/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodes, edges })
        });
      } catch (e) {
        console.error("靶机连接失败", e);
      }
    } else {
      try {
        await fetch('/api/pipeline/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        console.error("靶机连接失败", e);
      }
    }
  };

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen w-full bg-[#0a0a0c] text-zinc-300 font-sans selection:bg-emerald-500 selection:text-black overflow-hidden tracking-wide">
        {/* Custom OS Title Bar (Simulated) */}
        <div className="h-9 shrink-0 bg-[#000] flex items-center px-4 select-none webkit-app-region-drag relative z-50">
          <div className="flex items-center gap-4 relative z-10 w-full">
            <div className="flex items-center gap-2 group hover:opacity-100 opacity-80 transition-opacity shrink-0">
              <button onClick={() => window.close()} title="关闭引擎 (Close)" className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-inner border border-black/20 flex items-center justify-center">
                <X className="w-2 h-2 text-black/50 opacity-0 group-hover:opacity-100" />
              </button>
              <button onClick={() => window.alert('引擎已在后台运行中...')} title="最小化到托盘 (Minimize)" className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-inner border border-black/20 flex items-center justify-center">
                <Minus className="w-2 h-2 text-black/50 opacity-0 group-hover:opacity-100" />
              </button>
              <button onClick={() => document.documentElement.requestFullscreen().catch(() => {})} title="全屏接管 (Fullscreen)" className="w-3 h-3 rounded-full bg-[#27c93f] shadow-inner border border-black/20 flex items-center justify-center">
                <Maximize2 className="w-2 h-2 text-black/50 opacity-0 group-hover:opacity-100" />
              </button>
            </div>
            <div className="h-3 w-px bg-white/10 shrink-0"></div>
            <div className="text-[10px] text-zinc-500 font-display font-medium tracking-[0.2em] uppercase flex items-center shrink-0">
              Arachne Engine
            </div>
          </div>
        </div>

        {/* Main App Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <aside className="w-16 flex flex-col items-center py-6 bg-[#000] z-20 shadow-[4px_0_24px_rgba(0,0,0,0.5)]">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 flex items-center justify-center mb-10">
              <ShieldAlert className="text-zinc-400 w-5 h-5" />
            </div>
            <nav className="flex flex-col gap-6 flex-1">
              <button 
                onClick={() => setActiveTab('flow')}
                className={`p-3 rounded-xl transition-all duration-300 ${activeTab === 'flow' ? 'bg-zinc-900 text-white shadow-lg' : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
              >
                <Cpu className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setActiveTab('metrics')}
                className={`p-3 rounded-xl transition-all duration-300 ${activeTab === 'metrics' ? 'bg-zinc-900 text-white shadow-lg' : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
              >
                <Activity className="w-5 h-5" />
              </button>
            </nav>
            <div className="mt-auto relative z-50">
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="p-3 text-zinc-600 hover:text-zinc-300 transition-colors rounded-xl hover:bg-zinc-900/50"
              >
                <Settings className="w-5 h-5" />
              </button>
              
              <AnimatePresence>
                {showSettings && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-0 left-14 ml-4 w-56 bg-[#0A0A0A] border border-zinc-800/60 rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.9)] backdrop-blur-3xl flex flex-col p-1.5 z-50 text-xs font-sans ring-1 ring-white/5"
                  >
                    <div className="px-3 py-2 text-[10px] font-mono tracking-widest text-zinc-500 uppercase border-b border-white/5 mb-1 bg-white/[0.02] rounded-t-lg">
                      画布操作 (Actions)
                    </div>
                    
                    <button 
                      onClick={() => setShowTemplates(!showTemplates)} 
                      className="text-left px-3 py-2.5 hover:bg-white/5 text-zinc-300 rounded-lg transition-colors flex items-center justify-between group"
                    >
                      <span className="flex items-center gap-2">
                        <BookOpen className="w-3.5 h-3.5 opacity-50 group-hover:text-emerald-400 group-hover:opacity-100 transition-colors" />
                        执行模板
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform opacity-50 ${showTemplates ? 'rotate-180' : ''}`} />
                    </button>

                    {showTemplates && (
                      <div className="bg-black/50 rounded-lg p-1 mx-1 mb-1 border border-white/5">
                        <button onClick={() => { loadTemplate('basic_spider'); setShowSettings(false); setShowTemplates(false); }} className="w-full text-left px-3 py-2 hover:bg-white/5 text-zinc-300 rounded-md transition-colors flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span> 基础内容采集
                        </button>
                        <button onClick={() => { loadTemplate('xhs_spider'); setShowSettings(false); setShowTemplates(false); }} className="w-full text-left px-3 py-2 hover:bg-white/5 text-zinc-300 rounded-md transition-colors flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]"></span> 深度防风控采集
                        </button>
                        <button onClick={() => { loadTemplate('damai_sniper'); setShowSettings(false); setShowTemplates(false); }} className="w-full text-left px-3 py-2 hover:bg-white/5 text-zinc-300 rounded-md transition-colors flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.5)]"></span> 高并发调度清洗
                        </button>
                      </div>
                    )}
                    
                    <div className="h-px w-full bg-white/5 my-1"></div>

                    <button 
                      onClick={() => { setShowSettings(false); setShowHelp(true); }}
                      className="text-left px-3 py-2.5 hover:bg-white/5 text-zinc-300 rounded-lg transition-colors flex items-center gap-2 group"
                    >
                      <HelpCircle className="w-3.5 h-3.5 opacity-50 group-hover:text-blue-400 group-hover:opacity-100 transition-colors" />
                      操作指南
                    </button>

                    <button
                      onClick={() => {
                        setShowSettings(false);
                        const state = { nodes, edges };
                        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `arachne-flow-${new Date().getTime()}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="text-left px-3 py-2.5 hover:bg-white/5 text-zinc-300 rounded-lg transition-colors flex items-center gap-2 group"
                    >
                      <Save className="w-3.5 h-3.5 opacity-50 group-hover:text-amber-400 group-hover:opacity-100 transition-colors" />
                      保存画布文件
                    </button>

                    <label className="text-left px-3 py-2.5 hover:bg-white/5 text-zinc-300 rounded-lg transition-colors flex items-center gap-2 group cursor-pointer m-0">
                      <Download className="w-3.5 h-3.5 opacity-50 group-hover:text-purple-400 group-hover:opacity-100 transition-colors" />
                      加载画布文件
                      <input 
                        type="file" 
                        accept=".json"
                        className="hidden"
                        onChange={(e) => {
                          setShowSettings(false);
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (e) => {
                            try {
                              const state = JSON.parse(e.target?.result as string);
                              if (state.nodes && state.edges) {
                                setIsLoaded(false);
                                setNodes(state.nodes);
                                setEdges(state.edges);
                                setTimeout(() => setIsLoaded(true), 50);
                                window.alert(`成功加载工作流：包含 ${state.nodes.length} 个节点和 ${state.edges.length} 条连线。`);
                              } else {
                                window.alert('导入失败：不是有效的 Arachne 画布文件格式！');
                              }
                            } catch (err) {
                              window.alert('解析文件失败：JSON 格式损坏！');
                            }
                          };
                          reader.readAsText(file);
                          e.target.value = '';
                        }}
                      />
                    </label>

                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col min-w-0 relative bg-[#050505] rounded-tl-2xl overflow-hidden mr-2 mb-2">
            {/* Header */}
            <header className="h-14 flex justify-end px-6 bg-[#050505]/80 backdrop-blur-md relative z-20">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-xs uppercase font-medium tracking-[0.2em] text-zinc-600 font-mono">
                  {new Date().toLocaleTimeString('en-US', {hour12: false})}
                </div>
                <button 
                  onClick={handleStartAttack}
                  className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-medium transition-all duration-300 ${
                    isRunning 
                      ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                      : 'bg-white text-black hover:bg-zinc-200 shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                  }`}
                >
                  {isRunning ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                  {isRunning ? '停止执行' : '启动流水线'}
                </button>
              </div>
            </header>

            {/* Dynamic Content Area */}
            <div className="flex-1 flex min-h-0 bg-[#050505]">
              {/* Left/Main Panel */}
              <div className="flex-1 flex flex-col min-w-0 bg-[#050505] relative z-10">
                <div className={`flex-1 flex flex-col min-h-0 ${activeTab === 'flow' ? '' : 'hidden'}`}>
                  {isLoaded && (
                    <FlowEditor 
                      isRunning={isRunning} 
                      nodes={nodes}
                      edges={edges}
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      onConnect={onConnect}
                      setNodes={setNodes}
                      setEdges={setEdges}
                    />
                  )}
                </div>
                <div className={`flex-1 flex flex-col min-h-0 ${activeTab === 'metrics' ? '' : 'hidden'}`}>
                  <Dashboard isRunning={isRunning} globalStats={globalStats} />
                </div>
              </div>

              {/* Right Sidebar - Status Terminal */}
              <div className={`w-[420px] flex flex-col bg-[#030304] border-l border-white/5 shadow-[-10px_0_40px_rgba(0,0,0,0.8)] z-20 relative overflow-hidden ${activeTab === 'flow' ? '' : 'hidden'}`}>
                <div className="p-6 bg-gradient-to-b from-white/[0.03] to-transparent border-b border-white/5 relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2"><div className="w-1.5 h-3.5 bg-emerald-500 rounded-sm shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div><h2 className="text-[14px] font-bold text-zinc-200 tracking-wider font-mono uppercase">态势感知侧边栏</h2></div>
                    <span className={`flex items-center gap-1.5 text-xs font-sans font-medium tracking-wide ${isRunning ? 'text-emerald-500' : 'text-zinc-600'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-zinc-700'}`}></div>
                      {isRunning ? '执行中' : '空闲待机'}
                    </span>
                  </div>
                  <LiveTelemetry isRunning={isRunning} nodes={nodes} />
                </div>
                <div className="flex-1 min-h-0 bg-[#000] flex flex-col">
                  <TerminalLog isRunning={isRunning} onEngineStatusChange={(status) => setIsRunning(status)} nodes={nodes} edges={edges} />
                </div>
              </div>
            </div>
          </main>
        </div>

        {/* Help Modal */}
        <AnimatePresence>
          {showHelp && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xl flex items-center justify-center p-8"
              onClick={() => setShowHelp(false)}
            >
              <motion.div 
                initial={{ scale: 0.95, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 10, opacity: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                className="bg-[#050505] ring-1 ring-white/10 shadow-[0_32px_64px_rgba(0,0,0,0.8)] rounded-3xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="shrink-0 bg-[#050505] border-b border-white/5 p-6 flex items-center justify-between z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center ring-1 ring-indigo-500/20 text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.15)]">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-medium text-white tracking-tight font-display">架构设计指南</h2>
                      <div className="text-xs text-zinc-500 font-display tracking-[0.2em] uppercase mt-0.5">Arachne 节点流转机制</div>
                    </div>
                  </div>
                  <button onClick={() => setShowHelp(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="p-8 pt-6 flex-1 overflow-y-auto custom-scrollbar text-sm text-zinc-300 leading-relaxed font-sans">
                  
                  {/* 新手操作指南 */}
                  <div className="mb-12">
                    <h3 className="text-lg font-medium text-white tracking-tight font-display mb-6 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center ring-1 ring-orange-500/20 text-orange-400">
                        <Zap className="w-4 h-4" />
                      </div>
                      新手操作指南 (新手必看)
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-[#0c0c0e]/80 p-5 rounded-2xl ring-1 ring-white/5 shadow-lg relative group">
                        <div className="flex items-center gap-3 mb-3">
                          <kbd className="px-2 py-1 rounded bg-white/5 ring-1 ring-white/10 text-zinc-300 font-mono font-bold shadow-inner flex items-center justify-center text-xs">鼠标右键</kbd> 
                          <span className="font-medium text-white">添加新节点</span>
                        </div>
                        <p className="text-xs text-zinc-500 mb-3">在画布的空白处点击鼠标右键，可以唤出节点生成菜单。你可以选择并添加需要的节点类型（如请求载荷、大模型提纯等）到工作区。</p>
                      </div>

                      <div className="bg-[#0c0c0e]/80 p-5 rounded-2xl ring-1 ring-white/5 shadow-lg relative group">
                        <div className="flex items-center gap-3 mb-3">
                          <kbd className="px-2 py-1 rounded bg-white/5 ring-1 ring-white/10 text-zinc-300 font-mono font-bold shadow-inner flex items-center justify-center text-xs">鼠标左键</kbd> 
                          <span className="font-medium text-white">配置节点参数</span>
                        </div>
                        <p className="text-xs text-zinc-500 mb-3">单击任何一个节点，即可在右侧边栏打开该节点的“参数配置面板”。在这里输入爬虫 URL、CSS 选择器、提取规则和数据库路径等。</p>
                      </div>

                      <div className="bg-[#0c0c0e]/80 p-5 rounded-2xl ring-1 ring-white/5 shadow-lg relative group">
                        <div className="flex items-center gap-3 mb-3">
                          <kbd className="px-2 py-1 rounded bg-white/5 ring-1 ring-white/10 text-zinc-300 font-mono font-bold shadow-inner flex items-center justify-center text-xs">拖拽锚点</kbd> 
                          <span className="font-medium text-white">连接流水线</span>
                        </div>
                        <p className="text-xs text-zinc-500 mb-3">在节点左右两侧有白色小圆点（锚点）。按住左键从一个节点的右侧锚点拖拽出一条线，连接到另一个节点的左侧锚点，即可构建完整的流水线逻辑。</p>
                      </div>
                    </div>
                  </div>

                  <div className="h-px w-full bg-white/5 mb-10"></div>

                  <h3 className="text-lg font-medium text-white tracking-tight font-display mb-6 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center ring-1 ring-indigo-500/20 text-indigo-400">
                      <Cpu className="w-4 h-4" />
                    </div>
                    节点流转机制与作用
                  </h3>
                  
                  <p className="mb-8 opacity-80 break-words leading-loose border-l-2 border-indigo-500/50 pl-5 text-zinc-400 bg-indigo-500/5 py-3 rounded-r-lg">
                    将数据采集流拆分为高度解耦的微模块，是 Arachne 智能采集引擎的核心理念。无需学习复杂的代码结构，您只需要遵循 <b>“发现目标 → 穿透防护 → 获取载荷 → 智能提纯 → 持久化存储”</b> 的流水线编排逻辑。
                  </p>
                  
                  <div className="space-y-10 pl-2">
                    <div className="relative">
                      <div className="absolute top-4 bottom-4 left-5 w-px bg-zinc-800/60"></div>
                      
                      <div className="flex gap-6 relative z-10 mb-8">
                        <div className="w-10 h-10 shrink-0 rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30 flex flex-col items-center justify-center text-emerald-400 font-bold text-sm shadow-[0_0_15px_rgba(16,185,129,0.1)]">1</div>
                        <div className="pt-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-white text-base">信号触发 (Trigger)</h3>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 uppercase font-mono tracking-wider">流水线源头</span>
                          </div>
                          <p className="text-sm text-zinc-400 mb-3">触发是节点任务的起点，为下级节点提供分发指令。</p>
                          <ul className="text-sm text-zinc-500 list-disc pl-5 space-y-2 font-mono">
                            <li><span className="text-zinc-300">系统定时节拍器：</span> 定频循环触发，适合价格监控、趋势感知。</li>
                            <li><span className="text-zinc-300">任务调度队列：</span> 监听 Kafka 等外部任务流，实现微服务架构平滑接入。</li>
                          </ul>
                        </div>
                      </div>

                      <div className="flex gap-6 relative z-10 mb-8">
                        <div className="w-10 h-10 shrink-0 rounded-2xl bg-red-500/10 ring-1 ring-red-500/30 flex flex-col items-center justify-center text-red-400 font-bold text-sm shadow-[0_0_15px_rgba(239,68,68,0.1)]">2</div>
                        <div className="pt-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-white text-base">环境与网络穿透 (Evasion)</h3>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 uppercase font-mono tracking-wider">多级代理网关</span>
                          </div>
                          <p className="text-sm text-zinc-400 mb-3">为下游的网络交互构建安全的隔离沙箱与请求网关，确保采集链路的可用性。</p>
                          <ul className="text-sm text-zinc-500 list-disc pl-5 space-y-2 font-mono">
                            <li><span className="text-zinc-300">代理 IP 动态路由池：</span> 精细化切分隔离网络身份标识。</li>
                            <li><span className="text-zinc-300">防风控浏览器指纹：</span> 动态构建浏览器运行时特征 (Canvas/WebGL Context)。</li>
                            <li><span className="text-zinc-300">验证码无感穿透：</span> AI 视觉自适应解决 Cloudflare 挑战及滑块交互。</li>
                          </ul>
                        </div>
                      </div>

                      <div className="flex gap-6 relative z-10 mb-8">
                        <div className="w-10 h-10 shrink-0 rounded-2xl bg-blue-500/10 ring-1 ring-blue-500/30 flex flex-col items-center justify-center text-blue-400 font-bold text-sm shadow-[0_0_15px_rgba(59,130,246,0.1)]">3</div>
                        <div className="pt-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-white text-base">交互与提取 (Action)</h3>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 uppercase font-mono tracking-wider">边缘执行引擎</span>
                          </div>
                          <p className="text-sm text-zinc-400 mb-3">执行核心网络请求，或驱动虚拟 DOM 环境进行拟真操作并捕获页面负载。</p>
                          <ul className="text-sm text-zinc-500 list-disc pl-5 space-y-2 font-mono">
                            <li><span className="text-zinc-300">Playwright 无头沙箱：</span> 启动云端隔离浏览器执行动态渲染上下文，捕捉 XHR 与 DOM，并模拟人类滚动与点击。</li>
                            <li><span className="text-zinc-300">静态 HTTP 并发引擎：</span> 面向纯协议接口 (RESTful API)，实现高密度的极速下行发包。</li>
                          </ul>
                        </div>
                      </div>

                      <div className="flex gap-6 relative z-10 mb-8">
                        <div className="w-10 h-10 shrink-0 rounded-2xl bg-purple-500/10 ring-1 ring-purple-500/30 flex flex-col items-center justify-center text-purple-400 font-bold text-sm shadow-[0_0_15px_rgba(168,85,247,0.1)]">4</div>
                        <div className="pt-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-white text-base">意图感知与提纯 (AI & Extractor)</h3>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500 uppercase font-mono tracking-wider">智能中枢</span>
                          </div>
                          <p className="text-sm text-zinc-400 mb-3">通过大语言模型或高性能正则树，对全量脏数据进行格式化特征抽取。</p>
                          <ul className="text-sm text-zinc-500 list-disc pl-5 space-y-2 font-mono">
                            <li><span className="text-zinc-300">大模型智能萃取：</span> 让大模型代替编写复杂的 DOM 查询规则，实现强容错率的结构化提取。</li>
                            <li><span className="text-zinc-300">AI 探索特工：</span> 理解页面上下文，分析视觉树，并预测复杂的页面路由节点走向。</li>
                            <li><span className="text-zinc-300">标准 DOM 选择器提取：</span> 对稳定的页面结构进行毫秒级的文本与媒体链接切片。</li>
                          </ul>
                        </div>
                      </div>

                      <div className="flex gap-6 relative z-10 mb-8">
                        <div className="w-10 h-10 shrink-0 rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30 flex flex-col items-center justify-center text-amber-400 font-bold text-sm shadow-[0_0_15px_rgba(245,158,11,0.1)]">5</div>
                        <div className="pt-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-white text-base">数据清洗与归档 (Delivery)</h3>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 uppercase font-mono tracking-wider">管道终点</span>
                          </div>
                          <p className="text-sm text-zinc-400 mb-3">载荷提纯完成，经过最终校验后分发至远端存储媒介。</p>
                          <ul className="text-sm text-zinc-500 list-disc pl-5 space-y-2 font-mono">
                            <li><span className="text-zinc-300">持久化知识库落库：</span> 沉淀至云端关系型数据库或数据湖。</li>
                            <li><span className="text-zinc-300">规范化结构流：</span> 转换为标准 JSONL/Excel 格式供下游应用接力流转。</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="h-px w-full bg-white/5 my-10"></div>

                    <h3 className="text-lg font-medium text-white tracking-tight font-display mb-6 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center ring-1 ring-cyan-500/20 text-cyan-400">
                        <Activity className="w-4 h-4" />
                      </div>
                      核心概念：什么是“上下文 (Context)”机制？
                    </h3>
                    
                    <div className="bg-[#0c0c0e]/80 p-6 rounded-3xl ring-1 ring-white/5 shadow-lg relative group">
                      <p className="text-sm text-zinc-300 leading-relaxed mb-4">
                        许多新手都会有疑问：<b>当第一个节点读取了网页，后面的节点怎么知道网页内容是什么？</b> 这就归功于系统中最核心的“上下文”机制。
                      </p>
                      
                      <div className="flex flex-col gap-4 mb-6 relative">
                        {/* 竖线 */}
                        <div className="absolute left-[2.25rem] top-8 bottom-8 w-px bg-dashed border-l border-zinc-700/50"></div>
                        
                        <div className="flex items-center gap-4 relative z-10">
                          <div className="w-16 h-16 shrink-0 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg">
                            <Zap className="w-6 h-6 text-zinc-500" />
                          </div>
                          <div className="flex-1 bg-zinc-900/50 border border-zinc-800/50 p-4 rounded-xl">
                            <h4 className="text-white font-medium mb-1">1. 产生空包裹</h4>
                            <p className="text-xs text-zinc-400">流水线启动时，产生一个隐形的“空快递箱”（这就是最初的上下文），并沿着你画的连线传给下一个节点。</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 relative z-10">
                          <div className="w-16 h-16 shrink-0 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shadow-lg">
                            <Globe className="w-6 h-6 text-blue-400" />
                          </div>
                          <div className="flex-1 bg-zinc-900/50 border border-zinc-800/50 p-4 rounded-xl">
                            <h4 className="text-white font-medium mb-1">2. 往里塞入原始网页</h4>
                            <p className="text-xs text-zinc-400">抓取网页节点拿到包裹后，执行网路获取，并将抓到的一大坨网页代码（HTML）塞进包裹里，并在包裹上贴个标签：<code>pageCode</code>。</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 relative z-10">
                          <div className="w-16 h-16 shrink-0 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shadow-lg">
                            <BrainCircuit className="w-6 h-6 text-purple-400" />
                          </div>
                          <div className="flex-1 bg-zinc-900/50 border border-zinc-800/50 p-4 rounded-xl">
                            <h4 className="text-white font-medium mb-1">3. 提纯出精华数据</h4>
                            <p className="text-xs text-zinc-400">大模型提纯节点收到包裹，它被告知去包裹里找 <code>pageCode</code> 标签的文件。按你的要求阅读后，清理出商品价格，并把价格结果作为 <code>priceData</code> 重新塞回包裹（原来的生肉可能被丢弃以节省空间）。</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 relative z-10">
                          <div className="w-16 h-16 shrink-0 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-lg">
                            <Save className="w-6 h-6 text-emerald-400" />
                          </div>
                          <div className="flex-1 bg-zinc-900/50 border border-zinc-800/50 p-4 rounded-xl">
                            <h4 className="text-white font-medium mb-1">4. 拿取并写盘</h4>
                            <p className="text-xs text-zinc-400">流转到最终的保存节点收到包裹，它直接从里面拿出 <code>priceData</code> 标签的数据，将这干净的数据保存到你电脑硬盘上。</p>
                          </div>
                        </div>
                      </div>

                      <p className="text-sm text-zinc-300 leading-relaxed border-l-2 border-cyan-500/50 pl-4 bg-cyan-500/5 py-3 rounded-r-lg">
                        <b>总结：</b>你可以把上下文（Context）想象成一个在连线上流动、不断被塞入和翻找东西的<b>隐形传送箱</b>。只要你画好了线条，所有节点都在对这同一个箱子做操作。这就是为什么你不需要写复杂的编程代码，系统依然知道信息到底在哪里！
                      </p>
                    </div>

                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Custom OS Status Bar */}
        <div className="h-8 shrink-0 bg-[#000] flex items-center px-4 justify-between text-xs font-sans tracking-wide select-none z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-5 text-zinc-500 font-medium">
            <span className="flex items-center gap-1.5 hover:text-zinc-300 cursor-pointer transition-colors">
              {isBackendOnline ? (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="font-sans font-medium tracking-wide">底层驱动核心已装载</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                  <span className="font-sans font-medium tracking-wide text-red-400">底层驱动接口断开</span>
                </>
              )}
            </span>
            <span className="flex items-center gap-3 hover:text-zinc-300 cursor-pointer transition-colors op">
              <span className="flex items-center gap-1" title="本轮累计抓取"><Activity className="w-3.5 h-3.5 mr-0.5" /> {globalStats.sessionScraped || 0} </span>
              <span className="flex items-center gap-1" title="本轮风控阻击"><ShieldAlert className="w-3.5 h-3.5 mr-0.5 text-yellow-500/70" /> {globalStats.sessionBlocked || 0}</span>
              <span className="flex items-center gap-1" title="本轮大模型调用次数">
                <BrainCircuit className="w-3.5 h-3.5 mr-0.5 text-blue-500/70" /> 
                {globalStats.sessionLlms || 0}
              </span>
              <span className="flex items-center gap-1" title="LLM 消耗 Tokens (本次/总计)">
                <Zap className="w-3.5 h-3.5 mr-0.5 text-purple-500/70" /> 
                {globalStats.sessionLlmTokens} / {globalStats.llmTokens}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-5 text-zinc-600 font-mono text-[11px]">
            <span className="hover:text-zinc-300 cursor-pointer transition-colors tracking-wider uppercase" title="默认运行编码">{globalStats.system.encoding}</span>
            <span className="hover:text-zinc-300 cursor-pointer transition-colors tracking-wider uppercase" title="底层核心执行引擎">Python {globalStats.system.python} ({globalStats.system.os})</span>
            <span className="hover:text-zinc-300 cursor-pointer transition-colors tracking-wider uppercase">PORT: {globalStats.system.port}</span>
          </div>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
