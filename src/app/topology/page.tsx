
'use client';

import React, { useCallback, useState, useEffect, useMemo, useRef, memo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  MiniMap,
  Position,
  MarkerType,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  type Connection,
  type Edge,
  type Node as ReactFlowNode,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeProps,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTheme } from 'next-themes';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Server, DatabaseZap, Cable, User, Loader2, Cog } from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { TopologyToolbar } from './components/TopologyToolbar';
import { MastersPalette } from './components/MastersPalette';
import { ComponentsPalette, type DraggableNodeType } from './components/ComponentsPalette';
import { PropertiesDisplayPanel } from './components/PropertiesDisplayPanel';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { useApiConfig } from '@/hooks/use-api-key';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { nodePassApi } from '@/lib/api';
import { buildUrlFromFormValues, type BuildUrlParams } from '@/components/nodepass/create-instance-dialog/utils';
import { extractPort, extractHostname, formatHostForDisplay, isWildcardHostname, formatHostForUrl } from '@/lib/url-utils';
import { SubmitTopologyConfirmationDialog, type InstanceUrlConfigWithName } from './components/SubmitTopologyConfirmationDialog';
import { EditTopologyNodeDialog } from './components/EditTopologyNodeDialog';


// --- Type Definitions ---
export type NodeRole = 'M' | 'S' | 'C' | 'T' | 'U';
export type MasterSubRole = 'client-role' | 'server-role' | 'generic' | 'primary';

export interface CustomNodeData {
  label: string;
  role: NodeRole;
  icon?: React.ElementType;
  masterSubRole?: MasterSubRole;
  nodeType?: string;
  masterId?: string; 
  masterName?: string; 
  representedMasterId?: string; 
  representedMasterName?: string; 
  isContainer?: boolean;
  parentNode?: string; 
  isDefaultClient?: boolean;
  apiUrl?: string; 
  defaultLogLevel?: string;
  defaultTlsMode?: string;
  tunnelAddress?: string; 
  targetAddress?: string; // For M (client-role), this is its local service address. For S/C, their respective tunnel/target. For T, this is its forward address.
  // ipAddress and port for T-nodes are deprecated, use targetAddress
  submissionStatus?: 'pending' | 'success' | 'error'; 
  submissionMessage?: string; 
  logLevel?: string; 
  tlsMode?: string; 
  certPath?: string; 
  keyPath?: string; 

  // For M-node (client-role) defining a cross-master tunnel
  remoteMasterIdForTunnel?: string;
  remoteServerListenAddress?: string;
  remoteServerForwardAddress?: string;
}

export interface Node extends ReactFlowNode<CustomNodeData> {
  width?: number;
  height?: number;
}

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

interface TopologyContextMenu {
  id: string;
  type: 'node' | 'edge';
  top: number;
  left: number;
  data: Node | Edge;
}

const CARD_NODE_WIDTH = 100;
const CARD_NODE_HEIGHT = 40;
const ICON_NODE_SIZE = 40;

const TOTAL_ZOOM_LEVELS = 10;
const TARGET_ZOOM_LEVEL = 4;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 1.0;
const zoomStep = (MAX_ZOOM - MIN_ZOOM) / (TOTAL_ZOOM_LEVELS - 1);
const initialZoom = MIN_ZOOM + (TARGET_ZOOM_LEVEL - 1) * zoomStep;

// --- Custom Node Components ---

const MasterNode: React.FC<NodeProps<CustomNodeData>> = memo(({ data, selected }) => {
  const subRoleText = data.masterSubRole === 'client-role' ? '(客户隧道)' 
                    : data.masterSubRole === 'server-role' ? '(服务主机)' 
                    : data.masterSubRole === 'primary' ? '(主要)' 
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

const CardNode: React.FC<NodeProps<CustomNodeData>> = memo(({ data, selected }) => {
  const IconComponent = data.icon;
  const roleStyle = nodeStyles[data.role.toLowerCase() as keyof typeof nodeStyles];
  
  const baseCardClasses = `flex items-center rounded-lg border-2 shadow-sm transition-all duration-200 ease-in-out p-1.5 flex-col`;
  
  const width = CARD_NODE_WIDTH;
  const height = data.submissionStatus ? CARD_NODE_HEIGHT + 20 : CARD_NODE_HEIGHT; 
  
  const dynamicStyle = {
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
            <span className="font-medium text-xs truncate" style={{color: selected ? roleStyle.base.color : 'hsl(var(--foreground))' }}>{displayText}</span>
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


const nodeTypes = {
  cardNode: CardNode,
  masterNode: MasterNode,
};

const nodeStyles = { 
    m: {
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
            textAlign: 'center'
        }
    },
    s: { base: { background: 'hsl(210, 100%, 97%)', borderColor: 'hsl(210, 80%, 60%)', color: 'hsl(210, 90%, 30%)' } }, 
    c: { base: { background: 'hsl(145, 63%, 96%)', borderColor: 'hsl(145, 60%, 45%)', color: 'hsl(145, 80%, 20%)' } }, 
    t: { base: { background: 'hsl(35, 100%, 96%)', borderColor: 'hsl(35, 90%, 60%)', color: 'hsl(35, 90%, 35%)' } },   
    u: { base: { background: 'hsl(265, 80%, 97%)', borderColor: 'hsl(265, 70%, 60%)', color: 'hsl(265, 70%, 40%)' } }  
}

interface ActualTopologyFlowWithStateProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (params: Connection | Edge) => void;
  onSelectionChange: ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => void;
  reactFlowWrapperRef: React.RefObject<HTMLDivElement>;
  onCenterView: (instance: ReturnType<typeof useReactFlow>) => void;
  onClearCanvas: () => void;
  onTriggerSubmitTopology: () => void; 
  canSubmit: boolean;
  isSubmitting: boolean;
  onNodeDropOnCanvas: (
    type: DraggableNodeType | 'master',
    position: { x: number; y: number },
    draggedData?: NamedApiConfig
  ) => void;
  onNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
  onEdgeContextMenu: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
}

const ActualTopologyFlowWithState: React.FC<ActualTopologyFlowWithStateProps> = ({
  nodes, edges, onNodesChange, onEdgesChange, onConnect, onSelectionChange, reactFlowWrapperRef, onCenterView, onClearCanvas, onTriggerSubmitTopology, canSubmit, isSubmitting, onNodeDropOnCanvas, onNodeContextMenu, onEdgeContextMenu, onPaneClick,
}) => {
  const { resolvedTheme } = useTheme();
  const [isClient, setIsClient] = useState(false);
  const reactFlowInstance = useReactFlow();

  useEffect(() => { setIsClient(true); }, []);

  const miniMapStyle = useMemo(() => ({
    backgroundColor: resolvedTheme === 'dark' ? 'hsl(var(--popover))' : 'hsl(var(--card))',
    border: `1px solid hsl(var(--border))`,
    borderRadius: '0.375rem',
  }), [resolvedTheme]);

  const memoizedMiniMap = useMemo(() => (isClient ? <MiniMap style={miniMapStyle} nodeStrokeWidth={3} zoomable pannable /> : null), [miniMapStyle, isClient]);
  const memoizedBackground = useMemo(() => <Background variant="dots" gap={16} size={1} />, []);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!reactFlowInstance || !reactFlowWrapperRef.current) return;
    const reactFlowBounds = reactFlowWrapperRef.current.getBoundingClientRect();
    const masterConfigString = event.dataTransfer.getData('application/nodepass-master-config');
    const componentTypeString = event.dataTransfer.getData('application/nodepass-component-type') as DraggableNodeType;
    const position = reactFlowInstance.project({
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    });
    if (masterConfigString) {
      try {
        const config = JSON.parse(masterConfigString) as NamedApiConfig;
        onNodeDropOnCanvas('master', position, config);
      } catch (e) { console.error('Failed to parse dragged master config:', e); }
    } else if (componentTypeString) {
      onNodeDropOnCanvas(componentTypeString, position);
    }
  };

  return (
    <div ref={reactFlowWrapperRef} className="h-full w-full bg-background rounded-lg shadow-md border" onDragOver={handleDragOver} onDrop={handleDrop}>
      <ReactFlow
        nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onSelectionChange={onSelectionChange}
        onNodeContextMenu={onNodeContextMenu} onEdgeContextMenu={onEdgeContextMenu} onPaneClick={onPaneClick} 
        defaultViewport={{ x: 0, y: 0, zoom: initialZoom }}
        nodesDraggable={!isSubmitting} nodesConnectable={!isSubmitting}
        elementsSelectable={!isSubmitting} deleteKeyCode={isSubmitting ? [] : ['Backspace', 'Delete']} panOnScroll={false} zoomOnScroll={true} panOnDrag={true} selectionOnDrag
        className="h-full w-full" nodeOrigin={[0, 0]} nodeTypes={nodeTypes}
      >
        <Panel position="top-right" className="!m-0 !p-2 bg-transparent">
          <ToolbarWrapperComponent {...{ onCenterView, onClearCanvas, onSubmitTopology: onTriggerSubmitTopology, canSubmit, isSubmitting }} />
        </Panel>
        {memoizedMiniMap}
        {memoizedBackground}
      </ReactFlow>
    </div>
  );
};

interface ToolbarWrapperComponentProps {
  onCenterView: (instance: ReturnType<typeof useReactFlow>) => void;
  onClearCanvas: () => void;
  onSubmitTopology: () => void;
  canSubmit: boolean;
  isSubmitting: boolean;
}

const ToolbarWrapperComponent: React.FC<ToolbarWrapperComponentProps> = ({ onCenterView, onClearCanvas, onSubmitTopology, canSubmit, isSubmitting }) => {
  const reactFlowInstance = useReactFlow();
  return <TopologyToolbar onCenterView={() => onCenterView(reactFlowInstance)} {...{ onClearCanvas, onSubmitTopology, canSubmit, isSubmitting }} />;
};


function TopologyEditorCore() {
  const [nodesInternal, setNodesInternal, onNodesChangeInternal] = useNodesState<Node>(initialNodes);
  const [edgesInternal, setEdgesInternal, onEdgesChangeInternal] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(0);
  const { toast } = useToast();
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);
  const { deleteElements, fitView } = useReactFlow();
  const [contextMenu, setContextMenu] = useState<TopologyContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const { getApiConfigById, getApiRootUrl, getToken } = useApiConfig();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [instancesForConfirmation, setInstancesForConfirmation] = useState<InstanceUrlConfigWithName[]>([]);
  const [isEditNodeDialogOpen, setIsEditNodeDialogOpen] = useState(false);
  const [nodeToEdit, setNodeToEdit] = useState<Node | null>(null);
  
  const getNodeById = useCallback((id: string): Node | undefined => nodesInternal.find((n) => n.id === id), [nodesInternal]);
  const getEdgeById = useCallback((id: string): Edge | undefined => edgesInternal.find((e) => e.id === id), [edgesInternal]);
  
  const createInstanceMutation = useMutation({
    mutationFn: (params: { data: { url: string }, useApiRoot: string, useApiToken: string, originalNodeId: string }) => {
      return nodePassApi.createInstance(params.data, params.useApiRoot, params.useApiToken);
    },
    onMutate: (variables) => {
      setNodesInternal(nds => nds.map(n => {
        if (n.id === variables.originalNodeId) {
          return { ...n, data: { ...n.data, submissionStatus: 'pending', submissionMessage: '提交中...' } };
        }
        return n;
      }));
    },
    onSuccess: (createdInstance, variables) => {
      toast({ title: `实例创建成功`, description: `节点 ${variables.originalNodeId.substring(0,8)}... -> ID: ${createdInstance.id.substring(0,8)}...` });
      setNodesInternal(nds => nds.map(n => {
         if (n.id === variables.originalNodeId) {
            let message = `ID: ${createdInstance.id.substring(0,8)}...`;
            if (n.data.role === 'M' && n.data.submissionMessage && n.data.submissionMessage.startsWith('ID:')) {
                message = `${n.data.submissionMessage}, ${message}`;
            }
            return { ...n, data: { ...n.data, submissionStatus: 'success', submissionMessage: message } };
        }
        return n;
      }));
      const submittedInstanceInfo = instancesForConfirmation.find(inst => inst.nodeId === variables.originalNodeId && inst.url === variables.data.url);
      if (submittedInstanceInfo) {
        queryClient.invalidateQueries({ queryKey: ['instances', submittedInstanceInfo.masterId]});
      } else {
         const masterIdForInvalidation = getNodeById(variables.originalNodeId)?.data.masterId;
         if (masterIdForInvalidation) {
           queryClient.invalidateQueries({ queryKey: ['instances', masterIdForInvalidation]});
         }
      }
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTopologyPage']});
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']});
    },
    onError: (error: any, variables) => {
      toast({ title: `创建实例失败 (节点 ${variables.originalNodeId.substring(0,8)}...)`, description: error.message || '未知错误', variant: 'destructive' });
      setNodesInternal(nds => nds.map(n => {
        if (n.id === variables.originalNodeId) {
           let message = error.message.substring(0,30) || '失败';
            if (n.data.role === 'M' && n.data.submissionMessage && n.data.submissionMessage.startsWith('ID:')) { // If one part succeeded
                message = `${n.data.submissionMessage}, 另一部分: ${message}`;
            }
           return { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: message } };
        }
        return n;
      }));
    },
  });

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      const sourceNode = getNodeById(params.source!);
      const targetNode = getNodeById(params.target!);

      if (!sourceNode || !targetNode) {
        toast({ title: '连接错误', description: '源节点或目标节点未找到。', variant: 'destructive' });
        return;
      }
      if (params.source === params.target) {
        toast({ title: '连接无效', description: '节点不能连接到自身。', variant: 'destructive' });
        return;
      }
      if (edgesInternal.some(edge => (edge.source === params.source && edge.target === params.target) || (edge.source === params.target && edge.target === params.source))) {
        toast({ title: '连接已存在', description: '这两个节点之间已经存在一条连接。', variant: 'destructive' });
        return;
      }

      if (targetNode.data.role === 'U') {
        toast({ title: '连接无效', description: '用户端 (U) 节点不能被其他节点链接。', variant: 'destructive' });
        return;
      }
      if (sourceNode.data.role === 'U' && targetNode.data.role !== 'M') {
        toast({ title: '连接无效', description: '用户端 (U) 节点只能链接到主控 (M) 节点。', variant: 'destructive' });
        return;
      }

      if (sourceNode.data.role === 'T') {
        toast({ title: '连接无效', description: '落地端 (T) 节点不能作为连接的起点。', variant: 'destructive' });
        return;
      }
      
      if (targetNode.data.role === 'T') {
        const sourceIsConnectableToT = sourceNode.data.role === 'S' || sourceNode.data.role === 'C' || (sourceNode.data.role === 'M' && sourceNode.data.masterSubRole === 'client-role');
        if (!sourceIsConnectableToT) {
            toast({ title: '连接无效', description: '落地端 (T) 节点只能被主控 (客户隧道角色), 出口(s), 或 入口(c) 节点链接。', variant: 'destructive' });
            return;
        }
      }
      
      const sourceParentId = sourceNode.data.parentNode;
      const targetParentId = targetNode.data.parentNode;
      const isInternalConnection = sourceParentId && targetParentId && sourceParentId === targetParentId;
      
      if (isInternalConnection && !(sourceNode.data.role === 'C' && targetNode.data.role === 'S')) {
         toast({ title: '连接无效', description: '在主控容器内，只允许从 入口(c) 连接到 出口(s)。', variant: 'destructive' });
         return;
      }
      
      const newEdge = {
        ...params,
        animated: true,
        style: { strokeDasharray: '5 5' },
        type: isInternalConnection ? 'step' : 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
      };
      
      setEdgesInternal((eds) => addEdge(newEdge, eds));
      let updatedNodes = [...nodesInternal];

      // Client (C) connects to Server (S) - Update Client's tunnelAddress
      if (sourceNode.data.role === 'C' && targetNode.data.role === 'S') {
        const clientNode = sourceNode;
        const serverNode = targetNode;
        const serverNodeData = serverNode.data;
        
        let masterApiHost: string | null = null;
        const serverParentMContainerId = serverNodeData.parentNode;
        const clientParentMContainerId = clientNode.data.parentNode;

        if (serverParentMContainerId && clientParentMContainerId && serverParentMContainerId === clientParentMContainerId) {
            // C and S are in the same M-container
            const mContainerNode = getNodeById(serverParentMContainerId);
            const masterConfigForM = mContainerNode ? getApiConfigById(mContainerNode.data.masterId!) : null;
            if (masterConfigForM?.apiUrl) masterApiHost = extractHostname(masterConfigForM.apiUrl);
        } else {
            // S is standalone or in a different M than C. Use S's represented/parent master.
            const serverEffectiveMasterId = serverNodeData.representedMasterId || (serverParentMContainerId ? getNodeById(serverParentMContainerId)?.data.masterId : null);
            const masterConfigForS = serverEffectiveMasterId ? getApiConfigById(serverEffectiveMasterId) : null;
            if (masterConfigForS?.apiUrl) masterApiHost = extractHostname(masterConfigForS.apiUrl);
        }
        
        const serverListenHost = extractHostname(serverNodeData.tunnelAddress || "");
        const serverListenPort = extractPort(serverNodeData.tunnelAddress || "");
        let clientEffectiveTunnelHost = serverListenHost;

        if (serverListenHost && isWildcardHostname(serverListenHost) && masterApiHost && masterApiHost.trim() !== "") {
            clientEffectiveTunnelHost = masterApiHost;
        }
        
        const newClientTunnelAddress = serverListenPort && clientEffectiveTunnelHost && clientEffectiveTunnelHost.trim() !== ""
            ? `${formatHostForUrl(clientEffectiveTunnelHost)}:${serverListenPort}`
            : serverNodeData.tunnelAddress || ""; // Fallback

        let clientLocalTargetPort = extractPort(clientNode.data.targetAddress || "");
        if (!clientLocalTargetPort && serverListenPort) {
            clientLocalTargetPort = (parseInt(serverListenPort, 10) + 1).toString();
        }
        const clientLocalTargetHost = extractHostname(clientNode.data.targetAddress || "") || "[::]";
        const newClientTargetAddress = clientLocalTargetPort ? `${formatHostForDisplay(clientLocalTargetHost)}:${clientLocalTargetPort}` : clientNode.data.targetAddress;

        updatedNodes = updatedNodes.map(n => {
            if (n.id === clientNode.id) {
                return { ...n, data: { ...n.data, tunnelAddress: newClientTunnelAddress, targetAddress: newClientTargetAddress } };
            }
            return n;
        });
        toast({ title: "入口(c) 地址已更新", description: `入口(c) ${clientNode.data.label} 已自动配置连接到 出口(s) ${serverNode.data.label}。`});
      }

      // Sync S/C or M(client-role) targetAddress with T targetAddress
      const sourceIsConnectableToT = sourceNode.data.role === 'S' || sourceNode.data.role === 'C' || (sourceNode.data.role === 'M' && sourceNode.data.masterSubRole === 'client-role');
      if (sourceIsConnectableToT && targetNode.data.role === 'T') {
        const scOrMNode = sourceNode;
        const tNode = targetNode;
        if (scOrMNode.data.targetAddress && scOrMNode.data.targetAddress.trim() !== "" && scOrMNode.data.targetAddress !== tNode.data.targetAddress) {
          updatedNodes = updatedNodes.map(n => 
            n.id === tNode.id ? { ...n, data: { ...n.data, targetAddress: scOrMNode.data.targetAddress } } : n
          );
           toast({ title: `落地端 ${tNode.data.label} 已同步上游目标地址。`});
        } else if (tNode.data.targetAddress && tNode.data.targetAddress.trim() !== "" && tNode.data.targetAddress !== scOrMNode.data.targetAddress) {
          updatedNodes = updatedNodes.map(n =>
            n.id === scOrMNode.id ? { ...n, data: { ...n.data, targetAddress: tNode.data.targetAddress } } : n
          );
           toast({ title: `${scOrMNode.data.label} 已同步落地端目标地址。`});
        }
      }
      setNodesInternal(updatedNodes);
    },
    [edgesInternal, setEdgesInternal, toast, getNodeById, setNodesInternal, nodesInternal, getApiConfigById]
  );

  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedNode(selectedNodesList.length === 1 ? selectedNodesList[0] : null);
    if (selectedNodesList.length !== 1) setContextMenu(null);
  }, []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    const bounds = editorContainerRef.current?.getBoundingClientRect();
    const top = event.clientY - (bounds?.top || 0);
    const left = event.clientX - (bounds?.left || 0);
    setContextMenu({ id: node.id, type: 'node', top, left, data: node });
  }, [setContextMenu]);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    const bounds = editorContainerRef.current?.getBoundingClientRect();
    const top = event.clientY - (bounds?.top || 0);
    const left = event.clientX - (bounds?.left || 0);
    setContextMenu({ id: edge.id, type: 'edge', top, left, data: edge });
  }, [setContextMenu]);
  
  const onPaneClick = useCallback(() => setContextMenu(null), [setContextMenu]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as HTMLElement)) setContextMenu(null);
    };
    if (contextMenu) document.addEventListener('mousedown', handleClickOutside);
    else document.removeEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  const handleNodeDroppedOnCanvas = useCallback((
      type: DraggableNodeType | 'master',
      position: { x: number; y: number },
      draggedData?: NamedApiConfig
  ) => {
      let currentCounter = nodeIdCounter;
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      let nodesToFit: { id: string }[] | null = null;
      
      const mNodeWidth = 300, mNodeHeight = 200;
      
      const parentMContainer = nodesInternal.find(n => {
          if (n.data.role !== 'M' || !n.data.isContainer) return false;
          const { x: nodeX, y: nodeY } = n.position;
          const nodeWidth = n.width ?? 0;
          const nodeHeight = n.height ?? 0;
          return (position.x >= nodeX && position.x <= nodeX + nodeWidth && position.y >= nodeY && position.y <= nodeY + nodeHeight);
      });

      if (type === 'master' && draggedData) {
          if (parentMContainer) { 
              const sNodeId = `s-from-master-${draggedData.id.substring(0, 8)}-${++currentCounter}`;
              const relativePosition = { x: position.x - parentMContainer.position.x - (CARD_NODE_WIDTH / 2), y: position.y - parentMContainer.position.y - (CARD_NODE_HEIGHT / 2) };
              const sNode: Node = {
                  id: sNodeId, type: 'cardNode', position: relativePosition, parentNode: parentMContainer.id, extent: 'parent', 
                  data: {
                      label: `出口(s): ${draggedData.name}`, role: 'S', icon: Server, parentNode: parentMContainer.id, 
                      representedMasterId: draggedData.id, representedMasterName: draggedData.name,
                      tunnelAddress: `[::]:${10000 + currentCounter}`, 
                      targetAddress: `127.0.0.1:${3000 + currentCounter}`, 
                      logLevel: draggedData.masterDefaultLogLevel || parentMContainer.data.defaultLogLevel || 'master',
                      tlsMode: draggedData.masterDefaultTlsMode || parentMContainer.data.defaultTlsMode || 'master',
                  },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              };
              newNodes.push(sNode);

              const defaultClient = nodesInternal.find(n => n.data.parentNode === parentMContainer.id && n.data.isDefaultClient);
              if (defaultClient) {
                  newEdges.push({
                      id: `edge-${defaultClient.id}-${sNode.id}`, source: defaultClient.id, target: sNode.id,
                      type: 'step', markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
                  });
              }
              toast({ title: "出口(s)节点已添加至主控容器" });
          } else { 
              const mId = `master-${draggedData.id.substring(0, 8)}-${++currentCounter}`;
              const uId = `user-for-${mId}`;
              const cId = `default-client-for-${mId}`; 
              const tId = `default-tunnel-for-${mId}`;

              newNodes.push({
                  id: mId, type: 'masterNode', position,
                  data: { 
                    label: `主控: ${draggedData.name || '未命名'}`, role: 'M', isContainer: true, 
                    masterId: draggedData.id, masterName: draggedData.name,
                    apiUrl: draggedData.apiUrl, 
                    defaultLogLevel: draggedData.masterDefaultLogLevel,
                    defaultTlsMode: draggedData.masterDefaultTlsMode,
                    masterSubRole: "server-role", 
                  },
                  style: { ...nodeStyles.m.base, width: mNodeWidth, height: mNodeHeight },
                  width: mNodeWidth, height: mNodeHeight,
              });
              newNodes.push({ 
                  id: cId, type: 'cardNode', parentNode: mId, extent: 'parent',
                  position: { x: (mNodeWidth / 2) - (CARD_NODE_WIDTH / 2), y: 50 }, 
                  data: { 
                    label: '本地 (C)', role: 'C', icon: DatabaseZap, parentNode: mId, isDefaultClient: true,
                    logLevel: draggedData.masterDefaultLogLevel || 'master',
                    targetAddress: `[::]:${10001 + currentCounter}` 
                  },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              });
              
              newNodes.push({
                  id: uId, type: 'cardNode',
                  position: { x: position.x - CARD_NODE_WIDTH - 60, y: position.y + (mNodeHeight / 2) - (CARD_NODE_HEIGHT / 2) },
                  data: { label: '用户端', role: 'U', icon: User },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              });
              
              newNodes.push({
                  id: tId, type: 'cardNode',
                  position: { x: position.x + mNodeWidth + 60, y: position.y + (mNodeHeight / 2) - (CARD_NODE_HEIGHT / 2) },
                  data: { label: '落地端', role: 'T', icon: Cable, targetAddress: '192.168.1.10:80' },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              });

              newEdges.push({
                  id: `edge-${uId}-${mId}`, source: uId, target: mId, type: 'smoothstep', targetHandle: 'm-left', 
                  markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
              });
              newEdges.push({
                  id: `edge-${mId}-${tId}`, source: mId, target: tId, type: 'smoothstep', sourceHandle: 'm-right',
                  markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
              });
              toast({ title: "主控容器已创建" });
              nodesToFit = [{ id: uId }, { id: mId }, { id: tId }];
          }
      } else if (type !== 'master') { 
          const nodeRole = type.toUpperCase() as NodeRole;
          const { labelPrefix, icon, width, height } = {
              'S': { labelPrefix: '出口(s)', icon: Server, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
              'C': { labelPrefix: '入口(c)', icon: DatabaseZap, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
              'T': { labelPrefix: '落地端', icon: Cable, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
              'U': { labelPrefix: '用户端', icon: User, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
          }[nodeRole]!;

          if ((nodeRole === 'S' || nodeRole === 'C') && !parentMContainer) {
              toast({ title: "操作无效", description: `请将 ${labelPrefix} (${nodeRole}) 拖拽到主控 (M) 容器内。`, variant: "destructive" });
              return;
          }

          const newNodeId = `${nodeRole.toLowerCase()}-${++currentCounter}`;
          const newNodeData: CustomNodeData = {
             label: labelPrefix, role: nodeRole, icon,
             logLevel: 'master',
          };

          if (nodeRole === 'S') {
            newNodeData.tunnelAddress = `[::]:${10000 + currentCounter}`;
            newNodeData.targetAddress = `127.0.0.1:${3000 + currentCounter}`;
            newNodeData.tlsMode = 'master';
          } else if (nodeRole === 'C') {
            newNodeData.targetAddress = `[::]:${10001 + currentCounter + Math.floor(Math.random()*50)}`;
          } else if (nodeRole === 'T') {
            newNodeData.targetAddress = '192.168.1.20:8080';
          }
          
          const newNode: Node = { id: newNodeId, type: 'cardNode', position, data: newNodeData, width, height };

          if (parentMContainer) {
              newNode.parentNode = parentMContainer.id;
              newNode.extent = 'parent';
              newNode.position = { x: position.x - parentMContainer.position.x - (width / 2), y: position.y - parentMContainer.position.y - (height / 2) };
              newNode.data.logLevel = parentMContainer.data.defaultLogLevel || 'master';
              if (nodeRole === 'S') newNode.data.tlsMode = parentMContainer.data.defaultTlsMode || 'master';

              if (nodeRole === 'S') { 
                  const defaultClient = nodesInternal.find(n => n.data.parentNode === parentMContainer.id && n.data.isDefaultClient);
                  if (defaultClient) {
                      newEdges.push({
                          id: `edge-${defaultClient.id}-${newNodeId}`, source: defaultClient.id, target: newNodeId, 
                          type: 'step', markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
                      });
                      
                      let masterApiHost: string | null = null;
                      const masterConfigForMContainer = getApiConfigById(parentMContainer.data.masterId!);
                      if (masterConfigForMContainer?.apiUrl) {
                          masterApiHost = extractHostname(masterConfigForMContainer.apiUrl);
                      }
                      const serverListenHost = extractHostname(newNode.data.tunnelAddress || "");
                      const serverListenPort = extractPort(newNode.data.tunnelAddress || "");
                      let clientEffectiveTunnelHost = serverListenHost;
                      if (serverListenHost && isWildcardHostname(serverListenHost) && masterApiHost && masterApiHost.trim() !== "") {
                          clientEffectiveTunnelHost = masterApiHost;
                      }
                      const newClientTunnelAddress = serverListenPort && clientEffectiveTunnelHost && clientEffectiveTunnelHost.trim() !== ""
                          ? `${formatHostForUrl(clientEffectiveTunnelHost)}:${serverListenPort}`
                          : newNode.data.tunnelAddress || "";

                      let clientLocalTargetPort = "0";
                      const serverPortNum = parseInt(serverListenPort || "0", 10);
                      if (serverPortNum > 0) clientLocalTargetPort = (serverPortNum + 1).toString();

                      setNodesInternal(nds => nds.map(n => n.id === defaultClient.id ? { ...n, data: { ...n.data, tunnelAddress: newClientTunnelAddress, targetAddress: `[::]:${clientLocalTargetPort}` } } : n));
                  }
              }
          }
          newNodes.push(newNode);
          toast({ title: `${labelPrefix} 节点已添加` });
      } else { return; }

      setNodesInternal(nds => nds.concat(newNodes));
      if (newEdges.length > 0) setEdgesInternal(eds => eds.concat(newEdges));
      setNodeIdCounter(currentCounter + newNodes.length);

      if (nodesToFit) {
        setTimeout(() => {
          fitView({ nodes: nodesToFit, duration: 400, padding: 0.2 });
        }, 50);
      }
  }, [nodeIdCounter, nodesInternal, toast, setNodesInternal, setEdgesInternal, fitView, getApiConfigById]);

    const handleChangeNodeRole = useCallback((nodeId: string, newRole: 'S' | 'C') => {
        setNodesInternal(nds => nds.map(node => {
            if (node.id === nodeId) {
                const newLabel = newRole === 'S' ? '出口(s)' : '入口(c)';
                const newIcon = newRole === 'S' ? Server : DatabaseZap;
                const newData: CustomNodeData = { ...node.data, role: newRole, icon: newIcon, label: newLabel };
                if (newRole === 'S' && !node.data.tlsMode) newData.tlsMode = node.data.parentNode ? (getNodeById(node.data.parentNode)?.data.defaultTlsMode || 'master') : 'master';
                else if (newRole === 'C') delete newData.tlsMode;
                return { ...node, data: newData };
            }
            return node;
        }));
        toast({ title: "角色已更改" });
        setContextMenu(null);
    }, [setNodesInternal, toast, getNodeById]);

  const handleClearCanvasCallback = useCallback(() => {
    setNodesInternal([]); setEdgesInternal([]); setNodeIdCounter(0); setSelectedNode(null); setContextMenu(null);
    toast({ title: '画布已清空' });
  }, [setNodesInternal, setEdgesInternal, toast]);

  const handleCenterViewCallback = useCallback((instance: ReturnType<typeof useReactFlow> | null) => {
      if (!instance) return;
      setContextMenu(null);
      instance.fitView({ duration: 300, padding: 0.2 });
  }, []);
  
  const prepareInstancesForSubmission = useCallback((): InstanceUrlConfigWithName[] => {
    const instancesToCreate: InstanceUrlConfigWithName[] = [];
    for (const node of nodesInternal) {
      if (node.data.role === 'S' || node.data.role === 'C') { // Standard S/C nodes
        let masterId: string | undefined = node.data.representedMasterId;
        if (node.parentNode) {
          const parentMNode = getNodeById(node.parentNode);
          masterId = parentMNode?.data.masterId;
        }

        if (!masterId) {
          setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '无主控' } } : n));
          continue;
        }

        const masterConfig = getApiConfigById(masterId);
        if (!masterConfig) {
          setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '主控配置丢失' } } : n));
          continue;
        }
        
        let urlParams: BuildUrlParams | null = null;
        const instanceTypeForBuild: "入口(c)" | "出口(s)" = node.data.role === 'S' ? "出口(s)" : "入口(c)";

        if (node.data.role === 'S') {
          if (!node.data.targetAddress || !node.data.tunnelAddress) {
            setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '地址不完整' } } : n));
            continue;
          }
          urlParams = {
            instanceType: instanceTypeForBuild,
            tunnelAddress: node.data.tunnelAddress,
            targetAddress: node.data.targetAddress,
            logLevel: (node.data.logLevel as any) || 'master',
            tlsMode: (node.data.tlsMode as any) || 'master',
            certPath: node.data.certPath,
            keyPath: node.data.keyPath,
          };
        } else if (node.data.role === 'C') {
          if (!node.data.tunnelAddress || !node.data.targetAddress) {
            setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '地址不完整' } } : n));
            continue;
          }
          urlParams = {
            instanceType: instanceTypeForBuild,
            tunnelAddress: node.data.tunnelAddress, 
            targetAddress: node.data.targetAddress, 
            logLevel: (node.data.logLevel as any) || 'master',
            // For client, tlsMode, certPath, keyPath for connection to server are derived from its own properties.
            tlsMode: (node.data.tlsMode as any) || 'master', 
            certPath: node.data.certPath,
            keyPath: node.data.keyPath,
          };
        }

        if (urlParams) {
          const finalUrl = buildUrlFromFormValues(urlParams, masterConfig);
          instancesToCreate.push({ 
            nodeId: node.id, 
            nodeLabel: node.data.label,
            masterId: masterConfig.id, 
            masterName: masterConfig.name, 
            url: finalUrl, 
            instanceType: instanceTypeForBuild 
          });
        }
      } else if (node.data.role === 'M' && node.data.masterSubRole === 'client-role' && node.data.remoteMasterIdForTunnel && node.data.remoteServerListenAddress && node.data.remoteServerForwardAddress && node.data.targetAddress) {
        const clientMasterConfig = getApiConfigById(node.data.masterId!);
        const serverMasterConfig = getApiConfigById(node.data.remoteMasterIdForTunnel);

        if (!clientMasterConfig || !serverMasterConfig) {
          setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '隧道主控配置不完整' } } : n));
          continue;
        }

        const clientRemoteHost = extractHostname(serverMasterConfig.apiUrl);
        const clientRemotePort = extractPort(node.data.remoteServerListenAddress);
        if (!clientRemoteHost || !clientRemotePort) {
            setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '无法构建客户端隧道地址' } } : n));
            continue;
        }
        const clientTunnelAddressToRemote = `${formatHostForUrl(clientRemoteHost)}:${clientRemotePort}`;
        
        const clientUrlParams: BuildUrlParams = {
            instanceType: "入口(c)",
            tunnelAddress: clientTunnelAddressToRemote,
            targetAddress: node.data.targetAddress, 
            logLevel: (node.data.logLevel as any) || clientMasterConfig.masterDefaultLogLevel || 'master',
            tlsMode: (node.data.tlsMode as any) || clientMasterConfig.masterDefaultTlsMode || 'master', // Client TLS to Server
            certPath: node.data.certPath, // Client cert for mTLS if applicable
            keyPath: node.data.keyPath,   // Client key for mTLS if applicable
        };
        const clientFinalUrl = buildUrlFromFormValues(clientUrlParams, clientMasterConfig);
        instancesToCreate.push({
            nodeId: node.id, 
            nodeLabel: `${node.data.label} (入口部分)`,
            masterId: clientMasterConfig.id,
            masterName: clientMasterConfig.name,
            url: clientFinalUrl,
            instanceType: "入口(c)",
        });

        const serverUrlParams: BuildUrlParams = {
            instanceType: "出口(s)",
            tunnelAddress: node.data.remoteServerListenAddress,
            targetAddress: node.data.remoteServerForwardAddress,
            logLevel: (node.data.logLevel as any) || serverMasterConfig.masterDefaultLogLevel || 'master',
            tlsMode: (node.data.tlsMode as any) || serverMasterConfig.masterDefaultTlsMode || 'master', // Server's data channel TLS
            certPath: (node.data.tlsMode === '2' && clientUrlParams.tlsMode === '2') ? node.data.certPath : "", // Server cert if TLS mode 2 for server
            keyPath: (node.data.tlsMode === '2' && clientUrlParams.tlsMode === '2') ? node.data.keyPath : "",   // Server key if TLS mode 2 for server
        };
        const serverFinalUrl = buildUrlFromFormValues(serverUrlParams, serverMasterConfig);
        instancesToCreate.push({
            nodeId: node.id, 
            nodeLabel: `${node.data.label} (出口部分 @ ${serverMasterConfig.name})`,
            masterId: serverMasterConfig.id,
            masterName: serverMasterConfig.name,
            url: serverFinalUrl,
            instanceType: "出口(s)",
        });
      }
    }
    return instancesToCreate;
  }, [nodesInternal, getNodeById, getApiConfigById, setNodesInternal]);

  const handleTriggerSubmitTopology = useCallback(() => {
    setContextMenu(null);
    setNodesInternal(nds => nds.map(n => ({ ...n, data: { ...n.data, submissionStatus: undefined, submissionMessage: undefined } })));

    const instancesToCreate = prepareInstancesForSubmission();

    if (instancesToCreate.length === 0) {
      toast({ title: '无实例可提交', description: '请配置有效的出口(s)/入口(c)节点或跨主控隧道。' });
      return;
    }
    setInstancesForConfirmation(instancesToCreate);
    setIsSubmitConfirmOpen(true);
  }, [prepareInstancesForSubmission, toast, setNodesInternal]);

  const executeActualSubmission = useCallback(async () => {
    setIsSubmitting(true);
    setIsSubmitConfirmOpen(false);

    toast({ title: '开始提交拓扑...', description: `准备创建 ${instancesForConfirmation.length} 个实例。` });

    const submissionPromises = instancesForConfirmation.map(inst => {
      const apiR = getApiRootUrl(inst.masterId);
      const apiT = getToken(inst.masterId);
      if (!apiR || !apiT) {
        setNodesInternal(nds => nds.map(n => n.id === inst.nodeId ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '主控API无效' } } : n));
        return Promise.reject(new Error(`主控 ${inst.masterName} API配置无效。`));
      }
      return createInstanceMutation.mutateAsync({ data: { url: inst.url }, useApiRoot: apiR, useApiToken: apiT, originalNodeId: inst.nodeId });
    });

    try {
        await Promise.allSettled(submissionPromises);
        toast({ title: '拓扑提交处理完毕', description: '检查各节点状态。'});
    } catch (e) {
        console.error("拓扑提交出错:", e);
        toast({ title: '拓扑提交过程中发生意外错误', variant: 'destructive' });
    } finally {
        setIsSubmitting(false);
        setInstancesForConfirmation([]);
    }
  }, [instancesForConfirmation, getApiRootUrl, getToken, toast, createInstanceMutation, setNodesInternal]);


  const handleOpenEditNodeDialog = (node: Node) => {
    setNodeToEdit(node);
    setIsEditNodeDialogOpen(true);
    setContextMenu(null);
  };

  const handleSaveNodeProperties = useCallback((nodeId: string, updatedDataFromDialog: Partial<CustomNodeData>) => {
    let newNodes = [...nodesInternal];
    const nodeIndex = newNodes.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) return;

    const originalNode = newNodes[nodeIndex];
    const mergedData = { ...originalNode.data, ...updatedDataFromDialog };
    newNodes[nodeIndex] = { ...originalNode, data: mergedData };
    
    // Sync S/C/M(client-role) targetAddress with T targetAddress (bidirectional)
    const editedNode = newNodes[nodeIndex];
    if (editedNode.data.targetAddress && editedNode.data.targetAddress.trim() !== "") {
        if (editedNode.data.role === 'S' || editedNode.data.role === 'C' || (editedNode.data.role === 'M' && editedNode.data.masterSubRole === 'client-role')) {
            edgesInternal.forEach(edge => {
                if (edge.source === editedNode.id) {
                    const targetTNodeIndex = newNodes.findIndex(n => n.id === edge.target && n.data.role === 'T');
                    if (targetTNodeIndex !== -1 && editedNode.data.targetAddress !== newNodes[targetTNodeIndex].data.targetAddress) {
                        newNodes[targetTNodeIndex] = { ...newNodes[targetTNodeIndex], data: { ...newNodes[targetTNodeIndex].data, targetAddress: editedNode.data.targetAddress }};
                        toast({ title: `落地端 ${newNodes[targetTNodeIndex].data.label} 已同步目标地址。`});
                    }
                }
            });
        } else if (editedNode.data.role === 'T') {
            edgesInternal.forEach(edge => {
                if (edge.target === editedNode.id) {
                    const sourceNodeIndex = newNodes.findIndex(n => n.id === edge.source && (n.data.role === 'S' || n.data.role === 'C' || (n.data.role === 'M' && n.data.masterSubRole === 'client-role')));
                    if (sourceNodeIndex !== -1 && editedNode.data.targetAddress !== newNodes[sourceNodeIndex].data.targetAddress) {
                        newNodes[sourceNodeIndex] = { ...newNodes[sourceNodeIndex], data: { ...newNodes[sourceNodeIndex].data, targetAddress: editedNode.data.targetAddress }};
                        toast({ title: `${newNodes[sourceNodeIndex].data.label} 已同步落地端目标地址。`});
                    }
                }
            });
        }
    }
    
    // If S-node's tunnelAddress changes, or its M-container's API changes, update connected C-nodes' tunnelAddress
    if (mergedData.role === 'S') {
        const serverNode = newNodes[nodeIndex];
        edgesInternal.forEach(edge => {
            if (edge.target === serverNode.id) { 
                const clientNodeIndex = newNodes.findIndex(n => n.id === edge.source && n.data.role === 'C');
                if (clientNodeIndex !== -1) {
                    const clientNode = newNodes[clientNodeIndex];
                    let masterApiHost: string | null = null;
                    
                    const serverParentMContainerId = serverNode.data.parentNode;
                    const clientParentMContainerId = clientNode.data.parentNode;

                    if (serverParentMContainerId && clientParentMContainerId && serverParentMContainerId === clientParentMContainerId) {
                        const mContainerNode = getNodeById(serverParentMContainerId);
                        const masterConfigForM = mContainerNode ? getApiConfigById(mContainerNode.data.masterId!) : null;
                        if (masterConfigForM?.apiUrl) masterApiHost = extractHostname(masterConfigForM.apiUrl);
                    } else {
                        const serverEffectiveMasterId = serverNode.data.representedMasterId || (serverParentMContainerId ? getNodeById(serverParentMContainerId)?.data.masterId : null);
                        const masterConfigForS = serverEffectiveMasterId ? getApiConfigById(serverEffectiveMasterId) : null;
                        if (masterConfigForS?.apiUrl) masterApiHost = extractHostname(masterConfigForS.apiUrl);
                    }

                    const serverListenHost = extractHostname(serverNode.data.tunnelAddress || "");
                    const serverListenPort = extractPort(serverNode.data.tunnelAddress || "");
                    let clientEffectiveTunnelHost = serverListenHost;

                    if (serverListenHost && isWildcardHostname(serverListenHost) && masterApiHost && masterApiHost.trim() !== "") {
                        clientEffectiveTunnelHost = masterApiHost;
                    }
                    const newClientTunnelAddress = serverListenPort && clientEffectiveTunnelHost && clientEffectiveTunnelHost.trim() !== ""
                        ? `${formatHostForUrl(clientEffectiveTunnelHost)}:${serverListenPort}`
                        : serverNode.data.tunnelAddress || "";
                    
                    newNodes[clientNodeIndex] = { ...clientNode, data: { ...clientNode.data, tunnelAddress: newClientTunnelAddress }};
                }
            }
        });
    } else if (mergedData.role === 'M' && originalNode.data.apiUrl !== mergedData.apiUrl) { 
        const mContainerNode = newNodes[nodeIndex];
        const internalServerNodes = newNodes.filter(n => n.data.parentNode === mContainerNode.id && n.data.role === 'S');
        internalServerNodes.forEach(serverNode => {
            edgesInternal.forEach(edge => {
                if (edge.target === serverNode.id) {
                    const clientNodeIndex = newNodes.findIndex(n => n.id === edge.source && n.data.role === 'C' && n.data.parentNode === mContainerNode.id);
                    if (clientNodeIndex !== -1) {
                        const clientNode = newNodes[clientNodeIndex];
                        const masterApiHost = extractHostname(mContainerNode.data.apiUrl || "");
                        const serverListenHost = extractHostname(serverNode.data.tunnelAddress || "");
                        const serverListenPort = extractPort(serverNode.data.tunnelAddress || "");
                        let clientEffectiveTunnelHost = serverListenHost;
                         if (serverListenHost && isWildcardHostname(serverListenHost) && masterApiHost && masterApiHost.trim() !== "") {
                            clientEffectiveTunnelHost = masterApiHost;
                        }
                        const newClientTunnelAddress = serverListenPort && clientEffectiveTunnelHost && clientEffectiveTunnelHost.trim() !== ""
                            ? `${formatHostForUrl(clientEffectiveTunnelHost)}:${serverListenPort}`
                            : serverNode.data.tunnelAddress || "";
                        newNodes[clientNodeIndex] = { ...clientNode, data: { ...clientNode.data, tunnelAddress: newClientTunnelAddress }};
                    }
                }
            });
        });
    }
    
    setNodesInternal(newNodes);
    toast({ title: `节点 "${mergedData.label || nodeId.substring(0,8)}" 属性已更新`});
    setIsEditNodeDialogOpen(false);
    setNodeToEdit(null);
  }, [nodesInternal, edgesInternal, setNodesInternal, toast, getNodeById, getApiConfigById]);


  const handleDeleteNode = (nodeToDelete: Node) => { deleteElements({ nodes: [nodeToDelete] }); toast({ title: `节点 "${nodeToDelete.data.label || nodeToDelete.id}" 已删除` }); if (selectedNode?.id === nodeToDelete.id) setSelectedNode(null); setContextMenu(null); };
  const handleDeleteEdge = (edgeToDelete: Edge) => { deleteElements({ edges: [edgeToDelete] }); toast({ title: '链路已删除' }); setContextMenu(null); };

  return (
    <div ref={editorContainerRef} className="flex flex-col flex-grow h-full relative">
      <div className="flex flex-row flex-grow h-full overflow-hidden">
        <div className="w-60 flex-shrink-0 flex flex-col border-r bg-muted/30 p-2">
          <div className="flex flex-col h-full bg-background rounded-lg shadow-md border">
            <div className="flex flex-col h-1/2 p-3">
              <h2 className="text-base font-semibold font-title mb-1">主控列表 (M)</h2>
              <p className="text-xs text-muted-foreground font-sans mb-2">拖拽主控到画布。</p>
              <div className="flex-grow overflow-y-auto pr-1"><MastersPalette /></div>
            </div>
            <Separator className="my-0" />
            <div className="flex flex-col h-1/2 p-3">
              <h2 className="text-base font-semibold font-title mb-1">组件 (S, C, T, U)</h2>
              <p className="text-xs text-muted-foreground font-sans mb-2">拖拽组件到画布或主控容器。</p>
              <div className="flex-grow overflow-y-auto pr-1"><ComponentsPalette /></div>
            </div>
            <Separator className="my-0" />
            <div className="flex flex-col flex-grow min-h-0 p-3">
              <h2 className="text-base font-semibold font-title mb-1">节点属性</h2>
              <p className="text-xs text-muted-foreground font-sans mb-2">{selectedNode ? `选中: ${selectedNode.data.label || selectedNode.id}` : '点击节点查看属性。'}</p>
              <div className="flex-grow overflow-y-hidden"><PropertiesDisplayPanel selectedNode={selectedNode} /></div>
            </div>
          </div>
        </div>
        <div className="flex-grow flex flex-col overflow-hidden p-2">
          <div className="flex-grow relative">
            <div className="absolute inset-0">
              <ActualTopologyFlowWithState
                nodes={nodesInternal} edges={edgesInternal} onNodesChange={onNodesChangeInternal} onEdgesChange={onEdgesChangeInternal} onConnect={onConnect}
                onSelectionChange={onSelectionChange} reactFlowWrapperRef={reactFlowWrapperRef} onCenterView={handleCenterViewCallback}
                onClearCanvas={handleClearCanvasCallback} onTriggerSubmitTopology={handleTriggerSubmitTopology} 
                canSubmit={(nodesInternal.length > 0 || edgesInternal.length > 0) && !isSubmitting}
                isSubmitting={isSubmitting}
                onNodeDropOnCanvas={handleNodeDroppedOnCanvas} onNodeContextMenu={onNodeContextMenu} onEdgeContextMenu={onEdgeContextMenu} onPaneClick={onPaneClick}
              />
            </div>
          </div>
        </div>
      </div>
      {contextMenu && (
        <div ref={menuRef} style={{ top: contextMenu.top, left: contextMenu.left }} className="absolute z-[100] bg-popover border border-border rounded-md shadow-xl p-1.5 text-popover-foreground text-xs min-w-[150px]">
          {contextMenu.type === 'node' && (contextMenu.data as Node).data.role !== 'U' && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleOpenEditNodeDialog(contextMenu.data as Node)}>修改属性</Button>
          )}
          {(contextMenu.data as Node).type === 'node' && (contextMenu.data as Node).data.role === 'S' && (contextMenu.data as Node).data.parentNode && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleChangeNodeRole((contextMenu.data as Node).id, 'C')}>更改为入口(c)</Button>
          )}
          {(contextMenu.data as Node).type === 'node' && (contextMenu.data as Node).data.role === 'C' && (contextMenu.data as Node).data.parentNode && !(contextMenu.data as Node).data.isDefaultClient && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleChangeNodeRole((contextMenu.data as Node).id, 'S')}>更改为出口(s)</Button>
          )}
          {contextMenu.type === 'node' && <Separator className="my-1"/>}
          {contextMenu.type === 'node' && (
              <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans text-destructive hover:!text-destructive" onClick={() => handleDeleteNode(contextMenu.data as Node)}>删除角色</Button>
          )}
          {contextMenu.type === 'edge' && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans text-destructive hover:!text-destructive" onClick={() => handleDeleteEdge(contextMenu.data as Edge)}>删除链路</Button>
          )}
        </div>
      )}
       <SubmitTopologyConfirmationDialog
        open={isSubmitConfirmOpen}
        onOpenChange={setIsSubmitConfirmOpen}
        instancesToCreate={instancesForConfirmation}
        onConfirm={executeActualSubmission}
        isSubmitting={isSubmitting}
      />
      <EditTopologyNodeDialog
        open={isEditNodeDialogOpen}
        onOpenChange={setIsEditNodeDialogOpen}
        node={nodeToEdit}
        onSave={handleSaveNodeProperties}
      />
    </div>
  );
}

export default function TopologyPage() {
  return <AppLayout><ReactFlowProvider><TopologyEditorCore /></ReactFlowProvider></AppLayout>;
}

