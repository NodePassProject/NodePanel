
"use client";

import React from 'react';
import type { Node } from 'reactflow';

interface PropertiesDisplayPanelProps {
  selectedNode: Node | null;
}

export function PropertiesDisplayPanel({ selectedNode }: PropertiesDisplayPanelProps) {
  if (!selectedNode) {
    return (
      <div className="p-1 text-xs text-muted-foreground font-sans text-center h-full flex items-center justify-center">
        {/* Message is handled by parent CardDescription */}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs font-sans p-1"> {/* Padding for internal content */}
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
      {/* Removed ID, Position, Size, and Other Data sections */}
    </div>
  );
}
