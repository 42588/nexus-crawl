import React, { useState, useEffect } from 'react';
import { ShieldAlert, Database, Globe, Play, Square, AlertTriangle, Minus, Maximize2, Code, TerminalSquare } from 'lucide-react';

export default function BreakpointModal({ alertPayload, onCommand }: { alertPayload: any, onCommand: (trace_id: string, payload: any) => void }) {
  const { 
    trace_id,
    message, 
    view_mode, 
    preview_data, 
    html_snapshot, 
    total_records, 
    is_truncated,
    url, status_code, latency, proxy, headers, session_cookies,
    extracted_data
  } = alertPayload;

  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<'data' | 'context' | 'html'>(view_mode === 'data' ? 'data' : 'html');
  const [dataMode, setDataMode] = useState<'view' | 'raw'>('view');
  
  const [dataJson, setDataJson] = useState<string>("");
  const [contextJson, setContextJson] = useState<string>("");
  const [injectHtml, setInjectHtml] = useState<string>("");

  useEffect(() => {
    setContextJson(JSON.stringify({
      url: url || "",
      status_code: status_code || null,
      latency: latency || 0,
      proxy: proxy || null,
      headers: headers || {},
      session_cookies: session_cookies || {}
    }, null, 2));
    
    setDataJson(JSON.stringify(extracted_data || preview_data || {}, null, 2));
    setInjectHtml(html_snapshot || "");
    
    if (view_mode === 'data') {
        setActiveTab('data');
    } else if (view_mode === 'html' && (!extracted_data || Object.keys(extracted_data).length === 0)) {
        setActiveTab('html');
    }
  }, [alertPayload]);

  const handleAction = (actionType: string) => {
    if (actionType === 'abort') {
      onCommand(trace_id, { action: 'abort' });
      return;
    }
    
    let parsedContext: any = {};
    if (contextJson) {
      try {
        parsedContext = JSON.parse(contextJson);
      } catch(e) {
        alert('上下文变量 JSON 格式错误，请检查！');
        return;
      }
    }
    
    let parsedData: any = extracted_data || {};
    if (dataJson) {
      try {
        parsedData = JSON.parse(dataJson);
      } catch(e) {
        alert('智能透视区 (Data) JSON 格式错误，请检查！');
        return;
      }
    }
    
    let payloadToUpdate: any = {
      ...parsedContext,
      extracted_data: parsedData
    };
    
    if (injectHtml && injectHtml !== html_snapshot) {
       payloadToUpdate.html = injectHtml;
    }
    
    onCommand(trace_id, { action: 'update_context', payload: payloadToUpdate });
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-5">
        <button 
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-3 bg-[#0c0c0e] ring-1 ring-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.3)] rounded-2xl px-5 py-3 hover:bg-zinc-900 transition-colors group"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/20 text-red-400 group-hover:scale-110 transition-transform">
            <ShieldAlert className="w-4 h-4 animate-pulse" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-zinc-100 font-bold text-sm tracking-wide">系统断点拦截中</span>
            <span className="text-[10px] text-zinc-500 font-mono">点击恢复控制台</span>
          </div>
          <Maximize2 className="w-4 h-4 text-zinc-500 ml-4 group-hover:text-white transition-colors" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
      {/* 固定最大宽度和高度，防止撑爆屏幕 */}
      <div className="w-[90vw] max-w-5xl h-[85vh] bg-[#0c0c0e] ring-1 ring-white/10 rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* ================= 1. 极简表头 ================= */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 ring-1 ring-red-500/30">
              <ShieldAlert className="w-4 h-4 text-red-400 animate-pulse" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-zinc-100 font-bold text-sm tracking-wide flex items-center gap-2">
                {message || "系统断点拦截"}
              </h2>
              <span className="text-[10px] text-zinc-500 font-mono mt-0.5">TRACE: {trace_id.substring(0,8)}...</span>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => setIsMinimized(true)}
              className="p-1.5 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors"
              title="最小化"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab 导航 */}
        <div className="shrink-0 flex px-5 border-b border-white/5 bg-black">
           {view_mode === 'html' && (
             <>
               <button onClick={() => setActiveTab('html')} className={`py-3 px-5 text-xs font-bold border-b-2 transition-colors ${activeTab === 'html' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                  <div className="flex items-center gap-2">
                     <Globe className="w-4 h-4" />
                     网页源码与沙箱 (HTML)
                  </div>
               </button>
               <button onClick={() => setActiveTab('data')} className={`py-3 px-5 text-xs font-bold border-b-2 transition-colors ${activeTab === 'data' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                  <div className="flex items-center gap-2">
                     <Database className="w-4 h-4" />
                     智能透视区 (Data)
                  </div>
               </button>
               <button onClick={() => setActiveTab('context')} className={`py-3 px-5 text-xs font-bold border-b-2 transition-colors ${activeTab === 'context' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                  <div className="flex items-center gap-2">
                     <TerminalSquare className="w-4 h-4" />
                     运行时上下文 (Context)
                  </div>
               </button>
             </>
           )}
           {view_mode === 'data' && (
               <button onClick={() => setActiveTab('data')} className={`py-3 px-5 text-xs font-bold border-b-2 transition-colors border-indigo-500 text-indigo-400`}>
                  <div className="flex items-center gap-2">
                     <Database className="w-4 h-4" />
                     智能透视区 (Data)
                  </div>
               </button>
           )}
        </div>

        {/* ================= 2. 内容展示区 ================= */}
        <div className="flex-1 min-h-0 bg-[#030304] relative overflow-hidden flex flex-col">
          
          {activeTab === 'data' && (
            <div className="flex flex-col h-full min-h-0">
              <div className="shrink-0 flex items-center justify-between px-5 py-2 bg-purple-900/20 border-b border-purple-500/20">
                <span className="text-[11px] text-purple-300/80 font-mono flex items-center gap-4">
                  <span>{view_mode === 'data' ? "提取的结构化数据 (extracted_data) 实时修改" : "上下文提取数据 (extracted_data) 实时透视修改"}</span>
                  <div className="flex bg-black/40 rounded p-0.5 border border-purple-500/30">
                    <button 
                      onClick={() => setDataMode('view')}
                      className={`px-3 py-1 rounded text-[10px] font-bold transition-colors ${dataMode === 'view' ? 'bg-purple-500 text-white' : 'text-zinc-500 hover:text-purple-300'}`}
                    >
                      视图模式
                    </button>
                    <button 
                      onClick={() => setDataMode('raw')}
                      className={`px-3 py-1 rounded text-[10px] font-bold transition-colors ${dataMode === 'raw' ? 'bg-purple-500 text-white' : 'text-zinc-500 hover:text-purple-300'}`}
                    >
                      源 JSON
                    </button>
                  </div>
                </span>
                {is_truncated && view_mode === 'data' && (
                  <span className="flex items-center gap-1.5 text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    <AlertTriangle className="w-3 h-3" />
                    注意：preview_data被防爆截断，在此修改可覆盖写入提取上下文。
                  </span>
                )}
              </div>
              <div className="flex-1 min-h-0 relative bg-black/50 overflow-hidden flex flex-col">
                {dataMode === 'raw' ? (
                  <textarea 
                    className="w-full h-full bg-transparent border-0 text-emerald-400 font-mono text-xs leading-relaxed p-4 focus:ring-inset focus:ring-2 focus:ring-purple-500 focus:outline-none transition-colors custom-scrollbar resize-none"
                    value={dataJson}
                    onChange={(e) => setDataJson(e.target.value)}
                    spellCheck={false}
                  />
                ) : (
                  <div className="flex-1 w-full custom-scrollbar relative flex flex-col min-h-0">
                    {(() => {
                      let parsed: any;
                      try {
                        parsed = JSON.parse(dataJson);
                      } catch {
                        return <div className="p-4 text-red-400 text-xs flex items-center overflow-y-auto"><ShieldAlert className="w-4 h-4 mr-2"/> 当前数据包含 JSON 语法错误，无法渲染视图模式，请切换至 源 JSON 修正。</div>;
                      }

                      const renderTable = (tableData: any[]) => {
                        const headers = Array.from(new Set(tableData.flatMap(row => Object.keys(row || {}))));
                        return (
                          <div className="overflow-auto custom-scrollbar border border-white/10 rounded-lg max-h-full h-full w-full">
                            <table className="w-full text-left border-collapse min-w-max relative m-0">
                              <thead className="sticky top-0 z-20">
                                <tr>
                                  {headers.map(h => (
                                    <th key={h} className="px-4 py-2 border-b border-white/10 bg-[#1e1e24] text-xs text-purple-400 font-mono whitespace-nowrap shadow-sm shadow-black/50">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {tableData.map((row, rIdx) => (
                                  <tr key={rIdx} className="hover:bg-white/[0.02] transition-colors">
                                    {headers.map(h => {
                                      const val = row[h];
                                      const isObj = typeof val === 'object' && val !== null;
                                      return (
                                        <td key={`${rIdx}-${h}`} className="px-4 py-3 border-b border-white/5 text-xs text-zinc-300 font-mono max-w-[300px] break-words whitespace-pre-wrap">
                                          {isObj ? JSON.stringify(val) : String(val ?? '')}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      };

                      if (typeof parsed === 'string') {
                         return <div className="p-4 flex-1 flex flex-col min-h-0 overflow-y-auto"><textarea className="w-full flex-1 min-h-[300px] bg-[#0c0c0e] border border-white/10 rounded p-4 text-emerald-400 font-mono text-xs custom-scrollbar resize-y outline-none block m-0" value={parsed} readOnly /></div>
                      }

                      if (Array.isArray(parsed)) {
                        if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null && !Array.isArray(parsed[0])) {
                          return <div className="p-4 flex-1 flex flex-col min-h-0">{renderTable(parsed)}</div>;
                        }
                      }

                      if (typeof parsed === 'object' && parsed !== null) {
                         return (
                           <div className="flex flex-col gap-6 p-4 overflow-y-auto h-full">
                             {Object.entries(parsed).map(([key, val]) => (
                                <div key={key} className="border border-white/10 bg-[#0c0c0e] rounded-lg flex flex-col relative w-full overflow-hidden shadow-md">
                                   <div className="px-4 py-2.5 bg-[#1a1a1e] border-b border-white/10 text-purple-400 font-bold text-xs sticky top-0 z-20 flex justify-between items-center shadow-sm">
                                      <span className="flex items-center gap-2"><Database className="w-3.5 h-3.5"/> 字段: {key}</span>
                                      <span className="text-zinc-500 font-normal px-2 py-0.5 bg-black/40 rounded-full text-[10px]">{typeof val === 'string' ? '纯文本' : Array.isArray(val) ? '表格 / 数组' : '对象'}</span>
                                   </div>
                                   <div className="p-0 overflow-auto max-h-[400px] custom-scrollbar bg-black/20">
                                     {typeof val === 'string' ? (
                                       <textarea className="w-full min-h-[120px] bg-transparent text-emerald-400 font-mono text-xs outline-none resize-y p-3 custom-scrollbar block m-0" value={val} readOnly />
                                     ) : Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && !Array.isArray(val[0]) ? (
                                       <div className="p-3">
                                        {renderTable(val)}
                                       </div>
                                     ) : (
                                       <pre className="text-emerald-400 font-mono text-xs whitespace-pre-wrap p-4 m-0">{JSON.stringify(val, null, 2)}</pre>
                                     )}
                                   </div>
                                </div>
                             ))}
                           </div>
                         );
                      }

                      return <div className="p-4"><pre className="text-emerald-400 font-mono text-xs whitespace-pre-wrap bg-[#0c0c0e] p-4 rounded-xl border border-white/10">{JSON.stringify(parsed, null, 2)}</pre></div>;
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'html' && view_mode === 'html' && (
            <div className="flex flex-col md:flex-row h-full min-h-0 relative">
               <div className="flex-1 p-4 bg-[#0a0a0c] flex flex-col min-h-0">
                 <label className="text-[11px] text-zinc-400 font-mono mb-2 shrink-0 flex items-center gap-2">
                    <Code className="w-3.5 h-3.5" /> HTML 源码覆写 (下游组件将抓取此处源码)
                 </label>
                 <textarea 
                   className="flex-1 w-full bg-black border border-zinc-800 text-blue-400 font-mono text-xs leading-relaxed rounded-lg p-3 focus:border-blue-500 focus:outline-none transition-colors custom-scrollbar resize-none"
                   value={injectHtml}
                   onChange={(e) => setInjectHtml(e.target.value)}
                   placeholder="<!DOCTYPE html><html>..."
                   spellCheck={false}
                 />
               </div>
               <div className="md:w-[40%] p-4 bg-zinc-900/50 flex flex-col min-h-0 border-t md:border-t-0 md:border-l border-white/5">
                 <label className="text-[11px] text-zinc-400 font-mono mb-2 shrink-0 flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5" /> 沙箱实时预览
                 </label>
                 {html_snapshot && html_snapshot.trim().length > 0 ? (
                    <iframe 
                      srcDoc={html_snapshot} 
                      sandbox="allow-same-origin allow-scripts"
                      className="flex-1 w-full bg-white rounded-lg border border-white/10"
                      title="Sandbox Preview"
                    />
                 ) : (
                    <div className="flex-1 w-full flex items-center justify-center bg-black/40 rounded-lg border border-white/5 text-zinc-600 text-xs font-mono">
                      [当前上下文无渲染源码，显示为空白板]
                    </div>
                 )}
               </div>
            </div>
          )}

          {activeTab === 'context' && view_mode === 'html' && (
             <div className="flex-1 flex flex-col p-4 bg-[#0a0a0c] min-h-0">
                 <label className="text-[11px] text-zinc-400 font-mono mb-2 shrink-0 flex items-center gap-2">
                    <TerminalSquare className="w-3.5 h-3.5" /> 覆写系统变量与 Request Headers (支持在此覆写 Cookie 通行证)
                 </label>
                 <textarea 
                   className="flex-1 w-full bg-black border border-zinc-800 text-emerald-400 font-mono text-xs leading-relaxed rounded-lg p-4 focus:border-emerald-500 focus:outline-none transition-colors custom-scrollbar resize-none"
                   value={contextJson}
                   onChange={(e) => setContextJson(e.target.value)}
                   spellCheck={false}
                 />
             </div>
          )}

        </div>

        {/* ================= 3. 指挥官控制台 ================= */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-t border-white/10 bg-[#0c0c0e]">
          <div className="flex gap-2">
            <button 
              onClick={() => handleAction('abort')}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 ring-1 ring-red-500/30 rounded-lg transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              强行熔断 (Abort)
            </button>
          </div>
          
          <button 
            onClick={() => handleAction('continue')}
            className="flex items-center gap-2 px-6 py-2 text-xs font-bold text-black bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-transform active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            保存修改并放行 (Continue)
          </button>
        </div>

      </div>
    </div>
  );
}
