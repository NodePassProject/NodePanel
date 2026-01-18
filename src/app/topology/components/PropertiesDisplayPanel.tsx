"use client";

import React from 'react';
import type { Node, CustomNodeData } from '../topologyTypes'; 

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

  const data = selectedNode.data as CustomNodeData; 

  return (
    <div className="space-y-2 text-xs font-sans p-1">
      <div>
        <strong className="text-muted-foreground">ID:</strong>
        <span className="ml-1 font-mono break-all">{selectedNode.id}</span>
      </div>
      <div>
        <strong className="text-muted-foreground">Role:</strong>
        <span className="ml-1 font-semibold">{data.role}</span>
      </div>
      {data.masterSubRole && (
        <div>
          <strong className="text-muted-foreground">Master SubRole:</strong>
          <span className="ml-1">{data.masterSubRole}</span>
        </div>
      )}
      {data.label && (
        <div>
          <strong className="text-muted-foreground">Label:</strong>
          <span className="ml-1">{data.label}</span>
        </div>
      )}
      {data.nodeType && (
         <div>
          <strong className="text-muted-foreground">Node Type:</strong>
          <span className="ml-1">{data.nodeType}</span>
        </div>
      )}
      {data.role === 'C' && data.isSingleEndedForwardC !== undefined && (
        <div>
          <strong className="text-muted-foreground">Single-ended Forward Mode:</strong>
          <span className="ml-1">{data.isSingleEndedForwardC ? 'Yes' : 'No'}</span>
        </div>
      )}
      {data.masterId && ( 
         <div>
          <strong className="text-muted-foreground">Source Master ID:</strong>
          <span className="ml-1 font-mono break-all">{data.masterId}</span>
        </div>
      )}
      {data.representedMasterId && ( 
         <div>
          <strong className="text-muted-foreground">Represented Master ID:</strong>
          <span className="ml-1 font-mono break-all">{data.representedMasterId}</span>
        </div>
      )}
       {data.representedMasterName && ( 
         <div>
          <strong className="text-muted-foreground">Represented Master Name:</strong>
          <span className="ml-1">{data.representedMasterName}</span>
        </div>
       )}
       {data.parentNode && (
         <div>
          <strong className="text-muted-foreground">Parent Node ID:</strong>
          <span className="ml-1 font-mono break-all">{data.parentNode}</span>
        </div>
      )}
      {data.isContainer !== undefined && (
         <div>
          <strong className="text-muted-foreground">Is Container:</strong>
          <span className="ml-1">{data.isContainer ? 'Yes' : 'No'}</span>
        </div>
      )}
      {data.role === 'M' && data.masterName && ( 
        <div>
          <strong className="text-muted-foreground">Source Master Name:</strong>
          <span className="ml-1">{data.masterName}</span>
        </div>
      )}
      {(data.role === 'S' || (data.role === 'C' && !data.isSingleEndedForwardC)) && data.tunnelAddress && ( 
        <div>
          <strong className="text-muted-foreground">Tunnel Address:</strong>
          <span className="ml-1 font-mono break-all">{data.tunnelAddress}</span>
        </div>
      )}
      {data.role === 'C' && data.isSingleEndedForwardC && data.tunnelAddress && ( 
        <div>
          <strong className="text-muted-foreground">Local Listening Address:</strong>
          <span className="ml-1 font-mono break-all">{data.tunnelAddress}</span>
        </div>
      )}

      { (data.role === 'S' || data.role === 'T' || (data.role === 'M' && data.masterSubRole === 'client-role')) && data.targetAddress && (
        <div>
          <strong className="text-muted-foreground">
            {data.role === 'S' ? 'Exit (s) Forward Address:' : 
             data.role === 'T' ? 'Landing Forward Address:' : 
             (data.role === 'M' && data.masterSubRole === 'client-role') ? 'M (Client) Local Service:' : 
             'Target Address:' 
            }
          </strong>
          <span className="ml-1 font-mono break-all">{data.targetAddress}</span>
        </div>
      )}
       {data.role === 'C' && data.targetAddress && (
        <div>
          <strong className="text-muted-foreground">
            {data.isSingleEndedForwardC ? 'Remote Target Address:' : 'Entry (c) Local Forward:'}
          </strong>
          <span className="ml-1 font-mono break-all">{data.targetAddress}</span>
        </div>
      )}
      {data.logLevel && (
        <div>
          <strong className="text-muted-foreground">Log Level:</strong>
          <span className="ml-1">{data.logLevel}</span>
        </div>
      )}
      {data.tlsMode && (data.role === 'S' || (data.role === 'C' && data.isSingleEndedForwardC) || (data.role === 'M' && data.masterSubRole === 'client-role')) && (
         <div>
          <strong className="text-muted-foreground">TLS Mode:</strong>
          <span className="ml-1">{data.tlsMode}</span>
        </div>
      )}
       {data.tlsMode === '2' && (data.role === 'S' || (data.role === 'C' && data.isSingleEndedForwardC) || (data.role === 'M' && data.masterSubRole === 'client-role')) && data.certPath && (
         <div>
          <strong className="text-muted-foreground">Certificate Path:</strong>
          <span className="ml-1 font-mono break-all">{data.certPath}</span>
        </div>
      )}
       {data.tlsMode === '2' && (data.role === 'S' || (data.role === 'C' && data.isSingleEndedForwardC) || (data.role === 'M' && data.masterSubRole === 'client-role')) && data.keyPath && (
         <div>
          <strong className="text-muted-foreground">Key Path:</strong>
          <span className="ml-1 font-mono break-all">{data.keyPath}</span>
        </div>
      )}
    </div>
  );
}