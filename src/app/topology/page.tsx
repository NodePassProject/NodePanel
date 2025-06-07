
'use client';

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Controls,
  Background,
  MiniMap,
  Position,
  MarkerType,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type Edge,
  type Node,
  type OnNodesChange,
  type OnEdgesChange,
  PanOnScrollMode, // Keep if panOnDrag uses it
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTheme } from 'next-themes';

import { AppLayout } from '@/components/layout/AppLayout';
import { TopologyToolbar } from './components/TopologyToolbar';
import { MastersPalette } from './components/MastersPalette';
import { PropertiesDisplayPanel } from './components/PropertiesDisplayPanel';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

// Define helper/wrapper components at the top level
interface ActualTopologyFlowWithStateProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (params: Connection | Edge) => void;
  onSelectionChange: ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => void;
  reactFlowWrapperRef: React.RefObject<HTMLDivElement>;
}

const ActualTopologyFlowWithState: React.FC<ActualTopologyFlowWithStateProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
  reactFlowWrapperRef,
}) => {
  const { resolvedTheme } = useTheme();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const miniMapStyle = useMemo(() => ({
    backgroundColor: resolvedTheme === 'dark' ? 'hsl(var(--popover))' : 'hsl(var(--card))',
    border: `1px solid hsl(var(--border))`,
    borderRadius: '0.375rem', // equivalent to rounded-md
  }), [resolvedTheme]);

  const memoizedControls = useMemo(() => <Controls style={{ bottom: 10, right: 10 }} />, []);
  const memoizedMiniMap = useMemo(() => (
    <MiniMap style={miniMapStyle} nodeStrokeWidth={3} zoomable pannable />
  ), [miniMapStyle]);
  const memoizedBackground = useMemo(() => <Background variant="dots" gap={16} size={1} />, []);

  return (
    <div ref={reactFlowWrapperRef} className="h-full w-full bg-background rounded-lg shadow-inner border border-border/50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        fitView
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        deleteKeyCode={['Backspace', 'Delete']}
        panOnScroll={false} // Changed from true to false
        zoomOnScroll={true}  // Explicitly true
        selectionOnDrag
        panOnDrag={[PanOnScrollMode.Free, PanOnScrollMode.Right, PanOnScrollMode.Left]} // Kept as is
        className="h-full w-full"
        nodeOrigin={[0.5, 0.5]}
      >
        {memoizedControls}
        {isClient && memoizedMiniMap}
        {memoizedBackground}
      </ReactFlow>
    </div>
  );
};

interface ToolbarWrapperComponentProps {
  onAddGenericNode: (instance: ReturnType<typeof useReactFlow>) => void;
  onCenterView: (instance: ReturnType<typeof useReactFlow>) => void;
  onFormatLayout: () => void;
  onClearCanvas: () => void;
  onSubmitTopology: () => void;
  canSubmit: boolean;
}

const ToolbarWrapperComponent: React.FC<ToolbarWrapperComponentProps> = ({
  onAddGenericNode,
  onCenterView,
  onFormatLayout,
  onClearCanvas,
  onSubmitTopology,
  canSubmit,
}) => {
  const reactFlowInstance = useReactFlow();
  return (
    <TopologyToolbar
      onAddNode={() => onAddGenericNode(reactFlowInstance)}
      onCenterView={() => onCenterView(reactFlowInstance)}
      onFormatLayout={onFormatLayout}
      onClearCanvas={onClearCanvas}
      onSubmitTopology={onSubmitTopology}
      canSubmit={canSubmit}
    />
  );
};

interface MastersPaletteWrapperComponentProps {
  onAddMasterNodeFromPalette: (config: NamedApiConfig, instance: ReturnType<typeof useReactFlow>) => void;
}

const MastersPaletteWrapperComponent: React.FC<MastersPaletteWrapperComponentProps> = ({
  onAddMasterNodeFromPalette,
}) => {
  const reactFlowInstance = useReactFlow();
  return <MastersPalette onAddMasterNode={(config) => onAddMasterNodeFromPalette(config, reactFlowInstance)} />;
};


export default function TopologyPage() {
  const [nodes, setNodesInternal, onNodesChangeInternalWrapped] = useNodesState(initialNodes);
  const [edges, setEdgesInternal, onEdgesChangeInternalWrapped] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(0);
  const { toast } = useToast();
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodesInternal((nds) => applyNodeChanges(changes, nds)),
    [setNodesInternal]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdgesInternal((eds) => applyEdgeChanges(changes, eds)),
    [setEdgesInternal]
  );

  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdgesInternal((eds) => addEdge({ ...params, animated: true, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdgesInternal]
  );

  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[], edges: Edge[] }) => {
    setSelectedNode(selectedNodesList.length === 1 ? selectedNodesList[0] : null);
  }, []);

  const addNodeToCanvas = useCallback((newNodeData: Omit<Node, 'id' | 'position'>, reactFlowInstance: ReturnType<typeof useReactFlow> | null) => {
    if (!reactFlowInstance) {
      toast({ title: "错误", description: "ReactFlow 实例未准备好。", variant: "destructive" });
      return;
    }

    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    const newNodeId = `${newNodeData.type || 'node'}-${newCounter}`;

    let position = { x: 100, y: 100 }; 

    if (reactFlowWrapperRef.current) {
      const bounds = reactFlowWrapperRef.current.getBoundingClientRect();
      // Position in the center of the visible canvas part, relative to the flow pane
      const screenCenter = { x: bounds.width / 2, y: bounds.height / 2 };
      position = reactFlowInstance.screenToFlowPosition(screenCenter);
      position.x += (Math.random() * 100 - 50);
      position.y += (Math.random() * 100 - 50);
    } else {
      // Fallback using viewport center if wrapperRef is not available
      const currentViewport = reactFlowInstance.getViewport();
      position = {
          x: -currentViewport.x / currentViewport.zoom + 100 + (Math.random() * 100 - 50),
          y: -currentViewport.y / currentViewport.zoom + 100 + (Math.random() * 100 - 50),
      };
    }
    
    const finalNewNode: Node = {
      id: newNodeId,
      position,
      ...newNodeData,
    };

    setNodesInternal((nds) => nds.concat(finalNewNode));
    toast({ title: "节点已添加", description: `已添加节点 "${finalNewNode.data.label || newNodeId}"。` });
  }, [nodeIdCounter, setNodesInternal, toast]);

  const handleAddGenericNode = useCallback((instance: ReturnType<typeof useReactFlow>) => {
    const genericNodeData: Omit<Node, 'id' | 'position'> = {
      type: 'default',
      data: { label: `新节点 ${nodeIdCounter + 1}` },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    addNodeToCanvas(genericNodeData, instance);
  }, [addNodeToCanvas, nodeIdCounter]);

  const handleAddMasterNodeFromPalette = useCallback((masterConfig: NamedApiConfig, rfInstance: ReturnType<typeof useReactFlow>) => {
    const masterNodeData: Omit<Node, 'id' | 'position'> = {
      type: 'default', // Or a custom 'masterNode' type if defined
      data: {
        label: `主控: ${masterConfig.name}`,
        nodeType: 'masterRepresentation', // Custom property
        masterId: masterConfig.id,
        masterName: masterConfig.name,
        apiUrl: masterConfig.apiUrl,
        defaultLogLevel: masterConfig.masterDefaultLogLevel,
        defaultTlsMode: masterConfig.masterDefaultTlsMode,
      },
      style: { // Example styling for master nodes
        borderColor: 'hsl(var(--primary))',
        borderWidth: 2,
        background: 'hsl(var(--primary)/10)',
        borderRadius: '0.375rem',
        padding: '8px 12px',
        fontSize: '0.75rem', // 12px
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    addNodeToCanvas(masterNodeData, rfInstance);
  }, [addNodeToCanvas]);


  const handleClearCanvasCallback = useCallback(() => {
    setNodesInternal([]);
    setEdgesInternal([]);
    setNodeIdCounter(0);
    setSelectedNode(null);
    toast({ title: "画布已清空" });
  }, [setNodesInternal, setEdgesInternal, setNodeIdCounter, toast]);

  const handleCenterViewCallback = useCallback((instance: ReturnType<typeof useReactFlow> | null) => {
    if (!instance) return;
    if (nodes.length > 0) instance.fitView({ duration: 300, padding: 0.2 });
    else toast({ title: "画布为空", description: "无法居中空画布。" });
  }, [nodes, toast]);

  const handleFormatLayoutCallback = useCallback(() => {
    toast({ title: "格式化布局", description: "此功能待实现。" });
  }, [toast]);

  const handleSubmitTopologyCallback = useCallback(() => {
    toast({ title: "提交拓扑", description: "此功能待实现。" });
  }, [toast]);

  return (
    <AppLayout>
      <ReactFlowProvider> {/* Provider wraps the entire layout using ReactFlow */}
        <div className="flex flex-row flex-grow h-full overflow-hidden"> {/* Main horizontal layout */}
          {/* Left Sidebar */}
          <div className="w-72 flex-shrink-0 flex flex-col border-r bg-muted/30 shadow-sm">
            <Card className="flex flex-col h-1/2 m-2 shadow-md rounded-lg">
              <CardHeader className="p-3 border-b">
                <CardTitle className="text-base font-semibold font-title">主控列表</CardTitle>
                <CardDescription className="text-xs text-muted-foreground font-sans">点击主控添加到画布。</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow overflow-y-auto p-1"> {/* p-1 for scrollbar spacing */}
                <MastersPaletteWrapperComponent onAddMasterNodeFromPalette={handleAddMasterNodeFromPalette} />
              </CardContent>
            </Card>
            <Separator />
            <Card className="flex flex-col flex-grow m-2 shadow-md rounded-lg min-h-0"> {/* min-h-0 crucial for flex-grow in flex-col */}
              <CardHeader className="p-3 border-b">
                <CardTitle className="text-base font-semibold font-title">节点属性</CardTitle>
                 <CardDescription className="text-xs text-muted-foreground font-sans">
                  {selectedNode ? `选中: ${selectedNode.data.label || selectedNode.id}` : '点击节点查看属性。'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow overflow-y-auto p-1"> {/* p-1 for scrollbar spacing */}
                <PropertiesDisplayPanel selectedNode={selectedNode} />
              </CardContent>
            </Card>
          </div>

          {/* Right Area (Toolbar + Canvas) */}
          <div className="flex-grow flex flex-col overflow-hidden">
            {/* Top Toolbar Area */}
            <div className="flex-shrink-0 p-2 border-b bg-background shadow-sm">
              <ToolbarWrapperComponent
                onAddGenericNode={handleAddGenericNode}
                onCenterView={handleCenterViewCallback}
                onFormatLayout={handleFormatLayoutCallback}
                onClearCanvas={handleClearCanvasCallback}
                onSubmitTopology={handleSubmitTopologyCallback}
                canSubmit={nodes.length > 0}
              />
            </div>
            {/* Canvas Area */}
            <div className="flex-grow relative pb-5"> {/* pb-5 for 20px bottom margin */}
              <div className="absolute inset-0">
                <ActualTopologyFlowWithState
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onSelectionChange={onSelectionChange}
                  reactFlowWrapperRef={reactFlowWrapperRef}
                />
              </div>
            </div>
          </div>
        </div>
      </ReactFlowProvider>
    </AppLayout>
  );
}
