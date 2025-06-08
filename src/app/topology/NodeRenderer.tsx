
'use client';

import React, { memo } from 'react';
import type { NodeProps } from 'reactflow';
import { Handle, Position } from 'reactflow';
import { Loader2 } from 'lucide-react';
import type { CustomNodeData } from './topologyTypes';

export const CARD_NODE_WIDTH = 100;
export const CARD_NODE_HEIGHT = 40;
// const ICON_NODE_SIZE = 40; // Not directly used for sizing, more for icon itself

export const nodeStyles = {
  m: { // Master Node Style
    base: {
      color: 'hsl(var(--foreground))',
      borderColor: 'hsl(var(--border))',
      borderWidth: 1.5,
      background: 'hsl(var(--card) / 0.6)',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      borderRadius: '0.75rem',
      padding: '16px',
      fontSize: '0.8rem',
      fontWeight: 500,
      textAlign: 'center' as const,
    }
  },
  s: { base: { background: 'hsl(210, 100%, 97%)', borderColor: 'hsl(210, 80%, 60%)', color: 'hsl(210, 90%, 30%)' } },
  c: { base: { background: 'hsl(145, 63%, 96%)', borderColor: 'hsl(145, 60%, 45%)', color: 'hsl(145, 80%, 20%)' } },
  t: { base: { background: 'hsl(35, 100%, 96%)', borderColor: 'hsl(35, 90%, 60%)', color: 'hsl(35, 90%, 35%)' } },
  u: { base: { background: 'hsl(265, 80%, 97%)', borderColor: 'hsl(265, 70%, 60%)', color: 'hsl(265, 70%, 40%)' } }
};

export const MasterNode: React.FC<NodeProps<CustomNodeData>> = memo(({ data }) => {
  const subRoleText = data.masterSubRole === 'client-role' ? '(客户隧道)'
    : data.masterSubRole === 'server-role' ? '(服务主机)'
    : data.masterSubRole === 'primary' ? '(主要)'
    : data.masterSubRole === 'single-client-link' ? '(单客户端链路)'
    : data.masterSubRole === 'intra-master-tunnel' ? '(内部隧道)'
    : data.masterSubRole === 'external-client-link' ? '(外部客户端连接)'
    : data.masterSubRole === 'server-service-link' ? '(服务端服务)'
    : '(通用)';
  return (
    <>
      <Handle type="target" position={Position.Left} id="m-left" className="!bg-cyan-500 w-2.5 h-2.5" />
      <Handle type="source" position={Position.Right} id="m-right" className="!bg-cyan-500 w-2.5 h-2.5" />
      <div className="font-semibold">{data.label} <span className="text-xs text-muted-foreground">{subRoleText}</span></div>
      {data.submissionStatus && (
        <div className={`text-xs mt-1 p-0.5 rounded ${data.submissionStatus === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : data.submissionStatus === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'}`}>
          {data.submissionStatus === 'pending' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}
          {data.submissionMessage || data.submissionStatus}
        </div>
      )}
    </>
  );
});
MasterNode.displayName = 'MasterNode';


export const CardNode: React.FC<NodeProps<CustomNodeData>> = memo(({ data, selected }) => {
  const IconComponent = data.icon;
  const roleStyle = nodeStyles[data.role.toLowerCase() as keyof typeof nodeStyles];

  const baseCardClasses = `flex items-center rounded-lg border-2 shadow-sm transition-all duration-200 ease-in-out p-1.5 flex-col`;

  const width = CARD_NODE_WIDTH;
  const height = data.submissionStatus ? CARD_NODE_HEIGHT + 20 : CARD_NODE_HEIGHT;

  const dynamicStyle: React.CSSProperties = {
    borderColor: roleStyle.base.borderColor,
    color: roleStyle.base.color,
    background: selected ? roleStyle.base.background : 'transparent',
    width: `${width}px`,
    height: `${height}px`,
  };

  const displayText = (data.role === 'S' || data.role === 'C') && data.representedMasterName
    ? data.representedMasterName
    : data.label;

  return (
    <>
      <div
        className={baseCardClasses}
        style={dynamicStyle}
      >
        <div className="flex items-center w-full">
          {IconComponent && (
            <div
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md mr-2"
              style={{ backgroundColor: `${(roleStyle.base as any).borderColor}33` }}
            >
              <IconComponent size={16} style={{ color: roleStyle.base.borderColor }} />
            </div>
          )}
          <div className="flex-grow flex items-center justify-center overflow-hidden">
            <span className="font-medium text-xs truncate" style={{ color: selected ? roleStyle.base.color : 'hsl(var(--foreground))' }}>{displayText}</span>
          </div>
        </div>
        {data.submissionStatus && (
          <div className={`text-xs mt-1 p-0.5 rounded w-full text-center ${data.submissionStatus === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : data.submissionStatus === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'}`}>
            {data.submissionStatus === 'pending' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}
            {data.submissionMessage || data.submissionStatus}
          </div>
        )}
      </div>

      {data.role !== 'U' && (
        <Handle type="target" position={Position.Left} className="!bg-slate-400 w-2 h-2" />
      )}
      {data.role !== 'T' && (
        <Handle type="source" position={Position.Right} className="!bg-slate-400 w-2 h-2" />
      )}
    </>
  );
});
CardNode.displayName = 'CardNode';

export const nodeTypes = {
  cardNode: CardNode,
  masterNode: MasterNode,
};
