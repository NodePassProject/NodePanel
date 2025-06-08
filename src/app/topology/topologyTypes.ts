
'use client';

import type React from 'react';
import type { Node as ReactFlowNode } from 'reactflow';

export type NodeRole = 'M' | 'S' | 'C' | 'T' | 'U';
export type MasterSubRole = 'client-role' | 'server-role' | 'generic' | 'primary';

export interface CustomNodeData {
  label: string;
  role: NodeRole;
  icon?: React.ElementType;
  masterSubRole?: MasterSubRole;
  nodeType?: string; // e.g., 'masterNode', 'cardNode'
  masterId?: string; // For M-nodes, the ID of the NamedApiConfig it represents
  masterName?: string; // For M-nodes, the name of the NamedApiConfig
  representedMasterId?: string; // For S/C nodes dragged from a master, the ID of that master
  representedMasterName?: string; // For S/C nodes dragged from a master, the name of that master
  isContainer?: boolean; // True for M-nodes that can contain other nodes
  parentNode?: string; // ID of the parent M-node if this node is inside a container
  isDefaultClient?: boolean; // For the default C-node inside an M-container
  isSingleEndedForwardC?: boolean; // For C-nodes, if true, it's in single-ended forwarding mode
  apiUrl?: string; // For M-nodes, copied from NamedApiConfig for reference
  defaultLogLevel?: string; // For M-nodes, copied from NamedApiConfig
  defaultTlsMode?: string; // For M-nodes, copied from NamedApiConfig
  tunnelAddress?: string; // For S (listen), C (connect to S or local listen if single-ended), M (client-role, connects to remote S)
  targetAddress?: string; // For S (forward to), C (local forward from or remote target if single-ended), T (forward to), M (client-role, local service)
  submissionStatus?: 'pending' | 'success' | 'error';
  submissionMessage?: string;
  logLevel?: string; // Instance-specific log level
  tlsMode?: string; // Instance-specific TLS mode
  certPath?: string; // Path to cert file for TLS mode '2'
  keyPath?: string; // Path to key file for TLS mode '2'

  // For M-node (client-role) defining a cross-master tunnel
  remoteMasterIdForTunnel?: string;
  remoteServerListenAddress?: string;
  remoteServerForwardAddress?: string;

  // For nodes rendered from existing instances
  originalInstanceId?: string;
  originalInstanceUrl?: string;
}

// Our custom Node type extending React Flow's Node
export interface Node extends ReactFlowNode<CustomNodeData> {
  width?: number;
  height?: number;
}

export interface TopologyContextMenu {
  id: string;
  type: 'node' | 'edge';
  top: number;
  left: number;
  data: Node | import('reactflow').Edge; // Use import('reactflow').Edge to avoid direct Edge type here
}

