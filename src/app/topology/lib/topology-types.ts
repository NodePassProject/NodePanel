
import type { Node, Edge, Viewport } from 'reactflow';
import type { NamedApiConfig, MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';

export interface BaseNodeData {
  label: string;
  type: 'controller' | 'server' | 'client' | 'landing' | 'user';
  apiId?: string; 
  apiName?: string; 
  isChainHighlighted?: boolean;
  statusInfo?: string;
  isExpanded?: boolean;
}

export interface ControllerNodeData extends BaseNodeData {
  type: 'controller';
  apiName: string; 
  apiId: string;   
  role?: 'server' | 'client' | 'general'; 
  // Fields for when role is 'client'
  tunnelAddress?: string;
  targetAddress?: string;
  logLevel?: MasterLogLevel;
  managingApiId?: string; 
  managingApiName?: string; 
}

export interface ServerNodeData extends BaseNodeData {
  type: 'server';
  instanceType: 'server';
  tunnelAddress: string;
  targetAddress: string;
  logLevel: MasterLogLevel;
  tlsMode: MasterTlsMode;
  crtPath?: string;
  keyPath?: string;
  managingApiId?: string; 
  managingApiName?: string; 
}

export interface ClientNodeData extends BaseNodeData {
  type: 'client';
  instanceType: 'client';
  tunnelAddress: string;
  targetAddress: string;
  logLevel: MasterLogLevel;
  managingApiId?: string; 
  managingApiName?: string; 
}

export interface LandingNodeData extends BaseNodeData {
  type: 'landing';
  landingIp: string;
  landingPort: string;
  managingApiId?: string; 
  managingApiName?: string; 
}

export interface UserNodeData extends BaseNodeData {
  type: 'user';
  description: string;
}

export type TopologyNodeData = ControllerNodeData | ServerNodeData | ClientNodeData | LandingNodeData | UserNodeData;
export type NodePassFlowNodeType = Node<TopologyNodeData>;

export const initialViewport: Viewport = { x: 0, y: 0, zoom: 0.8 }; 

export const NODE_DEFAULT_WIDTH = 180;
export const NODE_DEFAULT_HEIGHT = 60; 
export const NODE_EXPANDED_DEFAULT_HEIGHT = 100; 

// Dimensions for simple controller nodes (not groups)
export const CONTROLLER_NODE_DEFAULT_WIDTH = 180;
export const CONTROLLER_NODE_DEFAULT_HEIGHT = 60;
export const CONTROLLER_CLIENT_ROLE_EXPANDED_HEIGHT = 120;


export const CHAIN_HIGHLIGHT_COLOR = 'hsl(var(--chart-1))';

// Auto-layout constants
export const TIER_Y_SPACING = 180; // Adjusted from 240 for a flatter layout
export const NODE_X_SPACING = 250; // Adjusted from 280

export interface PendingOperationDetail {
  originalNodeId: string;
  url: string;
}

export interface PendingOperationsGroup {
  apiConfig: NamedApiConfig;
  urlsToCreate: PendingOperationDetail[];
}

export type PendingOperations = Record<string, PendingOperationsGroup>;

export interface DraggableNodeType {
  type: TopologyNodeData['type'];
  title: string;
  icon: React.ElementType;
  apiId?: string;
  apiName?: string;
  disabled?: boolean; // For disabling drag from panel
}

export const INTER_CONTROLLER_CLIENT_DEFAULT_PORT = '10002';
export const CONTROLLER_CLIENT_ROLE_DEFAULT_TARGET_PORT = '8001';

