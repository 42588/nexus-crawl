import React, { useState, useEffect,useRef } from 'react';
import { Activity, ShieldAlert, Database, Globe, Network, Zap, Cpu, Server, BrainCircuit, Terminal, ChevronRight, BarChart2, ShieldCheck, Fingerprint, Coins } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

export default function Dashboard({ isRunning, globalStats }: { 
  isRunning: boolean;
  globalStats: { totalScraped: number; totalBlocked: number; llmTokens: number; savedCharacters?: number; };
}) {
  const [data, setData] = useState<any[]>([]);
  const [geoData, setGeoData] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({
    throughput: 0,
    blockedRate: 0,
    activeProxies: 0,
    latency: 0,
    sessionThroughput: 0,
    sessionBlocked: 0,
    sessionBypassed: 0,
    sessionLlms: 0,
    sessionScraped: 0
  });

  const [logs, setLogs] = useState<{id: number, text: string, type: string, time: string}[]>([]);

  const timeCounterRef = useRef(30);

  useEffect(() => {
    if (isRunning) {
      // Clear data on start
      setData(Array.from({ length: 30 }).map((_, i) => ({
        time: i,
        reqs: 0,
        blocked: 0,
        bypassed: 0
      })));
      setGeoData([
        { name: 'US-East', value: 0 },
        { name: 'EU-West', value: 0 },
        { name: 'AP-South', value: 0 },
        { name: 'US-West', value: 0 },
        { name: 'EU-Central', value: 0 },
      ]);
      setMetrics({
        throughput: 0,
        blockedRate: 0,
        activeProxies: 0,
        latency: 0,
        sessionThroughput: 0,
        sessionBlocked: 0,
        sessionBypassed: 0,
        sessionLlms: 0,
        sessionScraped: 0
      });
      setLogs([]);
      timeCounterRef.current = 30;
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
          timeCounterRef.current += 1;
          const reqs = payload.throughput || 0;
          const blocked = payload.failures || 0;

          setData(prev => {
            return [...prev.slice(1), {
              time: timeCounterRef.current,
              reqs: reqs,
              blocked: blocked,
              bypassed: payload.bypassedWaf || 0
            }];
          });
          
          if (payload.geoData) {
            setGeoData(payload.geoData);
          }

          setMetrics(prev => ({
            ...prev,
            throughput: reqs,
            blockedRate: (reqs + blocked) > 0 ? (blocked / (reqs + blocked)) * 100 : 0,
            activeProxies: payload.activeProxies || 0,
            latency: payload.latency || 0,
            sessionThroughput: payload.sessionThroughput || 0,
            sessionBlocked: payload.sessionBlocked || 0,
            sessionBypassed: payload.sessionBypassed || 0,
            sessionLlms: payload.sessionLlms || 0,
            sessionScraped: payload.sessionScraped || 0
          }));
        } else if (payload.type === 'log') {
          setLogs(prev => {
            const timeStr = payload.timestamp ? new Date(payload.timestamp).toLocaleTimeString('en-US', {hour12: false}) : new Date().toLocaleTimeString('en-US', {hour12: false});
            const type = payload.level === '错误' ? 'warning' : 'success';
            return [{ id: Date.now(), text: payload.message, type, time: timeStr }, ...prev].slice(0, 50);
          });
        } else if (payload.type === 'log_batch') {
          setLogs(prev => {
            const newLogs = payload.logs.map((l: any, i: number) => ({
              id: Date.now() + i,
              text: l.message,
              type: l.level === '错误' ? 'warning' : 'success',
              time: l.timestamp ? new Date(l.timestamp).toLocaleTimeString('en-US', {hour12: false}) : new Date().toLocaleTimeString('en-US', {hour12: false})
            })).reverse();
            return [...newLogs, ...prev].slice(0, 50);
          });
        }
      } catch (e) {}
    };

    return () => {
      ws.close();
    };
  }, [isRunning]);

  return (
    <div className="w-full h-full bg-[#050505] p-6 flex flex-col gap-8 overflow-y-auto custom-scrollbar relative font-sans">
      <div className="max-w-[1600px] mx-auto w-full flex flex-col gap-8 relative z-10">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between border-b border-white/5 pb-4 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3 w-fit">
              <div className="flex gap-1.5 self-center mt-1">
                <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-zinc-700'}`}></div>
                <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500/50' : 'bg-zinc-800'}`}></div>
              </div>
              <h1 className="text-2xl lg:text-3xl font-black text-white font-display tracking-widest uppercase">系统遥测指挥大盘</h1>
            </div>
            <p className="text-[10px] lg:text-[11px] text-zinc-500 font-display tracking-[0.2em] uppercase ml-1 opacity-80 mt-1">Arachne V-Combat 引擎 // 全局态势感知中心</p>
          </div>
        </header>

        {/* Global Overview Numbers */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-6 lg:gap-8">
          <StatCard label="本轮流转采集数" value={metrics.sessionScraped} unit="条" icon={<Database />} color="text-cyan-400" isRunning={isRunning} glow="cyan" desc="目前抓取并提取入库的有效目标数据本轮累计条数。" />
          <StatCard label="总并发量" value={metrics.sessionThroughput} unit="次" icon={<Zap />} color="text-fuchsia-400" isRunning={isRunning} glow="fuchsia" desc="当前流水线引擎已累积下发探测与通讯的网络并发总次数。" />
          <StatCard label="风控总数" value={metrics.sessionBlocked} unit="次" icon={<ShieldAlert />} color="text-rose-400" isRunning={isRunning} glow="rose" desc="执行期间遇到强风控或强指纹校验导致访问受阻的拦截阻击总频次。" />
          <StatCard label="解除风控次数" value={metrics.sessionBypassed} unit="次" icon={<Fingerprint />} color="text-emerald-400" isRunning={isRunning} glow="emerald" desc="成功通过智能视觉与高匿指纹环境绕过防护边界 (CAPTCHA) 的累积次数。" />
          <StatCard label="会话身份数量" value={metrics.activeProxies} unit="个" icon={<Globe />} color="text-amber-400" isRunning={isRunning} glow="amber" desc="流转引擎当前动态维持生命周期的高匿代理节点或沙箱浏览器身份数量。" />
          <StatCard label="大模型调用次数" value={metrics.sessionLlms} unit="次" icon={<BrainCircuit />} color="text-purple-400" isRunning={isRunning} glow="purple" desc="本轮流水线工作流中触发大模型智能语义清洗规则集的执行次数。" />
          <StatCard label="网络往返时间" value={metrics.latency} unit="ms" icon={<Activity />} color="text-blue-400" isRunning={isRunning} glow="blue" desc="从分布式发包引擎至业务承载网络网关的网络往返时间 (RTT)。" />
        </div>

        {/* Charts & Details */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8 min-h-[460px]">
          
          {/* Main Throughput Chart */}
          <div className="xl:col-span-2 bg-transparent rounded-3xl p-8 lg:p-10 relative flex flex-col shrink-0 group">
             <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl pointer-events-none"></div>
             
             <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4 relative z-10">
               <h3 className="text-sm font-bold text-white uppercase tracking-widest font-display flex items-center gap-3">
                 <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center ring-1 ring-emerald-500/20 text-emerald-400">
                    <Activity className="w-4 h-4" />
                 </div>
                 动态流量与防御侦测大盘
               </h3>
               <div className="flex flex-wrap items-center gap-6 text-[11px] font-sans text-zinc-400 font-medium bg-[#050505] px-4 py-2.5 rounded-full ring-1 ring-white/5">
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div> 常规请求序列</div>
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div> 策略性绕过</div>
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"></div> WAF触发拦截</div>
               </div>
             </div>

             <div className="flex-1 w-full relative z-10 ml-[-20px]">
               {data.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                     <defs>
                       <linearGradient id="colorReqs" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="0%" stopColor="#10b981" stopOpacity={0.5}/>
                         <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                       </linearGradient>
                       <linearGradient id="colorBlocked" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.5}/>
                         <stop offset="100%" stopColor="#f43f5e" stopOpacity={0}/>
                       </linearGradient>
                       <linearGradient id="colorBypassed" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="0%" stopColor="#a855f7" stopOpacity={0.5}/>
                         <stop offset="100%" stopColor="#a855f7" stopOpacity={0}/>
                       </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                     <XAxis dataKey="time" hide />
                     <YAxis stroke="#555" fontSize={11} tickFormatter={(val) => String(val)} width={50} axisLine={false} tickLine={false} />
                     <Tooltip 
                       contentStyle={{ backgroundColor: '#050505', border: '1px solid #333', borderRadius: '12px', fontSize: '12px', color: '#fff', fontFamily: 'monospace', boxShadow: '0 20px 40px rgba(0,0,0,0.8)' }}
                       itemStyle={{ color: '#e4e4e7', padding: '2px 0' }}
                       labelStyle={{ display: 'none' }}
                       cursor={{ stroke: '#ffffff20', strokeWidth: 1, strokeDasharray: '4 4' }}
                     />
                     <Area type="monotone" dataKey="reqs" name="常规请求" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorReqs)" isAnimationActive={false} />
                     <Area type="monotone" dataKey="bypassed" name="策略绕过" stroke="#a855f7" strokeWidth={3} fillOpacity={1} fill="url(#colorBypassed)" isAnimationActive={false} />
                     <Area type="monotone" dataKey="blocked" name="WAF拦截" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorBlocked)" isAnimationActive={false} />
                   </AreaChart>
                 </ResponsiveContainer>
               ) : (
                 <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 font-sans">
                   <div className="w-16 h-16 rounded-full bg-zinc-900/50 flex items-center justify-center mb-4 ring-1 ring-white/5">
                     <Cpu className="w-6 h-6 opacity-40" />
                   </div>
                   <div className="text-sm tracking-widest uppercase font-display opacity-60">
                     流转引擎待命中
                   </div>
                 </div>
               )}
             </div>
          </div>

          <div className="flex flex-col gap-6 lg:gap-8">
            {/* Geo Distribution */}
            <div className="bg-transparent rounded-3xl p-6 lg:p-8 flex flex-col shrink-0 flex-1 relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl pointer-events-none"></div>
              <h3 className="text-xs font-bold text-white uppercase tracking-widest font-display flex items-center gap-3 mb-6 relative z-10">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center ring-1 ring-amber-500/20 text-amber-500">
                  <Globe className="w-4 h-4" />
                </div>
                隧道节点地域热度池
              </h3>
              <div className="flex-1 w-full relative z-10">
                {geoData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={geoData} layout="vertical" margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'monospace' }} width={80} />
                      <Tooltip cursor={{fill: '#ffffff05'}} contentStyle={{ backgroundColor: '#050505', border: '1px solid #333', borderRadius: '8px', fontSize: '11px', color: '#fff', fontFamily: 'monospace' }} />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false} barSize={16}>
                        {geoData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : index === 1 ? '#3b82f6' : index === 2 ? '#a855f7' : '#f59e0b'} fillOpacity={0.9} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-zinc-600 font-display text-[10px] tracking-widest uppercase opacity-60">代理集群处休眠状态</div>
                )}
              </div>
            </div>

            {/* 核心事件实时流 */}
            <div className="bg-transparent rounded-3xl p-6 lg:p-8 flex flex-col shrink-0 h-[280px] relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl pointer-events-none"></div>
              
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5 relative z-10">
                <h3 className="text-xs font-bold text-white uppercase tracking-widest font-display flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center ring-1 ring-blue-500/20 text-blue-500">
                    <Terminal className="w-4 h-4" />
                  </div>
                  核心日志穿透流
                </h3>
                <button 
                  onClick={() => {
                    if(!logs || logs.length === 0) return;
                    const fileText = logs.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.text}`).join('\n');
                    const blob = new Blob([fileText], { type: 'text/plain;charset=utf-8' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `arachne-events-${new Date().toISOString().replace(/:/g, '-')}.log`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                  }}
                  className="px-3 py-1.5 text-[10px] uppercase font-display tracking-widest bg-white/[0.02] hover:bg-white/[0.05] text-zinc-400 hover:text-white rounded-lg transition-all cursor-pointer ring-1 ring-white/10"
                >
                  导出流存档
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 flex flex-col gap-3 relative z-10">
                {logs.length > 0 ? logs.map(log => (
                  <div key={log.id} className="flex gap-3 text-[11px] font-mono leading-relaxed bg-transparent py-2.5 transition-colors items-start">
                    <span className="text-zinc-600 shrink-0 mt-[1px]">[{log.time}]</span>
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${log.type === 'success' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : log.type === 'warning' ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.6)]'}`}></div>
                    <span className="text-zinc-300 break-words flex-1 tracking-wide">{log.text}</span>
                  </div>
                )) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600 font-display tracking-widest uppercase opacity-60">
                     {isRunning ? '等待总线事件下行...' : '终端信道静默'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, icon, color, isRunning, glow, desc }: any) {
  const iconColors: Record<string, string> = {
    cyan: 'text-cyan-400',
    rose: 'text-rose-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    fuchsia: 'text-fuchsia-400'
  };

  return (
    <div className="flex flex-col gap-2 relative group/label">
      <div className="flex items-center gap-2">
        <div className={`shrink-0 transition-colors duration-500 ${isRunning ? iconColors[glow] : 'text-zinc-600'}`}>
          {React.cloneElement(icon, { className: 'w-4 h-4' })}
        </div>
        <span className="text-xs font-bold font-display tracking-widest text-[#e4e4e7] uppercase">{label}</span>
      </div>
      
      <div className="flex items-baseline gap-2 mt-1">
        <div className={`text-2xl lg:text-3xl font-medium font-sans tracking-tight transition-colors duration-500 ${isRunning ? color : 'text-zinc-500'}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        <div className={`text-[10px] font-display uppercase tracking-widest opacity-40 font-bold ${isRunning ? color : 'text-zinc-600'}`}>{unit}</div>
      </div>

      {desc && (
        <div className="absolute top-full left-0 mt-3 w-56 bg-black/90 ring-1 ring-white/10 text-[11px] font-sans text-zinc-300 p-3 rounded-xl shadow-2xl leading-relaxed opacity-0 invisible group-hover/label:opacity-100 group-hover/label:visible transition-all duration-300 z-50 pointer-events-none backdrop-blur-xl">
          {desc}
        </div>
      )}
    </div>
  );
}

