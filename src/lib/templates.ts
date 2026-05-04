import { Node, Edge } from '@xyflow/react';
import React from 'react';
import { Brain, Clock, Code, Database, Globe, Link, Scan, Zap } from 'lucide-react';

export const predefinedTemplates: Record<string, { nodes: Node[], edges: Edge[] }> = {
  basic_spider: {
    nodes: [
      { id: 't_start', type: 'custom', position: { x: 50, y: 150 }, data: { label: 'WebHook 信号', type: '触发' } },
      { id: 't_browser', type: 'custom', position: { x: 300, y: 150 }, data: { label: '轻量静态 HTTP 抓取', type: '操作' } },
      { id: 't_dom', type: 'custom', position: { x: 550, y: 150 }, data: { label: '精准 DOM 规则提取', type: '智能' } },
      { id: 't_db', type: 'custom', position: { x: 800, y: 150 }, data: { label: '持久化知识库', type: '输出' } }
    ],
    edges: [
      { id: 'e1', source: 't_start', target: 't_browser', type: 'smoothstep', animated: true },
      { id: 'e2', source: 't_browser', target: 't_dom', type: 'smoothstep', animated: true },
      { id: 'e3', source: 't_dom', target: 't_db', type: 'smoothstep', animated: true },
    ]
  },
  xhs_spider: {
    nodes: [
      { id: 't_start', type: 'custom', position: { x: 50, y: 150 }, data: { label: '任务调度队列', type: '触发' } },
      { id: 't_session', type: 'custom', position: { x: 300, y: 150 }, data: { label: '会话身份驻留池', type: '对抗' } },
      { id: 't_proxy', type: 'custom', position: { x: 550, y: 150 }, data: { label: '代理 IP 调度池', type: '对抗' } },
      { id: 't_stealth', type: 'custom', position: { x: 800, y: 150 }, data: { label: '指纹与 Headers 随机化', type: '对抗' } },
      { id: 't_browser', type: 'custom', position: { x: 1050, y: 150 }, data: { label: '无头沙箱环境', type: '操作' } },
      { id: 't_human', type: 'custom', position: { x: 1050, y: 300 }, data: { label: '高拟真人类交互', type: '操作' } },
      { id: 't_ai', type: 'custom', position: { x: 1300, y: 300 }, data: { label: '大模型意图解析', type: '智能' } },
      { id: 't_db', type: 'custom', position: { x: 1550, y: 300 }, data: { label: '持久化知识库', type: '输出' } }
    ],
    edges: [
      { id: 'e1', source: 't_start', target: 't_session', type: 'smoothstep', animated: true },
      { id: 'e2', source: 't_session', target: 't_proxy', type: 'smoothstep', animated: true },
      { id: 'e3', source: 't_proxy', target: 't_stealth', type: 'smoothstep', animated: true },
      { id: 'e4', source: 't_stealth', target: 't_browser', type: 'smoothstep', animated: true },
      { id: 'e5', source: 't_browser', target: 't_human', type: 'smoothstep', animated: true },
      { id: 'e6', source: 't_human', target: 't_ai', type: 'smoothstep', animated: true },
      { id: 'e7', source: 't_ai', target: 't_db', type: 'smoothstep', animated: true },
    ]
  },
  damai_sniper: {
    nodes: [
      { id: 't_start', type: 'custom', position: { x: 50, y: 150 }, data: { label: '系统定时节拍器', type: '触发' } },
      { id: 't_session', type: 'custom', position: { x: 300, y: 150 }, data: { label: '会话身份驻留池', type: '对抗' } },
      { id: 't_stealth', type: 'custom', position: { x: 550, y: 150 }, data: { label: '指纹与 Headers 随机化', type: '对抗' } },
      { id: 't_browser', type: 'custom', position: { x: 800, y: 150 }, data: { label: '无头沙箱环境', type: '操作' } },
      { id: 't_human', type: 'custom', position: { x: 1050, y: 150 }, data: { label: '高拟真人类交互', type: '操作' } },
      { id: 't_captcha', type: 'custom', position: { x: 1050, y: 300 }, data: { label: '验证码与盾穿透', type: '对抗' } },
      { id: 't_notify', type: 'custom', position: { x: 1300, y: 300 }, data: { label: '即时状态分发', type: '输出' } }
    ],
    edges: [
      { id: 'e1', source: 't_start', target: 't_session', type: 'smoothstep', animated: true },
      { id: 'e2', source: 't_session', target: 't_stealth', type: 'smoothstep', animated: true },
      { id: 'e3', source: 't_stealth', target: 't_browser', type: 'smoothstep', animated: true },
      { id: 'e4', source: 't_browser', target: 't_human', type: 'smoothstep', animated: true },
      { id: 'e5', source: 't_human', target: 't_captcha', type: 'smoothstep', animated: true },
      { id: 'e6', source: 't_captcha', target: 't_notify', type: 'smoothstep', animated: true },
    ]
  }
};
