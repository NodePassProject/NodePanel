
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

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

// This component will now contain the ReactFlow instance and related logic
function ActualTopologyFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [nodeIdCounter, setNodeIdCounter] = useState(0);
  const { toast } = useToast();
  const reactFlowInstance = useReactFlow();
  
  // This state will be lifted to TopologyPage and passed down
  // const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  // For now, to make PropertiesDisplayPanel work, we pass it down from TopologyPage

  const { resolvedTheme } = useTheme();

  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges]
  );

  const handleAddGenericNode = useCallback(() => {
    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    const newNodeId = `node-${newCounter}`;
    const newNodeData = { label: `新节点 ${newCounter}` };
    
    const { x: viewX, y: viewY, zoom } = reactFlowInstance.getViewport();
    const canvasWidth = reactFlowInstance.width / zoom;
    const canvasHeight = reactFlowInstance.height / zoom;

    const positionX = viewX + (canvasWidth > 0 ? (Math.random() * canvasWidth * 0.3) : 100);
    const positionY = viewY + (canvasHeight > 0 ? (Math.random() * canvasHeight * 0.3) : 100);
    
    const newNode: Node = {
      id: newNodeId,
      type: 'default',
      data: newNodeData,
      position: { x: positionX, y: positionY },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    setNodes((nds) => nds.concat(newNode));
    toast({ title: "节点已添加", description: `已添加节点 "${newNodeData.label}"。` });
  }, [nodeIdCounter, setNodes, setNodeIdCounter, reactFlowInstance, toast]);

  // This function needs to be lifted or passed to MastersPalette
  // const handleAddMasterNodeFromPalette = useCallback((masterConfig: NamedApiConfig) => {
  //   // ... implementation ...
  // }, [nodeIdCounter, setNodes, setNodeIdCounter, toast, reactFlowInstance]);


  const miniMapStyle = useMemo(() => ({
    backgroundColor: resolvedTheme === 'dark' ? 'hsl(var(--popover))' : 'hsl(var(--card))',
    border: `1px solid hsl(var(--border))`,
    borderRadius: '0.375rem', // Corresponds to rounded-md
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
        // onSelectionChange will be handled by TopologyPage
        // onSelectionChange={onSelectionChangeInternal}
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
        {memoizedMiniMap}
        {memoizedBackground}
        {/* Toolbar is now outside this component, in the page layout */}
      </ReactFlow>
    </div>
  );
}


export default function TopologyPage() {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(0); // Lifted state
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes); // Lifted state
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges); // Lifted state
  const { toast } = useToast();

  // Need access to reactFlowInstance for toolbar actions.
  // We can achieve this by wrapping parts that need it with ReactFlowProvider,
  // or by passing callbacks from a central component.
  // For simplicity, the toolbar will get callbacks for now.
  // Better: Toolbar is also inside the main ReactFlowProvider.

  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[], edges: Edge[] }) => {
    setSelectedNode(selectedNodesList.length === 1 ? selectedNodesList[0] : null);
  }, []);

  // Lifted handleAddMasterNodeFromPalette
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

  // Placeholder for clear canvas logic - will be part of the component that has access to setNodes/setEdges
  const handleClearCanvasCallback = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setNodeIdCounter(0);
    setSelectedNode(null);
    toast({ title: "画布已清空" });
  }, [setNodes, setEdges, setNodeIdCounter, toast]);

  // Placeholder for other toolbar actions
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
  
  // This is the actual ActualTopologyFlow component but with lifted states
   const ActualTopologyFlowWithState = () => {
    const reactFlowInstance = useReactFlow();
    const { resolvedTheme } = useTheme();

    const onConnect = useCallback(
      (params: Connection | Edge) =>
        setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
      [setEdges]
    );

    // addGenericNode will be called from toolbar, needs reactFlowInstance
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

    // Pass addGenericNode to toolbar via context or props if toolbar is a child
    // For now, toolbar is separate and gets callbacks.

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
          {memoizedMiniMap}
          {memoizedBackground}
        </ReactFlow>
      </div>
    );
  };


  // Toolbar needs access to reactFlowInstance for some actions
  // We pass callbacks that can internally use it when it's available.
  const TopologyToolbarWrapper = () => {
    const reactFlowInstance = useReactFlow();
    return (
      <TopologyToolbar
        onAddNode={() => { // This needs to be the addGenericNode logic from ActualTopologyFlow
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
      {/* 
        The main layout div. It should take full height available from AppLayout's main area.
        AppLayout's <main> is already flex flex-col flex-grow.
      */}
      <div className="flex flex-row h-full flex-grow overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r bg-muted/30 shadow-sm">
          {/* Masters Palette Section */}
          <div className="p-3 border-b">
            <h3 className="text-base font-semibold font-title">主控列表</h3>
            <p className="text-xs text-muted-foreground font-sans">拖拽主控到画布。</p>
          </div>
          <div className="flex-grow overflow-y-auto min-h-[200px] p-1">
            {/* MastersPalette needs ReactFlowProvider if it uses useReactFlow, or gets instance via prop */}
            <ReactFlowProvider> <MastersPaletteWrapper /> </ReactFlowProvider>
          </div>
          
          <Separator />
          
          {/* Properties Panel Section */}
          <div className="p-3 border-b">
            <h3 className="text-base font-semibold font-title">节点属性</h3>
            <p className="text-xs text-muted-foreground font-sans">
              {selectedNode ? `选中: ${selectedNode.data.label || selectedNode.id}` : '点击节点查看属性。'}
            </p>
          </div>
          <div className="flex-grow overflow-y-auto min-h-[200px] p-1">
            <PropertiesDisplayPanel selectedNode={selectedNode} />
          </div>
        </div>

        {/* Right Area (Toolbar + Canvas) */}
        <div className="flex-grow flex flex-col overflow-hidden">
          <ReactFlowProvider> {/* Single provider for Toolbar and Canvas */}
            {/* Top Toolbar Area */}
            <div className="flex-shrink-0 p-2 border-b bg-background shadow-sm">
              <TopologyToolbarWrapper />
            </div>
            
            {/* Canvas Area with Bottom Margin */}
            <div className="flex-grow relative pb-5"> {/* pb-5 for 20px bottom margin */}
              <div className="absolute inset-0"> {/* This div will be filled by ActualTopologyFlowWithState */}
                 <ActualTopologyFlowWithState />
              </div>
            </div>
          </ReactFlowProvider>
        </div>
      </div>
    </AppLayout>
  );
}
