
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
export interface CustomNodeData {
  label: string;
  role: NodeRole;
  nodeType?: string; // Keep existing if used, e.g., masterRepresentation
  masterId?: string;
  masterName?: string;
  apiUrl?: string;
  defaultLogLevel?: string;
  defaultTlsMode?: string;
  isContainer?: boolean;
  parentNode?: string; // ID of the parent 'M' node
  // Add other role-specific properties as needed
  tunnelAddress?: string;
  targetAddress?: string;
  ipAddress?: string;
  port?: string;
}

export interface Node extends ReactFlowNode<CustomNodeData> {}


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
        panOnDrag={true} // Corrected: should be boolean or [0,1,2]
        selectionOnDrag
        className="h-full w-full"
        nodeOrigin={[0.5, 0.5]}
        // onNodeDragStop can be used to check if a node is dropped onto another for parenting
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
  const [nodesInternal, setNodesInternal, onNodesChangeInternalWrapped] = useNodesState(initialNodes);
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

      // 1. Prevent self-loops
      if (params.source === params.target) {
        toast({ title: '连接无效', description: '节点不能连接到自身。', variant: 'destructive' });
        return;
      }

      // 2. Prevent duplicate/overlapping edges
      const existingEdge = edgesInternal.find(
        (edge) =>
          (edge.source === params.source && edge.target === params.target) ||
          (edge.source === params.target && edge.target === params.source)
      );
      if (existingEdge) {
        toast({ title: '连接无效', description: '这些节点之间已经存在连接。', variant: 'destructive' });
        return;
      }
      
      // 3. Prevent cycles
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

      // --- NEW LINKING RULES based on roles ---
      const sourceRole = sourceNode.data.role;
      const targetRole = targetNode.data.role;
      const sourceParentId = sourceNode.data.parentNode;
      const targetParentId = targetNode.data.parentNode;

      // Rule: M 卡片空间内部 S/C 只能连接到同 M 内部的 S/C 或外部的 T
      if ((sourceRole === 'S' || sourceRole === 'C') && sourceParentId) { // Source is S or C inside an M
        if ((targetRole === 'S' || targetRole === 'C') && targetParentId !== sourceParentId) {
          toast({ title: '连接无效', description: `容器内的 ${sourceRole} 只能连接到同一容器内的 S/C 或外部的 T。`, variant: 'destructive' });
          return;
        }
        if (targetRole !== 'S' && targetRole !== 'C' && targetRole !== 'T') {
           toast({ title: '连接无效', description: `容器内的 ${sourceRole} 只能连接到 S, C, 或外部的 T。`, variant: 'destructive' });
          return;
        }
        if (targetRole === 'T' && targetParentId) { // T must be external
            toast({ title: '连接无效', description: '落地端 (T) 必须在主控容器外部。', variant: 'destructive' });
            return;
        }
      }
      
      // Rule: M 卡片空间内部的 S 可链接外部的 T 节点
      if (sourceRole === 'S' && sourceParentId && targetRole === 'T' && targetParentId) {
        toast({ title: '连接无效', description: '落地端 (T) 必须在主控容器外部才能被内部 S 连接。', variant: 'destructive' });
        return;
      }


      // Rule: 用户（U）只能链接到 M 卡片空间
      if (sourceRole === 'U' && targetRole !== 'M') {
        toast({ title: '连接无效', description: '用户 (U) 只能连接到主控 (M)。', variant: 'destructive' });
        return;
      }
      if (targetRole === 'U' && sourceRole !== 'M') {
         toast({ title: '连接无效', description: '用户 (U) 只能被主控 (M) 连接。', variant: 'destructive' });
        return;
      }
      
      // Placeholder for more rules - e.g. M(C) to M(S)
      if (sourceRole === 'M' && targetRole === 'M') {
        // Add logic based on M roles if M_Client and M_Server distinction exists
        const sourceMRole = sourceNode.data.label?.includes("客户端角色") ? "M_Client" : sourceNode.data.label?.includes("服务端角色") ? "M_Server" : "M_Generic";
        const targetMRole = targetNode.data.label?.includes("客户端角色") ? "M_Client" : targetNode.data.label?.includes("服务端角色") ? "M_Server" : "M_Generic";

        if (sourceMRole === "M_Client" && targetMRole !== "M_Server") {
            toast({ title: '连接无效', description: '客户端角色的主控 (M) 只能连接到服务端角色的主控 (M)。', variant: 'destructive' });
            return;
        }
         if (sourceMRole === "M_Server" && targetMRole !== "M_Client") { // Server M cannot initiate connection
            toast({ title: '连接无效', description: '服务端角色的主控 (M) 不能主动连接其他主控。', variant: 'destructive' });
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
    [edgesInternal, setEdgesInternal, toast, getNodeById, nodesInternal] // added nodesInternal
  );

  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[], edges: Edge[] }) => {
    setSelectedNode(selectedNodesList.length === 1 ? selectedNodesList[0] : null);
  }, []);


 const handleNodeDroppedOnCanvas = useCallback((
    type: DraggableNodeType | 'master',
    position: { x: number; y: number },
    draggedData?: NamedApiConfig // For masters
  ) => {
    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    let newNode: Node;

    if (type === 'master' && draggedData) {
      const masterConfig = draggedData;
      const existingMasterNodes = nodesInternal.filter(n => n.data.role === 'M');
      const masterRoleSuffix = existingMasterNodes.length === 0 ? ' (客户端角色)' : existingMasterNodes.length === 1 ? ' (服务端角色)' : '';
      
      newNode = {
        id: `master-${masterConfig.id}-${newCounter}`,
        type: 'default', // Or a custom type like 'masterContainerNode'
        position,
        data: {
          label: `主控: ${masterConfig.name}${masterRoleSuffix}`,
          role: 'M',
          isContainer: true,
          nodeType: 'masterRepresentation', // Keep if used
          masterId: masterConfig.id,
          masterName: masterConfig.name,
          apiUrl: masterConfig.apiUrl,
          defaultLogLevel: masterConfig.masterDefaultLogLevel,
          defaultTlsMode: masterConfig.masterDefaultTlsMode,
        },
        style: { // Differentiate M nodes
          borderColor: 'hsl(var(--accent))',
          borderWidth: 2,
          background: 'hsl(var(--accent)/10)',
          borderRadius: '0.5rem',
          padding: '10px 15px',
          fontSize: '0.8rem',
          width: 200, // Example container width
          height: 150, // Example container height
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
      toast({ title: "主控节点已添加", description: `已添加主控 "${masterConfig.name}${masterRoleSuffix}" 到画布。` });
    } else {
      // Handle S, C, T, U nodes
      const nodeRole = type.toUpperCase() as NodeRole; // S, C, T, U
      let labelPrefix = '';
      let nodeStyle = {};

      switch(nodeRole) {
        case 'S':
          labelPrefix = '服务端';
          nodeStyle = { borderColor: 'hsl(var(--primary))', background: 'hsl(var(--primary)/10)', borderWidth: 1.5, padding: '6px 10px', fontSize: '0.7rem' };
          break;
        case 'C':
          labelPrefix = '客户端';
          nodeStyle = { borderColor: 'hsl(var(--secondary))', background: 'hsl(var(--secondary)/10)', borderWidth: 1.5, padding: '6px 10px', fontSize: '0.7rem' };
          break;
        case 'T':
          labelPrefix = '落地端';
          nodeStyle = { borderColor: 'hsl(120 60% 30%)', background: 'hsl(120 60% 30% / 0.1)', borderWidth: 1.5, padding: '6px 10px', fontSize: '0.7rem' };
          break;
        case 'U':
          labelPrefix = '用户';
          nodeStyle = { borderColor: 'hsl(270 60% 50%)', background: 'hsl(270 60% 50% / 0.1)', borderWidth: 1.5, padding: '6px 10px', fontSize: '0.7rem' };
          break;
      }

      // Basic check for dropping inside an M node (can be refined with onNodeDragStop)
      const parentNode = nodesInternal.find(
        (n) =>
          n.data.isContainer &&
          position.x > n.position.x &&
          position.x < n.position.x + (n.width || 200) &&
          position.y > n.position.y &&
          position.y < n.position.y + (n.height || 150)
      );

      if ((nodeRole === 'S' || nodeRole === 'C') && !parentNode) {
        toast({ title: "放置无效", description: `${labelPrefix} (${nodeRole}) 节点必须放置在主控 (M) 容器内。`, variant: "destructive"});
        return;
      }
      
      newNode = {
        id: `${nodeRole.toLowerCase()}-${newCounter}`,
        type: 'default', // Use custom types later if needed for smaller icons
        position,
        data: {
          label: `${labelPrefix} ${newCounter}`,
          role: nodeRole,
          parentNode: parentNode?.id,
        },
        style: {
            ...nodeStyle,
            ...(parentNode && { // Smaller style if inside a container
              width: 80,
              height: 40,
              padding: '4px 6px',
              fontSize: '0.6rem',
            })
        },
        parentNode: parentNode?.id,
        extent: parentNode ? 'parent' : undefined,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
      toast({ title: `${labelPrefix} 节点已添加`, description: `已添加 ${labelPrefix} (${nodeRole}) 到画布。` });
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
            {/* Left Sidebar - Unified Panel */}
            <div className="w-60 flex-shrink-0 flex flex-col border-r bg-muted/30 p-2">
              <div className="flex flex-col h-full bg-background rounded-lg shadow-md border">
                {/* Masters Palette Section */}
                <div className="flex flex-col h-1/2 p-3">
                  <h2 className="text-base font-semibold font-title mb-1">主控列表 (M)</h2>
                  <p className="text-xs text-muted-foreground font-sans mb-2">拖拽主控到画布。</p>
                  <div className="flex-grow overflow-y-auto pr-1">
                    <MastersPalette />
                  </div>
                </div>

                <Separator className="my-0" />

                 {/* Components Palette Section */}
                <div className="flex flex-col h-1/2 p-3">
                  <h2 className="text-base font-semibold font-title mb-1">组件 (S, C, T, U)</h2>
                  <p className="text-xs text-muted-foreground font-sans mb-2">拖拽组件到画布或主控容器。</p>
                  <div className="flex-grow overflow-y-auto pr-1">
                    <ComponentsPalette />
                  </div>
                </div>
                
                <Separator className="my-0" /> 

                {/* Node Properties Section */}
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

            {/* Right Canvas Area */}
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

    