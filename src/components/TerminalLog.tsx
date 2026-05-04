import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { Terminal as TerminalIcon, Download } from 'lucide-react';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import BreakpointModal from './BreakpointModal';

export default function TerminalLog({ isRunning, onEngineStatusChange, nodes = [], edges = [] }: { isRunning: boolean, onEngineStatusChange?: (status: boolean) => void, nodes?: any[], edges?: any[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isRunningRef = useRef(isRunning);
  const wsRef = useRef<WebSocket | null>(null);
  const [breakpointAlert, setBreakpointAlert] = useState<any>(null);
  
  useEffect(() => {
    isRunningRef.current = isRunning;
    if (!isRunning && xtermRef.current) {
        xtermRef.current.writeln(`\x1b[90m${new Date().toLocaleTimeString('en-US', {hour12: false})}\x1b[0m \x1b[1;30m[系统]\x1b[0m 引擎执行挂起或停止。`);
        setBreakpointAlert(null);
    } else if (isRunning && xtermRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        xtermRef.current.writeln(`\x1b[90m${new Date().toLocaleTimeString('en-US', {hour12: false})}\x1b[0m \x1b[1;32m[系统]\x1b[0m 引擎执行链路已激活。`);
    }
  }, [isRunning]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#00000000', // transparent so the container background shows
        foreground: '#d4d4d8', 
        cursor: '#10b981',
        selectionBackground: '#10b98140',
        black: '#000000',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#ffffff',
        brightBlack: '#71717a',
      },
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace',
      fontSize: 11,
      lineHeight: 1.4,
      cursorBlink: true,
      disableStdin: true,
      scrollback: 1000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    
  const tryFit = () => {
    try {
      if (
        terminalRef.current && 
        terminalRef.current.clientWidth > 0 &&
        term.element &&
        term.element.clientWidth > 0
      ) {
        const core = (term as any)._core;
        // Ensure xterm's render service and dimensions are fully initialized before fitting
        if (core && core._renderService && core._renderService.dimensions) {
           fitAddon.fit();
        }
      }
    } catch (e) {
      // ignore
    }
  };

    setTimeout(tryFit, 50);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const timestamp = new Date().toLocaleTimeString('en-US', {hour12: false});
    term.writeln(`\x1b[90m${timestamp}\x1b[0m \x1b[1;30m[UI终端]\x1b[0m 终端接口已挂载，等待与后端建立控制连接...`);

    const resizeObserver = new ResizeObserver(() => tryFit());
    resizeObserver.observe(terminalRef.current);

    let ws: WebSocket;
    let fallbackTimeout: ReturnType<typeof setTimeout>;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    const connectWs = () => {
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (xtermRef.current) {
          xtermRef.current.writeln(`\x1b[90m${new Date().toLocaleTimeString('en-US', {hour12: false})}\x1b[0m \x1b[1;36m[WS]\x1b[0m 已与本地 Python 引擎 (:8085) 建立控制面长连接。`);
        }
      };

      ws.onmessage = (event) => {
        if (!xtermRef.current) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'engine_status') {
              if (onEngineStatusChange) onEngineStatusChange(data.isRunning);
          } else if (data.type === 'log') {
            const ts = data.timestamp ? new Date(data.timestamp + 'Z').toLocaleTimeString('en-US', {hour12: false}) : new Date().toLocaleTimeString('en-US', {hour12: false});
            xtermRef.current.writeln(`\x1b[90m${ts}\x1b[0m ${data.color}[${data.level}]\x1b[0m ${data.message}`);
          } else if (data.type === 'log_batch') {
            for (const log of data.logs) {
              const ts = log.timestamp ? new Date(log.timestamp + 'Z').toLocaleTimeString('en-US', {hour12: false}) : new Date().toLocaleTimeString('en-US', {hour12: false});
              xtermRef.current.writeln(`\x1b[90m${ts}\x1b[0m ${log.color}[${log.level}]\x1b[0m ${log.message}`);
            }
          } else if (data.type === 'breakpoint_alert') {
            setBreakpointAlert(data);
          } else if (data.type === 'file_download') {
            try {
               const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
               const url = window.URL.createObjectURL(blob);
               const a = document.createElement('a');
               a.href = url;
               a.download = data.filename;
               
               // Some browsers require the element to be appended to the DOM
               document.body.appendChild(a);
               a.click();
               document.body.removeChild(a);
               
               setTimeout(() => window.URL.revokeObjectURL(url), 1000);
            } catch (err) {
               console.error("Failed to trigger file download", err);
            }
          }
        } catch (e) {}
      };

      ws.onerror = () => {
        // Don't auto-reconnect on error here to avoid duplicate triggers,
        // let onclose handle the reconnection.
      };
      
      ws.onclose = () => {
        setTimeout(() => {
          // strictly check if this is still the active connection instance AND not unmounted
          if (wsRef.current === ws) { 
             connectWs();
          }
        }, 3000);
      };
    };

    connectWs();
    
    // Warn user if backend is still offline after 5 seconds
    fallbackTimeout = setTimeout(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN && xtermRef.current) {
            xtermRef.current.writeln(`\x1b[90m${new Date().toLocaleTimeString('en-US', {hour12: false})}\x1b[0m \x1b[1;33m[SYS] 正在等待 Python 引擎 (:8085) 启动并装载依赖，请耐心稍候...\x1b[0m`);
        }
    }, 5000);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      clearTimeout(fallbackTimeout);
      if (wsRef.current) {
         wsRef.current.onclose = null; // Prevent reconnect logic from firing
         wsRef.current.close();
         wsRef.current = null; // Clear the ref
      }
    };
  }, []);

  return (
    <div className="flex-1 w-full relative group overflow-hidden bg-black/40"><div className="absolute inset-0 bg-[#030304] border-t border-white/5 shadow-[inset_0_20px_40px_rgba(0,0,0,0.8)] p-2 flex flex-col">
        <div className="flex items-center justify-between mb-2 pb-2 pl-2 border-b border-white/5 relative z-10 shrink-0">
          <div className="flex items-center gap-2">
             <div className="flex items-center justify-center w-6 h-6 rounded-md bg-zinc-800/80 mr-1 ring-1 ring-white/5 shadow-inner">
               <TerminalIcon className={`w-3.5 h-3.5 ${isRunning ? 'text-emerald-400' : 'text-zinc-500'}`} />
             </div>
             <div className="text-xs text-zinc-300 font-display font-bold tracking-[0.2em] uppercase">V-Combat 引擎运行日志</div>
          </div>
          <button 
             onClick={() => {
               if(!xtermRef.current) return;
               let logText = '';
               for (let i = 0; i < xtermRef.current.buffer.active.length; i++) {
                 const line = xtermRef.current.buffer.active.getLine(i);
                 if (line) logText += line.translateToString(true) + '\n';
               }
               const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
               const url = window.URL.createObjectURL(blob);
               const a = document.createElement('a');
               a.href = url;
               a.download = `arachne-vcombat-log-${new Date().toISOString().replace(/:/g, '-')}.log`;
               a.click();
               window.URL.revokeObjectURL(url);
             }}
             className="mr-2 px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-sans font-medium text-zinc-400 hover:text-emerald-400 bg-white/5 hover:bg-white/10 rounded-md transition-colors ring-1 ring-white/10 hover:ring-emerald-500/50"
          >
             <Download className="w-3.5 h-3.5" />
             保存日志文件
          </button>
        </div>
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.3)_51%)] bg-[length:100%_4px] opacity-20 mix-blend-overlay z-20" />
      <div ref={terminalRef} className="w-full flex-1 min-h-0 relative z-10" /></div>
      
      {breakpointAlert && (
        <BreakpointModal 
          alertPayload={breakpointAlert}
          onCommand={(trace_id, command) => {
            wsRef.current?.send(JSON.stringify({ 
              type: 'resolve_breakpoint', 
              trace_id, 
              pipeline_id: breakpointAlert.pipeline_id, 
              ...command, 
              nodes, 
              edges 
            }));
            setBreakpointAlert(null);
          }}
        />
      )}
    </div>
  );
}
