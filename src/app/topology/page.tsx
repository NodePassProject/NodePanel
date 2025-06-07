
'use client';

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
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
  type Connection,
  type Edge,
  type Node as ReactFlowNode, // Renamed to avoid conflict with our extended Node
  type OnNodesChange,
  type OnEdgesChange,
  PanOnScrollMode,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTheme } from 'next-themes';

import { AppLayout } from '@/components/layout/AppLayout';
import { TopologyToolbar } from './components/TopologyToolbar';
import { MastersPalette } from './components/MastersPalette';
import { ComponentsPalette, type DraggableNodeType } from './components/ComponentsPalette';
import { PropertiesDisplayPanel } from './components/PropertiesDisplayPanel';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

// Define our extended Node type
export type NodeRole = 'M' | 'S' | 'C' | 'T' | 'U';
export type MasterSubRole = 'client-role' | 'server-role' | 'generic';

export interface CustomNodeData {
  label: string;
  role: NodeRole;
  masterSubRole?: MasterSubRole;
  nodeType?: string; 
  masterId?: string;
  masterName?: string;
  apiUrl?: string;
  defaultLogLevel?: string;
  defaultTlsMode?: string;
  isContainer?: boolean;
  parentNode?: string; // ID of the parent 'M' node
  tunnelAddress?: string;
  targetAddress?: string;
  ipAddress?: string;
  port?: string;
}

export interface Node extends ReactFlowNode<CustomNodeData> {
  width?: number; // Explicitly define width for hit detection
  height?: number; // Explicitly define height for hit detection
}


const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

interface ActualTopologyFlowWithStateProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (params: Connection | Edge) => void;
  onSelectionChange: ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => void;
  reactFlowWrapperRef: React.RefObject<HTMLDivElement>;
  onCenterView: (instance: ReturnType<typeof useReactFlow>) => void;
  onFormatLayout: () => void;
  onClearCanvas: () => void;
  onSubmitTopology: () => void;
  canSubmit: boolean;
  onNodeDropOnCanvas: (
    type: DraggableNodeType | 'master',
    position: { x: number; y: number },
    draggedData?: NamedApiConfig // For masters
  ) => void;
}

const ActualTopologyFlowWithState: React.FC<ActualTopologyFlowWithStateProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
  reactFlowWrapperRef,
  onCenterView,
  onFormatLayout,
  onClearCanvas,
  onSubmitTopology,
  canSubmit,
  onNodeDropOnCanvas,
}) => {
  const { resolvedTheme } = useTheme();
  const [isClient, setIsClient] = useState(false);
  const reactFlowInstance = useReactFlow();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const miniMapStyle = useMemo(() => ({
    backgroundColor: resolvedTheme === 'dark' ? 'hsl(var(--popover))' : 'hsl(var(--card))',
    border: `1px solid hsl(var(--border))`,
    borderRadius: '0.375rem',
  }), [resolvedTheme]);

  const memoizedMiniMap = useMemo(() => (
    isClient ? <MiniMap style={miniMapStyle} nodeStrokeWidth={3} zoomable pannable /> : null
  ), [miniMapStyle, isClient]);
  const memoizedBackground = useMemo(() => <Background variant="dots" gap={16} size={1} />, []);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!reactFlowInstance) return;

    const masterConfigString = event.dataTransfer.getData('application/nodepass-master-config');
    const componentTypeString = event.dataTransfer.getData('application/nodepass-component-type') as DraggableNodeType;

    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    if (masterConfigString) {
      try {
        const config = JSON.parse(masterConfigString) as NamedApiConfig;
        onNodeDropOnCanvas('master', position, config);
      } catch (e) {
        console.error("Failed to parse dragged master config:", e);
      }
    } else if (componentTypeString) {
       onNodeDropOnCanvas(componentTypeString, position);
    }
  };

  return (
    <div
      ref={reactFlowWrapperRef}
      className="h-full w-full bg-background rounded-lg shadow-md border"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        deleteKeyCode={['Backspace', 'Delete']}
        panOnScroll={false}
        zoomOnScroll={true}
        panOnDrag={true} // Ensure panning is enabled
        selectionOnDrag
        className="h-full w-full"
        nodeOrigin={[0.5, 0.5]}
      >
        <Panel position="top-right" className="!m-0 !p-2 bg-transparent">
          <ToolbarWrapperComponent
            onCenterView={onCenterView}
            onFormatLayout={onFormatLayout}
            onClearCanvas={onClearCanvas}
            onSubmitTopology={onSubmitTopology}
            canSubmit={canSubmit}
          />
        </Panel>
        {memoizedMiniMap}
        {memoizedBackground}
      </ReactFlow>
    </div>
  );
};

interface ToolbarWrapperComponentProps {
  onCenterView: (instance: ReturnType<typeof useReactFlow>) => void;
  onFormatLayout: () => void;
  onClearCanvas: () => void;
  onSubmitTopology: () => void;
  canSubmit: boolean;
}

const ToolbarWrapperComponent: React.FC<ToolbarWrapperComponentProps> = ({
  onCenterView,
  onFormatLayout,
  onClearCanvas,
  onSubmitTopology,
  canSubmit,
}) => {
  const reactFlowInstance = useReactFlow();
  return (
    <TopologyToolbar
      onCenterView={() => onCenterView(reactFlowInstance)}
      onFormatLayout={onFormatLayout}
      onClearCanvas={onClearCanvas}
      onSubmitTopology={onSubmitTopology}
      canSubmit={canSubmit}
    />
  );
};


export default function TopologyPage() {
  const [nodesInternal, setNodesInternal, onNodesChangeInternalWrapped] = useNodesState<Node>(initialNodes);
  const [edgesInternal, setEdgesInternal, onEdgesChangeInternalWrapped] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(0);
  const { toast } = useToast();
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);

  const getNodeById = useCallback((id: string): Node | undefined => {
    return nodesInternal.find(n => n.id === id);
  }, [nodesInternal]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodesInternal((nds) => applyNodeChanges(changes, nds)),
    [setNodesInternal]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdgesInternal((eds) => applyEdgeChanges(changes, eds)),
    [setEdgesInternal]
  );

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

      const existingEdge = edgesInternal.find(
        (edge) =>
          (edge.source === params.source && edge.target === params.target) ||
          (edge.source === params.target && edge.target === params.source)
      );
      if (existingEdge) {
        toast({ title: '连接无效', description: '这些节点之间已经存在连接。', variant: 'destructive' });
        return;
      }
      
      const checkForPath = (
        startNodeId: string,
        endNodeId: string,
        currentGraphEdges: Edge[],
        visitedInCurrentPath: Set<string> = new Set()
      ): boolean => {
        if (startNodeId === endNodeId) return true;
        visitedInCurrentPath.add(startNodeId);
        const outgoingEdges = currentGraphEdges.filter((edge) => edge.source === startNodeId);
        for (const edge of outgoingEdges) {
          const neighborNodeId = edge.target;
          if (!visitedInCurrentPath.has(neighborNodeId)) {
            if (checkForPath(neighborNodeId, endNodeId, currentGraphEdges, visitedInCurrentPath)) return true;
          }
        }
        visitedInCurrentPath.delete(startNodeId);
        return false;
      };

      if (params.source && params.target && checkForPath(params.target, params.source, edgesInternal)) {
        toast({ title: '连接无效', description: '此连接将创建一个循环。', variant: 'destructive' });
        return;
      }

      const sourceRole = sourceNode.data.role;
      const targetRole = targetNode.data.role;
      const sourceParentId = sourceNode.data.parentNode;
      const targetParentId = targetNode.data.parentNode;

      if ((sourceRole === 'S' || sourceRole === 'C') && sourceParentId) {
        if (targetRole === 'S' || targetRole === 'C') { 
          if (targetParentId !== sourceParentId) {
            toast({ title: '连接无效', description: `容器内的 ${sourceRole} 节点只能连接到同一主控容器内的 S 或 C 节点。`, variant: 'destructive' });
            return;
          }
        } else if (targetRole === 'T') { 
          if (targetParentId) { 
            toast({ title: '连接无效', description: `容器内的 ${sourceRole} 节点只能连接到外部的 T 节点。此 T 节点位于容器内。`, variant: 'destructive' });
            return;
          }
        } else { 
          toast({ title: '连接无效', description: `容器内的 ${sourceRole} 节点只能连接到同一容器内的 S/C 节点或外部的 T 节点。`, variant: 'destructive' });
          return;
        }
      }
      
      if (sourceRole === 'U' && targetRole !== 'M') {
        toast({ title: '连接无效', description: '用户 (U) 只能连接到主控 (M)。', variant: 'destructive' });
        return;
      }
      if (targetRole === 'U' && sourceRole !== 'M') {
         toast({ title: '连接无效', description: '用户 (U) 只能被主控 (M) 连接。', variant: 'destructive' });
        return;
      }
      
      if (sourceRole === 'M' && targetRole === 'M') {
        const sourceSubRole = sourceNode.data.masterSubRole;
        const targetSubRole = targetNode.data.masterSubRole;

        if (sourceSubRole === 'client-role' && targetSubRole !== 'server-role') {
            toast({ title: '连接无效', description: '客户端角色的主控 (M) 只能连接到服务端角色的主控 (M)。', variant: 'destructive' });
            return;
        }
        if (sourceSubRole === 'server-role') { 
            toast({ title: '连接无效', description: '服务端角色的主控 (M) 不能主动连接其他主控。请从客户端角色的主控发起连接。', variant: 'destructive' });
            return;
        }
      }

      setEdgesInternal((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds
        )
      );
    },
    [edgesInternal, setEdgesInternal, toast, getNodeById]
  );

  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[], edges: Edge[] }) => {
    setSelectedNode(selectedNodesList.length === 1 ? selectedNodesList[0] : null);
  }, []);


 const handleNodeDroppedOnCanvas = useCallback((
    type: DraggableNodeType | 'master',
    position: { x: number; y: number },
    draggedData?: NamedApiConfig
  ) => {
    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    let newNode: Node;
    const mNodeWidth = 220;
    const mNodeHeight = 180;

    if (type === 'master' && draggedData) {
      const masterConfig = draggedData;
      const existingMasterNodes = nodesInternal.filter(n => n.data.role === 'M');
      
      let masterSubRole: MasterSubRole;
      let labelSuffix = ''; // For internal tracking or properties panel, not main label now

      if (existingMasterNodes.length === 0) {
        masterSubRole = 'client-role';
        labelSuffix = ' (客户端角色)';
      } else if (existingMasterNodes.length === 1 && existingMasterNodes[0].data.masterSubRole === 'client-role') {
        masterSubRole = 'server-role';
        labelSuffix = ' (服务端角色)';
      } else {
         masterSubRole = 'generic';
         labelSuffix = ' (通用角色)';
      }
      
      newNode = {
        id: `master-${masterConfig.id}-${newCounter}`,
        type: 'default', 
        position,
        data: {
          label: `主控: ${masterConfig.name || `M-${newCounter}`}`, // Simplified label
          role: 'M',
          masterSubRole: masterSubRole,
          isContainer: true,
          nodeType: 'masterRepresentation',
          masterId: masterConfig.id,
          masterName: masterConfig.name,
          apiUrl: masterConfig.apiUrl,
          defaultLogLevel: masterConfig.masterDefaultLogLevel,
          defaultTlsMode: masterConfig.masterDefaultTlsMode,
        },
        style: { 
          borderColor: 'hsl(var(--border))', 
          borderWidth: 1.5,
          background: 'hsl(var(--muted) / 0.3)', 
          borderRadius: '0.5rem',
          padding: '10px 15px',
          fontSize: '0.8rem',
          width: mNodeWidth, 
          height: mNodeHeight, 
        },
        width: mNodeWidth, // Explicit width on node object
        height: mNodeHeight, // Explicit height on node object
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
      toast({ title: "主控节点已添加", description: `已添加主控 "${masterConfig.name || `M-${newCounter}`}"${labelSuffix} 到画布。` });
    } else {
      const nodeRole = type.toUpperCase() as NodeRole; 
      let labelPrefix = '';
      let nodeStyle: React.CSSProperties = {
        borderWidth: 1.5,
        borderRadius: '0.375rem',
        padding: '6px 10px',
        fontSize: '0.7rem',
      };

      switch(nodeRole) {
        case 'S':
          labelPrefix = '服务端';
          nodeStyle = { ...nodeStyle, borderColor: 'hsl(205 90% 40%)', background: 'hsl(205 90% 92% / 0.8)', color: 'hsl(205 90% 20%)' };
          break;
        case 'C':
          labelPrefix = '客户端';
          nodeStyle = { ...nodeStyle, borderColor: 'hsl(145 70% 35%)', background: 'hsl(145 70% 92% / 0.8)', color: 'hsl(145 70% 15%)' };
          break;
        case 'T':
          labelPrefix = '落地端';
          nodeStyle = { ...nodeStyle, borderColor: 'hsl(35 90% 50%)', background: 'hsl(35 90% 92% / 0.8)', color: 'hsl(35 90% 30%)' };  
          break;
        case 'U':
          labelPrefix = '用户';
          nodeStyle = { ...nodeStyle, borderColor: 'hsl(265 70% 50%)', background: 'hsl(265 70% 92% / 0.8)', color: 'hsl(265 70% 30%)' }; 
          break;
      }

      let parentNodeFound: Node | undefined = undefined;
      if (nodeRole === 'S' || nodeRole === 'C') {
        for (const mNode of nodesInternal) {
          // Ensure mNode.width and mNode.height are defined and used for boundary check
          if (mNode.data.isContainer && mNode.width && mNode.height) {
            const isInsideParent =
              position.x >= mNode.position.x &&
              position.x < mNode.position.x + mNode.width &&
              position.y >= mNode.position.y &&
              position.y < mNode.position.y + mNode.height;

            if (isInsideParent) {
              parentNodeFound = mNode;
              break; 
            }
          }
        }

        if (!parentNodeFound) {
          toast({
            title: "放置无效",
            description: `${labelPrefix} (${nodeRole}) 节点必须放置在主控 (M) 容器内。`,
            variant: "destructive",
          });
          return; // Do not add the node
        }
      }
      
      const finalStyle = parentNodeFound 
        ? { ...nodeStyle, width: 90, height: 45, padding: '4px 6px', fontSize: '0.65rem' } 
        : nodeStyle;

      const finalNodePosition = parentNodeFound
        ? { x: position.x - parentNodeFound.position.x, y: position.y - parentNodeFound.position.y }
        : position;

      newNode = {
        id: `${nodeRole.toLowerCase()}-${newCounter}`,
        type: 'default',
        position: finalNodePosition,
        data: {
          label: `${labelPrefix} ${newCounter}`,
          role: nodeRole,
          parentNode: parentNodeFound?.id,
        },
        style: finalStyle,
        parentNode: parentNodeFound?.id, 
        extent: parentNodeFound ? 'parent' : undefined,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
      toast({ title: `${labelPrefix} 节点已添加`, description: `已添加 ${labelPrefix} (${nodeRole}) 到画布${parentNodeFound ? ` (于主控 ${parentNodeFound.data.label})` : ''}。` });
    }
    setNodesInternal((nds) => nds.concat(newNode));
  }, [nodeIdCounter, setNodesInternal, toast, nodesInternal]);


  const handleClearCanvasCallback = useCallback(() => {
    setNodesInternal([]);
    setEdgesInternal([]);
    setNodeIdCounter(0);
    setSelectedNode(null);
    toast({ title: "画布已清空" });
  }, [setNodesInternal, setEdgesInternal, setNodeIdCounter, toast]);

  const handleCenterViewCallback = useCallback((instance: ReturnType<typeof useReactFlow> | null) => {
    if (!instance) return;
    if (nodesInternal.length > 0) {
      instance.fitView({ duration: 300, padding: 0.2 });
    } else {
      toast({ title: "画布为空", description: "无法居中空画布。" });
    }
  }, [nodesInternal, toast]);

  const handleFormatLayoutCallback = useCallback(() => {
    toast({ title: "格式化布局", description: "此功能待实现。" });
  }, [toast]);

  const handleSubmitTopologyCallback = useCallback(() => {
    toast({ title: "提交拓扑", description: "此功能待实现。" });
  }, [toast]);


  return (
    <AppLayout>
      <ReactFlowProvider>
        <div className="flex flex-col flex-grow h-full">
          <div className="flex flex-row flex-grow h-full overflow-hidden">
            <div className="w-60 flex-shrink-0 flex flex-col border-r bg-muted/30 p-2">
              <div className="flex flex-col h-full bg-background rounded-lg shadow-md border">
                <div className="flex flex-col h-1/2 p-3">
                  <h2 className="text-base font-semibold font-title mb-1">主控列表 (M)</h2>
                  <p className="text-xs text-muted-foreground font-sans mb-2">拖拽主控到画布。</p>
                  <div className="flex-grow overflow-y-auto pr-1">
                     <MastersPalette />
                  </div>
                </div>

                <Separator className="my-0" /> 

                <div className="flex flex-col h-1/2 p-3"> {/* Adjusted height from 1/3 */}
                  <h2 className="text-base font-semibold font-title mb-1">组件 (S, C, T, U)</h2>
                  <p className="text-xs text-muted-foreground font-sans mb-2">拖拽组件到画布或主控容器。</p>
                  <div className="flex-grow overflow-y-auto pr-1">
                    <ComponentsPalette />
                  </div>
                </div>
                
                <Separator className="my-0" /> 

                <div className="flex flex-col flex-grow min-h-0 p-3">
                  <h2 className="text-base font-semibold font-title mb-1">节点属性</h2>
                  <p className="text-xs text-muted-foreground font-sans mb-2">
                    {selectedNode ? `选中: ${selectedNode.data.label || selectedNode.id}` : '点击节点查看属性。'}
                  </p>
                  <div className="flex-grow overflow-y-hidden"> 
                    <PropertiesDisplayPanel selectedNode={selectedNode} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-grow flex flex-col overflow-hidden p-2">
              <div className="flex-grow relative">
                <div className="absolute inset-0">
                  <ActualTopologyFlowWithState
                    nodes={nodesInternal}
                    edges={edgesInternal}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onSelectionChange={onSelectionChange}
                    reactFlowWrapperRef={reactFlowWrapperRef}
                    onCenterView={handleCenterViewCallback}
                    onFormatLayout={handleFormatLayoutCallback}
                    onClearCanvas={handleClearCanvasCallback}
                    onSubmitTopology={handleSubmitTopologyCallback}
                    canSubmit={nodesInternal.length > 0 || edgesInternal.length > 0}
                    onNodeDropOnCanvas={handleNodeDroppedOnCanvas}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </ReactFlowProvider>
    </AppLayout>
  );
}
    
