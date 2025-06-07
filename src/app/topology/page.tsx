
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
  type Viewport,
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
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(0);
  const { toast } = useToast();
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);


  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges]
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

    let position = { x: 0, y: 0 };
    const { width: canvasWidth, height: canvasHeight } = reactFlowInstance.getViewport();

    if (canvasWidth > 0 && canvasHeight > 0 && reactFlowWrapperRef.current) {
        const bounds = reactFlowWrapperRef.current.getBoundingClientRect();
        const screenCenter = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
        position = reactFlowInstance.screenToFlowPosition({ 
            x: screenCenter.x - bounds.left, // relative to canvas pane
            y: screenCenter.y - bounds.top   // relative to canvas pane
        });
         position.x += (Math.random() * 100 - 50);
         position.y += (Math.random() * 100 - 50);
    } else {
        // Fallback if canvas dimensions are not yet available
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

    setNodes((nds) => nds.concat(finalNewNode));
    toast({ title: "节点已添加", description: `已添加节点 "${finalNewNode.data.label || newNodeId}"。` });

  }, [nodeIdCounter, setNodes, toast]);


  const handleAddMasterNodeFromPalette = useCallback((masterConfig: NamedApiConfig, rfInstance: ReturnType<typeof useReactFlow> | null) => {
    const masterNodeData: Omit<Node, 'id' | 'position'> = {
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
        style: { 
            borderColor: 'hsl(var(--primary))',
            borderWidth: 2,
            background: 'hsl(var(--primary)/10)',
            borderRadius: '0.375rem', 
            padding: '8px 12px',
            fontSize: '0.75rem', 
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
    };
    addNodeToCanvas(masterNodeData, rfInstance);
  }, [addNodeToCanvas]);


  const handleClearCanvasCallback = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setNodeIdCounter(0);
    setSelectedNode(null);
    toast({ title: "画布已清空" });
  }, [setNodes, setEdges, setNodeIdCounter, toast]);

  const handleCenterViewCallback = useCallback((instance: ReturnType<typeof useReactFlow> | null) => {
     if (!instance) return;
     if (nodes.length > 0) instance.fitView({duration: 300, padding: 0.2}); else toast({title: "画布为空", description: "无法居中空画布。"});
  }, [nodes, toast]);

  const handleFormatLayoutCallback = useCallback(() => {
    toast({ title: "格式化布局", description: "此功能待实现。" });
  }, [toast]);

  const handleSubmitTopologyCallback = useCallback(() => {
    toast({ title: "提交拓扑", description: "此功能待实现。" });
  }, [toast]);

  // Inner component to safely use useReactFlow() and other hooks needing provider context
  const ActualTopologyFlow = () => {
    const { resolvedTheme } = useTheme();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
      setIsClient(true);
    }, []);

    const miniMapStyle = useMemo(() => ({
      backgroundColor: resolvedTheme === 'dark' ? 'hsl(var(--popover))' : 'hsl(var(--card))', // Theme aware
      border: `1px solid hsl(var(--border))`,
      borderRadius: '0.375rem',
    }), [resolvedTheme]);

    const memoizedControls = useMemo(() => <Controls style={{ bottom: 10, right: 10 }} />, []);
    const memoizedMiniMap = useMemo(() => (
      <MiniMap style={miniMapStyle} nodeStrokeWidth={3} zoomable pannable />
    ), [miniMapStyle]); // Re-memoize if style changes
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
          panOnScroll
          selectionOnDrag
          panOnDrag={[PanOnScrollMode.Free, PanOnScrollMode.Right, PanOnScrollMode.Left]}
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
  
  // Wrapper for toolbar to ensure useReactFlow is called within provider
  const ToolbarWrapper = () => {
    const reactFlowInstance = useReactFlow();
    return (
      <TopologyToolbar
        onAddNode={() => {
            const genericNodeData: Omit<Node, 'id' | 'position'> = {
                type: 'default',
                data: { label: `新节点 ${nodeIdCounter + 1}` },
                sourcePosition: Position.Right,
                targetPosition: Position.Left,
            };
            addNodeToCanvas(genericNodeData, reactFlowInstance);
        }}
        onCenterView={() => handleCenterViewCallback(reactFlowInstance)}
        onFormatLayout={handleFormatLayoutCallback}
        onClearCanvas={handleClearCanvasCallback}
        onSubmitTopology={handleSubmitTopologyCallback}
        canSubmit={nodes.length > 0}
      />
    );
  };

  // Wrapper for palette
  const MastersPaletteWrapper = () => {
      const reactFlowInstance = useReactFlow();
      return <MastersPalette onAddMasterNode={(config) => handleAddMasterNodeFromPalette(config, reactFlowInstance)} />
  }

  return (
    <AppLayout>
      <ReactFlowProvider> {/* Provider now wraps the entire layout */}
        <div className="flex flex-col flex-grow h-full"> {/* Main container for toolbar + content row */}
          {/* Top Toolbar Area */}
          <div className="flex-shrink-0 p-2 border-b bg-background shadow-sm">
            <ToolbarWrapper />
          </div>

          {/* Content Row: Left Sidebar | Right Canvas Area */}
          <div className="flex flex-row flex-grow overflow-hidden"> {/* This will take remaining height */}
            {/* Left Sidebar */}
            <div className="w-72 flex-shrink-0 flex flex-col border-r bg-muted/30 shadow-sm">
              {/* Masters Palette Card */}
              <Card className="flex flex-col h-1/2 m-2 shadow-md rounded-lg">
                <CardHeader className="p-3 border-b">
                  <CardTitle className="text-base font-semibold font-title">主控列表</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground font-sans">点击主控添加到画布。</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow overflow-y-auto p-1">
                  <MastersPaletteWrapper />
                </CardContent>
              </Card>

              <Separator />

              {/* Properties Panel Card */}
              <Card className="flex flex-col flex-grow m-2 shadow-md rounded-lg min-h-0"> {/* min-h-0 helps flex-grow */}
                <CardHeader className="p-3 border-b">
                  <CardTitle className="text-base font-semibold font-title">节点属性</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground font-sans">
                    {selectedNode ? `选中: ${selectedNode.data.label || selectedNode.id}` : '点击节点查看属性。'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow overflow-y-auto p-1"> {/* Ensure this is scrollable */}
                  <PropertiesDisplayPanel selectedNode={selectedNode} />
                </CardContent>
              </Card>
            </div>

            {/* Right Canvas Area */}
            {/* flex-grow allows this area to take up remaining width */}
            {/* relative is for absolute positioning of the canvas itself */}
            {/* pb-5 provides the 20px bottom margin */}
            <div className="flex-grow relative pb-5"> 
              {/* This div will be filled by ReactFlow */}
              <div className="absolute inset-0">
                <ActualTopologyFlow />
              </div>
            </div>
          </div>
        </div>
      </ReactFlowProvider>
    </AppLayout>
  );
}
