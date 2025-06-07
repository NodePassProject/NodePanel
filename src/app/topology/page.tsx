
'use client';

import React, { useCallback, useState, useEffect, useMemo } from 'react';
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
  type Connection,
  type Edge,
  type Node,
  PanOnScrollMode,
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
import { ScrollArea } from '@/components/ui/scroll-area';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

// This component will now contain the ReactFlow instance and related logic
export default function TopologyPage() {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(0);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { toast } = useToast();

  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[], edges: Edge[] }) => {
    setSelectedNode(selectedNodesList.length === 1 ? selectedNodesList[0] : null);
  }, []);

  const handleAddMasterNodeFromPalette = useCallback((masterConfig: NamedApiConfig, reactFlowInstanceRef: ReturnType<typeof useReactFlow> | null) => {
    if (!reactFlowInstanceRef) {
      toast({ title: "错误", description: "ReactFlow 实例未准备好。", variant: "destructive" });
      return;
    }
    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    const newNodeId = `master-node-${masterConfig.id}-${newCounter}`;

    const { x: viewX, y: viewY, zoom } = reactFlowInstanceRef.getViewport();
    const canvasWidth = reactFlowInstanceRef.width / zoom;
    const canvasHeight = reactFlowInstanceRef.height / zoom;

    const positionX = viewX + (canvasWidth > 0 ? (Math.random() * canvasWidth * 0.2) : 50);
    const positionY = viewY + (canvasHeight > 0 ? (Math.random() * canvasHeight * 0.2) : 50);

    const newNode: Node = {
      id: newNodeId,
      type: 'default',
      data: {
        label: `主控: ${masterConfig.name}`,
        nodeType: 'masterRepresentation',
        masterId: masterConfig.id,
        masterName: masterConfig.name,
        apiUrl: masterConfig.apiUrl,
        defaultLogLevel: masterConfig.masterDefaultLogLevel,
        defaultTlsMode: masterConfig.masterDefaultTlsMode,
      },
      position: { x: positionX, y: positionY },
      style: {
        borderColor: 'hsl(var(--primary))',
        borderWidth: 2,
        background: 'hsl(var(--primary)/10)',
        borderRadius: '0.375rem',
        padding: '8px 12px',
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    setNodes((nds) => nds.concat(newNode));
    toast({ title: "主控节点已添加", description: `已将主控 "${masterConfig.name}" 添加到画布。` });
  }, [nodeIdCounter, setNodes, setNodeIdCounter, toast]);

  const handleClearCanvasCallback = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setNodeIdCounter(0);
    setSelectedNode(null);
    toast({ title: "画布已清空" });
  }, [setNodes, setEdges, setNodeIdCounter, toast]);

  const handleCenterViewCallback = useCallback((instance: ReturnType<typeof useReactFlow> | null) => {
     if (!instance) return;
     if (nodes.length > 0) instance.fitView({duration: 300, padding: 0.2}); else toast({title: "画布为空"});
  }, [nodes, toast]);

  const handleFormatLayoutCallback = useCallback(() => {
    toast({ title: "格式化布局", description: "此功能待实现。" });
  }, [toast]);

  const handleSubmitTopologyCallback = useCallback(() => {
    toast({ title: "提交拓扑", description: "此功能待实现。" });
  }, [toast]);

   const ActualTopologyFlowWithState = () => {
    const reactFlowInstance = useReactFlow();
    const { resolvedTheme } = useTheme();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
      setIsClient(true);
    }, []);

    const onConnect = useCallback(
      (params: Connection | Edge) =>
        setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
      [setEdges]
    );

    const addGenericNodeFromToolbar = useCallback(() => {
        const newCounter = nodeIdCounter + 1;
        setNodeIdCounter(newCounter);
        const newNodeId = `node-${newCounter}`;
        const newNodeData = { label: `新节点 ${newCounter}` };

        const { x: viewX, y: viewY, zoom } = reactFlowInstance.getViewport();
        const canvasWidth = reactFlowInstance.width / zoom;
        const canvasHeight = reactFlowInstance.height / zoom;

        const positionX = viewX + (canvasWidth > 0 ? (Math.random() * canvasWidth * 0.3) : 100);
        const positionY = viewY + (canvasHeight > 0 ? (Math.random() * canvasHeight * 0.3) : 100);

        const newNodeToAdd: Node = {
          id: newNodeId,
          type: 'default',
          data: newNodeData,
          position: { x: positionX, y: positionY },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        };
        setNodes((nds) => nds.concat(newNodeToAdd));
        toast({ title: "节点已添加", description: `已添加节点 "${newNodeData.label}"。` });
    }, [nodeIdCounter, setNodes, setNodeIdCounter, reactFlowInstance, toast]);


    const miniMapStyle = useMemo(() => ({
      backgroundColor: resolvedTheme === 'dark' ? 'hsl(var(--popover))' : 'hsl(var(--card))',
      border: `1px solid hsl(var(--border))`,
      borderRadius: '0.375rem',
    }), [resolvedTheme]);

    const memoizedControls = useMemo(() => <Controls style={{ bottom: 10, right: 10 }} />, []);
    const memoizedMiniMap = useMemo(() => <MiniMap style={miniMapStyle} nodeStrokeWidth={3} zoomable pannable />, [miniMapStyle]);
    const memoizedBackground = useMemo(() => <Background variant="dots" gap={16} size={1} />, []);

    return (
      <div className="h-full w-full bg-background rounded-lg shadow-inner border border-border/50">
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
          panOnScroll
          selectionOnDrag
          panOnDrag={[PanOnScrollMode.Free, PanOnScrollMode.Right, PanOnScrollMode.Left]}
          className="h-full w-full"
        >
          {memoizedControls}
          {isClient && memoizedMiniMap}
          {memoizedBackground}
        </ReactFlow>
      </div>
    );
  };

  const ToolbarWrapper = () => {
    const reactFlowInstance = useReactFlow();
    return (
      <TopologyToolbar
        onAddNode={() => {
            const newCounter = nodeIdCounter + 1;
            setNodeIdCounter(newCounter);
            const newNodeId = `node-${newCounter}`;
            const newNodeData = { label: `新节点 ${newCounter}` };

            const { x: viewX, y: viewY, zoom } = reactFlowInstance.getViewport();
            const canvasWidth = reactFlowInstance.width / zoom;
            const canvasHeight = reactFlowInstance.height / zoom;

            const positionX = viewX + (canvasWidth > 0 ? (Math.random() * canvasWidth * 0.3) : 100);
            const positionY = viewY + (canvasHeight > 0 ? (Math.random() * canvasHeight * 0.3) : 100);

            const newNodeToAdd: Node = {
              id: newNodeId,
              type: 'default',
              data: newNodeData,
              position: { x: positionX, y: positionY },
              sourcePosition: Position.Right,
              targetPosition: Position.Left,
            };
            setNodes((nds) => nds.concat(newNodeToAdd));
            toast({ title: "节点已添加", description: `已添加节点 "${newNodeData.label}"。` });
        }}
        onCenterView={() => handleCenterViewCallback(reactFlowInstance)}
        onFormatLayout={handleFormatLayoutCallback}
        onClearCanvas={handleClearCanvasCallback}
        onSubmitTopology={handleSubmitTopologyCallback}
        canSubmit={nodes.length > 0}
      />
    );
  };

  const MastersPaletteWrapper = () => {
      const reactFlowInstance = useReactFlow();
      return <MastersPalette onAddMasterNode={(config) => handleAddMasterNodeFromPalette(config, reactFlowInstance)} />
  }

  return (
    <AppLayout>
      <div className="flex flex-col flex-grow h-full"> {/* Ensure this root div for the page content takes full height */}
        <div className="flex flex-row flex-grow overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-72 flex-shrink-0 flex flex-col border-r bg-muted/30 shadow-sm">
            <Card className="flex flex-col h-1/2 m-2 shadow-md rounded-lg">
              <CardHeader className="p-3 border-b">
                <CardTitle className="text-base font-semibold font-title">主控列表</CardTitle>
                <CardDescription className="text-xs text-muted-foreground font-sans">拖拽主控到画布。</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow overflow-y-auto p-1">
                 <MastersPaletteWrapper />
              </CardContent>
            </Card>

            <Separator />

            <Card className="flex flex-col h-1/2 m-2 shadow-md rounded-lg">
              <CardHeader className="p-3 border-b">
                <CardTitle className="text-base font-semibold font-title">节点属性</CardTitle>
                 <CardDescription className="text-xs text-muted-foreground font-sans">
                  {selectedNode ? `选中: ${selectedNode.data.label || selectedNode.id}` : '点击节点查看属性。'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow overflow-y-auto p-1">
                <PropertiesDisplayPanel selectedNode={selectedNode} />
              </CardContent>
            </Card>
          </div>

          {/* Right Area (Toolbar + Canvas) */}
          <div className="flex-grow flex flex-col overflow-hidden">
            <ReactFlowProvider>
              {/* Top Toolbar Area */}
              <div className="flex-shrink-0 p-2 border-b bg-background shadow-sm">
                <ToolbarWrapper />
              </div>

              {/* Canvas Area with Bottom Margin */}
              <div className="flex-grow relative pb-5">
                <div className="absolute inset-0">
                   <ActualTopologyFlowWithState />
                </div>
              </div>
            </ReactFlowProvider>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
