
"use client";

import React from 'react';
import type { Node } from 'reactflow';
// ScrollArea is no longer needed here as parent CardContent handles scrolling

interface PropertiesDisplayPanelProps {
  selectedNode: Node | null;
}

export function PropertiesDisplayPanel({ selectedNode }: PropertiesDisplayPanelProps) {
  if (!selectedNode) {
    return (
      <div className="p-3 text-xs text-muted-foreground font-sans text-center h-full flex items-center justify-center">
        点击画布上的节点以查看其详细属性。
      </div>
    );
  }

  // Parent CardContent in page.tsx has p-1, this div gets that padding implicitly.
  return (
    <div className="space-y-2 text-xs font-sans">
      <div>
        <strong className="text-muted-foreground">ID:</strong>
        <span className="ml-1 font-mono break-all">{selectedNode.id}</span>
      </div>
      <div>
        <strong className="text-muted-foreground">类型 (Type):</strong>
        <span className="ml-1">{selectedNode.type || 'N/A'}</span>
      </div>
      {selectedNode.data.label && (
        <div>
          <strong className="text-muted-foreground">标签 (Label):</strong>
          <span className="ml-1">{selectedNode.data.label}</span>
        </div>
      )}
      {selectedNode.data.nodeType && (
         <div>
          <strong className="text-muted-foreground">节点类型 (NodeType):</strong>
          <span className="ml-1">{selectedNode.data.nodeType}</span>
        </div>
      )}
      {selectedNode.data.masterId && (
         <div>
          <strong className="text-muted-foreground">主控ID (MasterID):</strong>
          <span className="ml-1 font-mono break-all">{selectedNode.data.masterId}</span>
        </div>
      )}
      <div>
        <strong className="text-muted-foreground">位置 (Position):</strong>
        <span className="ml-1 font-mono">
          X: {selectedNode.position.x.toFixed(0)}, Y: {selectedNode.position.y.toFixed(0)}
        </span>
      </div>
      {selectedNode.width && selectedNode.height && (
         <div>
          <strong className="text-muted-foreground">尺寸 (Size):</strong>
          <span className="ml-1 font-mono">
            W: {selectedNode.width.toFixed(0)}, H: {selectedNode.height.toFixed(0)}
          </span>
        </div>
      )}
      {Object.keys(selectedNode.data).length > 0 && (
        <div className="pt-2">
          <strong className="text-muted-foreground">其他数据 (Data):</strong>
          <pre className="mt-1 p-2 text-[10px] bg-muted/30 rounded-md whitespace-pre-wrap break-all leading-snug">
            {JSON.stringify(selectedNode.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
