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

import { Server, DatabaseZap, Cable, User } from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { TopologyToolbar } from './components/TopologyToolbar';
import { MastersPalette } from './components/MastersPalette';
import { ComponentsPalette, type DraggableNodeType } from './components/ComponentsPalette';
import { PropertiesDisplayPanel } from './components/PropertiesDisplayPanel';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

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
  targetAddress?: string;
  ipAddress?: string;
  port?: string;
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

// REQ 1: 定义缩放等级参数
const TOTAL_ZOOM_LEVELS = 10;
const TARGET_ZOOM_LEVEL = 4; // The user wants the 4th level
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 1.0;
const zoomStep = (MAX_ZOOM - MIN_ZOOM) / (TOTAL_ZOOM_LEVELS - 1);
const initialZoom = MIN_ZOOM + (TARGET_ZOOM_LEVEL - 1) * zoomStep; // Calculate the float value for the 4th level

// --- Custom Node Components ---

// REQ 2: 创建专用的 MasterNode 组件以控制连接点
const MasterNode: React.FC<NodeProps<CustomNodeData>> = memo(({ data }) => {
  return (
    <>
      {/* 顶部连接点，用于U->M */}
      <Handle type="target" position={Position.Top} id="m-top" className="!bg-cyan-500 w-2.5 h-2.5" />
      {/* 底部连接点，用于M->T */}
      <Handle type="source" position={Position.Bottom} id="m-bottom" className="!bg-cyan-500 w-2.5 h-2.5" />
      {/* 备用的左右连接点 */}
      <Handle type="target" position={Position.Left} id="m-left" className="w-2 h-2 !bg-slate-400 opacity-50 hover:opacity-100" />
      <Handle type="source" position={Position.Right} id="m-right" className="w-2 h-2 !bg-slate-400 opacity-50 hover:opacity-100" />
      
      {/* 节点内容 */}
      <div className="font-semibold">{data.label}</div>
    </>
  );
});

const CardNode: React.FC<NodeProps<CustomNodeData>> = memo(({ data, selected }) => {
  const IconComponent = data.icon;
  const roleStyle = nodeStyles[data.role.toLowerCase() as keyof typeof nodeStyles];
  
  const baseCardClasses = `flex items-center rounded-lg border-2 shadow-sm transition-all duration-200 ease-in-out`;
  
  const getDynamicStyle = (width: number, height: number) => ({
    borderColor: roleStyle.base.borderColor,
    color: roleStyle.base.color,
    background: selected ? roleStyle.base.background : 'transparent',
    width: `${width}px`,
    height: `${height}px`,
  });

  const renderContent = () => {
    switch (data.role) {
      case 'U': // U-node: Icon only
        return (
          <div 
            className={`${baseCardClasses} justify-center`}
            style={getDynamicStyle(ICON_NODE_SIZE, ICON_NODE_SIZE)}
          >
            {IconComponent && <IconComponent size={20} style={{ color: selected ? roleStyle.base.color : roleStyle.base.borderColor }} />}
          </div>
        );

      case 'S':
      case 'C':
      case 'T':
      default:
        const displayText = (data.role === 'S' || data.role === 'C') && data.representedMasterName 
          ? data.representedMasterName 
          : data.label;
          
        return (
          <div 
            className={`${baseCardClasses} p-1.5`}
            style={getDynamicStyle(CARD_NODE_WIDTH, CARD_NODE_HEIGHT)}
          >
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
        );
    }
  };

  return (
    <>
      {renderContent()}
      {/* 保持所有小卡片的连接点为左右，以便在M容器内或外部连接时提供一致性 */}
      <Handle type="target" position={Position.Left} className="!bg-slate-400 w-2 h-2" />
      <Handle type="source" position={Position.Right} className="!bg-slate-400 w-2 h-2" />
    </>
  );
});


const nodeTypes = {
  cardNode: CardNode,
  masterNode: MasterNode, // REQ 2: 注册新的 MasterNode 组件
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
            padding: '16px', // 增加内边距给Handle留出空间
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
  onSubmitTopology: () => void;
  canSubmit: boolean;
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
  nodes, edges, onNodesChange, onEdgesChange, onConnect, onSelectionChange, reactFlowWrapperRef, onCenterView, onClearCanvas, onSubmitTopology, canSubmit, onNodeDropOnCanvas, onNodeContextMenu, onEdgeContextMenu, onPaneClick,
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
        // REQ 1: 使用计算出的缩放等级
        defaultViewport={{ x: 0, y: 0, zoom: initialZoom }}
        nodesDraggable={true} nodesConnectable={true}
        elementsSelectable={true} deleteKeyCode={['Backspace', 'Delete']} panOnScroll={false} zoomOnScroll={true} panOnDrag={true} selectionOnDrag
        className="h-full w-full" nodeOrigin={[0, 0]} nodeTypes={nodeTypes}
      >
        <Panel position="top-right" className="!m-0 !p-2 bg-transparent">
          <ToolbarWrapperComponent {...{ onCenterView, onClearCanvas, onSubmitTopology, canSubmit }} />
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
}

const ToolbarWrapperComponent: React.FC<ToolbarWrapperComponentProps> = ({ onCenterView, onClearCanvas, onSubmitTopology, canSubmit }) => {
  const reactFlowInstance = useReactFlow();
  return <TopologyToolbar onCenterView={() => onCenterView(reactFlowInstance)} {...{ onClearCanvas, onSubmitTopology, canSubmit }} />;
};


function TopologyEditorCore() {
  const [nodesInternal, setNodesInternal, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edgesInternal, setEdgesInternal, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(0);
  const { toast } = useToast();
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);
  // MODIFIED: 从 useReactFlow hook 中获取 fitView 函数
  const { deleteElements, fitView } = useReactFlow();
  const [contextMenu, setContextMenu] = useState<TopologyContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  
  const getNodeById = useCallback((id: string): Node | undefined => nodesInternal.find((n) => n.id === id), [nodesInternal]);
  
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

      // U node connection rules
      if (targetNode.data.role === 'U') {
        toast({ title: '连接无效', description: '用户 (U) 节点不能被其他节点链接。', variant: 'destructive' });
        return;
      }
      if (sourceNode.data.role === 'U' && targetNode.data.role !== 'M') {
        toast({ title: '连接无效', description: '用户 (U) 节点只能链接到主控 (M) 节点。', variant: 'destructive' });
        return;
      }

      // T node connection rules
      if (sourceNode.data.role === 'T') {
        toast({ title: '连接无效', description: '落地端 (T) 节点不能作为连接的起点。', variant: 'destructive' });
        return;
      }
      if (targetNode.data.role === 'T') {
        const sourceIsMaster = sourceNode.data.role === 'M';
        const sourceIsInMaster = !!sourceNode.data.parentNode;
        if (!sourceIsMaster && !sourceIsInMaster) {
            toast({ title: '连接无效', description: '落地端 (T) 节点只能被主控 (M) 或其内部节点链接。', variant: 'destructive' });
            return;
        }
      }
      
      const sourceParentId = sourceNode.data.parentNode;
      const targetParentId = targetNode.data.parentNode;
      
      const isInternalConnection = sourceParentId && targetParentId && sourceParentId === targetParentId;
      
      if (isInternalConnection && !(sourceNode.data.role === 'C' && targetNode.data.role === 'S')) {
         toast({ title: '连接无效', description: '在主控容器内，只允许从 客户端(C) 连接到 服务端(S)。', variant: 'destructive' });
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
    },
    [edgesInternal, setEdgesInternal, toast, getNodeById]
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
      // NEW: 用于存储需要聚焦的节点ID
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
                      label: `服务端: ${draggedData.name}`, role: 'S', icon: Server, parentNode: parentMContainer.id, 
                      representedMasterId: draggedData.id, representedMasterName: draggedData.name,
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
              toast({ title: "服务端节点已添加" });
          } else {
              const mId = `master-${draggedData.id.substring(0, 8)}-${++currentCounter}`;
              const uId = `user-for-${mId}`;
              const cId = `default-client-for-${mId}`;
              const tId = `default-tunnel-for-${mId}`;

              newNodes.push({
                  id: mId, type: 'masterNode', position,
                  data: { label: `主控: ${draggedData.name || '未命名'}`, role: 'M', isContainer: true, masterId: draggedData.id, masterName: draggedData.name },
                  style: { ...nodeStyles.m.base, width: mNodeWidth, height: mNodeHeight },
                  width: mNodeWidth, height: mNodeHeight,
              });
              newNodes.push({
                  id: cId, type: 'cardNode', parentNode: mId, extent: 'parent',
                  position: { x: (mNodeWidth / 2) - (CARD_NODE_WIDTH / 2), y: 50 }, 
                  data: { label: 'Local (C)', role: 'C', icon: DatabaseZap, parentNode: mId, isDefaultClient: true },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              });
              
              newNodes.push({
                  id: uId, type: 'cardNode',
                  position: { 
                      x: position.x + (mNodeWidth / 2) - (ICON_NODE_SIZE / 2), 
                      y: position.y - ICON_NODE_SIZE - 60 
                  },
                  data: { label: '用户', role: 'U', icon: User },
                  width: ICON_NODE_SIZE, height: ICON_NODE_SIZE,
              });
              
              newNodes.push({
                  id: tId, type: 'cardNode',
                  position: { 
                      x: position.x + (mNodeWidth / 2) - (CARD_NODE_WIDTH / 2), 
                      y: position.y + mNodeHeight + 60
                  },
                  data: { label: '落地端', role: 'T', icon: Cable },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              });

              newEdges.push({
                  id: `edge-${uId}-${mId}`, source: uId, target: mId, type: 'smoothstep', 
                  targetHandle: 'm-top',
                  markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
              });
              newEdges.push({
                  id: `edge-${mId}-${tId}`, source: mId, target: tId, type: 'smoothstep',
                  sourceHandle: 'm-bottom',
                  markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
              });
              toast({ title: "主控容器已创建" });
              
              // NEW: 记录下新创建的M卡片组的ID，以便后续聚焦
              // 我们选择最外围的节点(U, T)和核心的M节点来定义视图的边界框
              nodesToFit = [{ id: uId }, { id: mId }, { id: tId }];
          }
      } else if (type !== 'master') {
          const nodeRole = type.toUpperCase() as NodeRole;
          const { labelPrefix, icon, width, height } = {
              'S': { labelPrefix: '服务端', icon: Server, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
              'C': { labelPrefix: '客户端', icon: DatabaseZap, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
              'T': { labelPrefix: '落地端', icon: Cable, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
              'U': { labelPrefix: '用户', icon: User, width: ICON_NODE_SIZE, height: ICON_NODE_SIZE },
          }[nodeRole]!;

          if ((nodeRole === 'S' || nodeRole === 'C') && !parentMContainer) {
              toast({ title: "操作无效", description: `请将 ${labelPrefix} (${nodeRole}) 拖拽到主控 (M) 容器内。`, variant: "destructive" });
              return;
          }

          const newNodeId = `${nodeRole.toLowerCase()}-${++currentCounter}`;
          const newNode: Node = {
              id: newNodeId, type: 'cardNode', position, data: { label: labelPrefix, role: nodeRole, icon }, width, height
          };

          if (parentMContainer) {
              newNode.parentNode = parentMContainer.id;
              newNode.extent = 'parent';
              newNode.position = { x: position.x - parentMContainer.position.x - (width / 2), y: position.y - parentMContainer.position.y - (height / 2) };
              if (nodeRole === 'S') {
                  const defaultClient = nodesInternal.find(n => n.data.parentNode === parentMContainer.id && n.data.isDefaultClient);
                  if (defaultClient) {
                      newEdges.push({
                          id: `edge-${defaultClient.id}-${newNodeId}`, source: defaultClient.id, target: newNodeId, 
                          type: 'step', markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
                      });
                  }
              }
          }
          newNodes.push(newNode);
          toast({ title: `${labelPrefix} 节点已添加` });
      } else { return; }

      setNodesInternal(nds => nds.concat(newNodes));
      if (newEdges.length > 0) setEdgesInternal(eds => eds.concat(newEdges));
      setNodeIdCounter(currentCounter + newNodes.length);

      // NEW: 如果创建了新的M卡片组，则调用 fitView 进行聚焦
      if (nodesToFit) {
        // 使用 setTimeout 确保 fitView 在节点被渲染到 DOM 后执行
        setTimeout(() => {
          fitView({
            nodes: nodesToFit,
            duration: 400, // 平滑的动画效果
            // padding: 0.2 表示在视图边界和节点之间留出20%的边距。
            // 视口(100%) - 左边距(20%) - 右边距(20%) = 内容区(60%)
            // 这就实现了 "放大到画布的60%" 的效果。
            padding: 0.2,
          });
        }, 50); // 50ms 的延迟足以等待下一次渲染
      }
  // MODIFIED: 将 fitView 添加到 useCallback 的依赖项数组中
  }, [nodeIdCounter, nodesInternal, toast, setNodesInternal, setEdgesInternal, fitView]);

    const handleChangeNodeRole = useCallback((nodeId: string, newRole: 'S' | 'C') => {
        setNodesInternal(nds => nds.map(node => {
            if (node.id === nodeId) {
                return { ...node, data: { ...node.data, role: newRole, icon: newRole === 'S' ? Server : DatabaseZap, label: newRole === 'S' ? '服务端' : '客户端' }};
            }
            return node;
        }));
        toast({ title: "角色已更改" });
        setContextMenu(null);
    }, [setNodesInternal, toast]);

  const handleClearCanvasCallback = useCallback(() => {
    setNodesInternal([]); setEdgesInternal([]); setNodeIdCounter(0); setSelectedNode(null); setContextMenu(null);
    toast({ title: '画布已清空' });
  }, [setNodesInternal, setEdgesInternal, toast]);

  const handleCenterViewCallback = useCallback((instance: ReturnType<typeof useReactFlow> | null) => {
      if (!instance) return;
      setContextMenu(null);
      instance.fitView({ duration: 300, padding: 0.2 });
  }, []);
  
  const handleSubmitTopologyCallback = useCallback(() => { setContextMenu(null); toast({ title: '提交拓扑', description: '此功能待实现。' }); }, [toast]);
  const handleModifyNodeProperties = (node: Node) => { toast({ title: `修改 ${node.data.label || node.id} 属性 (待实现)` }); setContextMenu(null); };
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
                nodes={nodesInternal} edges={edgesInternal} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
                onSelectionChange={onSelectionChange} reactFlowWrapperRef={reactFlowWrapperRef} onCenterView={handleCenterViewCallback}
                onClearCanvas={handleClearCanvasCallback} onSubmitTopology={handleSubmitTopologyCallback} canSubmit={nodesInternal.length > 0 || edgesInternal.length > 0}
                onNodeDropOnCanvas={handleNodeDroppedOnCanvas} onNodeContextMenu={onNodeContextMenu} onEdgeContextMenu={onEdgeContextMenu} onPaneClick={onPaneClick}
              />
            </div>
          </div>
        </div>
      </div>
      {contextMenu && (
        <div ref={menuRef} style={{ top: contextMenu.top, left: contextMenu.left }} className="absolute z-[100] bg-popover border border-border rounded-md shadow-xl p-1.5 text-popover-foreground text-xs min-w-[150px]">
          {contextMenu.type === 'node' && (
            <>
              <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleModifyNodeProperties(contextMenu.data as Node)}>修改属性</Button>
              {(contextMenu.data as Node).data.role === 'S' && (contextMenu.data as Node).data.parentNode && (
                <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleChangeNodeRole((contextMenu.data as Node).id, 'C')}>更改为客户端 (C)</Button>
              )}
              {(contextMenu.data as Node).data.role === 'C' && (contextMenu.data as Node).data.parentNode && !(contextMenu.data as Node).data.isDefaultClient && (
                <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleChangeNodeRole((contextMenu.data as Node).id, 'S')}>更改为服务端 (S)</Button>
              )}
              <Separator className="my-1"/>
              <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans text-destructive hover:text-destructive" onClick={() => handleDeleteNode(contextMenu.data as Node)}>删除角色</Button>
            </>
          )}
          {contextMenu.type === 'edge' && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans text-destructive hover:text-destructive" onClick={() => handleDeleteEdge(contextMenu.data as Edge)}>删除链路</Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function TopologyPage() {
  return <AppLayout><ReactFlowProvider><TopologyEditorCore /></ReactFlowProvider></AppLayout>;
}