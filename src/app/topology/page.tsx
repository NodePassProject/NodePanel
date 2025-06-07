
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

import { AppLayout } from '@/components/layout/AppLayout';
import { TopologyToolbar } from './components/TopologyToolbar';
import { MastersPalette } from './components/MastersPalette';
import { PropertiesDisplayPanel } from './components/PropertiesDisplayPanel';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Settings, ListTree, Info as InfoIcon } from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

function TopologyPageContainer() {
  return (
    <AppLayout>
      <div className="flex flex-col flex-grow">
        {/* Reduced padding here to p-1 for larger canvas */}
        <div className="flex-grow p-1 flex flex-col"> 
          <ReactFlowProvider>
            <TopologyFlow />
          </ReactFlowProvider>
        </div>
      </div>
    </AppLayout>
  );
}

function TopologyFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [nodeIdCounter, setNodeIdCounter] = useState(0);
  const { toast } = useToast();
  const reactFlowInstance = useReactFlow();
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const [isToolbarPopoverOpen, setIsToolbarPopoverOpen] = useState(false);
  const [isMastersPopoverOpen, setIsMastersPopoverOpen] = useState(false); // Changed from Sheet to Popover
  const [isPropertiesPopoverOpen, setIsPropertiesPopoverOpen] = useState(false);


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
    
    const viewport = reactFlowInstance.getViewport();
    const fallbackX = 100; 
    const fallbackY = 100;

    const positionX = viewport.width > 0 ? (viewport.x + (Math.random() * viewport.width * 0.5)) : fallbackX;
    const positionY = viewport.height > 0 ? (viewport.y + (Math.random() * viewport.height * 0.5)) : fallbackY;
    
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
    setIsToolbarPopoverOpen(false);
  }, [nodeIdCounter, setNodes, setNodeIdCounter, reactFlowInstance, toast]);

  const handleAddMasterNodeFromPalette = useCallback((masterConfig: NamedApiConfig) => {
    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    const newNodeId = `master-node-${masterConfig.id}-${newCounter}`;

    const viewport = reactFlowInstance.getViewport();
    const fallbackX = 80;
    const fallbackY = 80;
    
    const positionX = viewport.width > 0 ? (viewport.x + (Math.random() * viewport.width * 0.4)) : fallbackX;
    const positionY = viewport.height > 0 ? (viewport.y + (Math.random() * viewport.height * 0.4)) : fallbackY;
        
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
    setIsMastersPopoverOpen(false); // Close Popover
  }, [nodeIdCounter, setNodes, setNodeIdCounter, toast, reactFlowInstance]);

  const handleClearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setNodeIdCounter(0);
    setSelectedNode(null);
    toast({ title: "画布已清空" });
    setIsToolbarPopoverOpen(false); 
    setIsPropertiesPopoverOpen(false);
    setIsMastersPopoverOpen(false);
  }, [setNodes, setEdges, setNodeIdCounter, toast]);

  const handleCenterView = useCallback(() => {
    const masterNodes = nodes.filter(node => node.data?.nodeType === 'masterRepresentation');
    if (masterNodes.length > 0) {
      const firstMasterNode = masterNodes[0];
      reactFlowInstance.fitView({ nodes: [{ id: firstMasterNode.id }], duration: 300, padding: 0.3 });
      toast({ title: "视图已居中", description: `聚焦于主控 "${firstMasterNode.data.label}"。` });
    } else if (nodes.length > 0) {
      reactFlowInstance.fitView({ duration: 300, padding: 0.2 }); 
      toast({ title: "视图已适应节点" });
    } else {
      toast({ title: "画布为空", description: "无节点可居中。", variant: "destructive" });
    }
    setIsToolbarPopoverOpen(false); 
  }, [reactFlowInstance, nodes, toast]);

  const handleFormatLayout = useCallback(() => {
    toast({ title: "格式化布局", description: "此功能待实现。" });
    console.log("格式化布局按钮点击。节点:", nodes, "边:", edges);
    setIsToolbarPopoverOpen(false); 
  }, [nodes, edges, toast]);

  const handleSubmitTopology = useCallback(() => {
    toast({ title: "提交拓扑", description: "此功能待实现。" });
    console.log("提交拓扑按钮点击。节点:", nodes, "边:", edges);
    setIsToolbarPopoverOpen(false); 
  }, [nodes, edges, toast]);

  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[], edges: Edge[] }) => {
    if (selectedNodesList.length === 1) {
      setSelectedNode(selectedNodesList[0]);
       if (!isPropertiesPopoverOpen) { // Auto-open properties if a single node is selected and popover is closed
         setIsPropertiesPopoverOpen(true);
       }
    } else {
      setSelectedNode(null);
       if (isPropertiesPopoverOpen && selectedNodesList.length === 0) { // Close if no nodes are selected
         setIsPropertiesPopoverOpen(false);
       }
    }
  }, [isPropertiesPopoverOpen, setIsPropertiesPopoverOpen]);

  useEffect(() => {
    if (selectedNode && !nodes.find(n => n.id === selectedNode.id)) {
      setSelectedNode(null);
      if (isPropertiesPopoverOpen) setIsPropertiesPopoverOpen(false);
    }
  }, [nodes, selectedNode, isPropertiesPopoverOpen]);

  const memoizedControls = useMemo(() => <Controls style={{ bottom: 10, right: 10 }} />, []);
  const memoizedMiniMap = useMemo(() => <MiniMap nodeStrokeWidth={3} zoomable pannable style={{ bottom: 10, left: 10, backgroundColor: 'hsl(var(--background)/0.8)'}} className="rounded-md shadow-md border border-border" />, []);
  const memoizedBackground = useMemo(() => <Background variant="dots" gap={16} size={1} />, []);

  return (
    <div className="flex-grow w-full relative bg-card rounded-lg shadow-md border border-border overflow-hidden">
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

      <div className="absolute top-3 left-3 z-20 flex items-center space-x-2 p-1.5 bg-background/60 backdrop-blur-sm rounded-lg shadow-md border border-border">
        <Popover open={isToolbarPopoverOpen} onOpenChange={setIsToolbarPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-accent/50"
              aria-label="打开工具栏"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" side="bottom" align="start">
            <TopologyToolbar
              onAddNode={handleAddGenericNode}
              onCenterView={handleCenterView}
              onFormatLayout={handleFormatLayout}
              onClearCanvas={handleClearCanvas}
              onSubmitTopology={handleSubmitTopology}
              canSubmit={nodes.length > 0}
            />
          </PopoverContent>
        </Popover>

        <Popover open={isMastersPopoverOpen} onOpenChange={setIsMastersPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-accent/50"
              aria-label="打开主控列表"
            >
              <ListTree className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-72 p-0">
             <MastersPalette onAddMasterNode={handleAddMasterNodeFromPalette} />
          </PopoverContent>
        </Popover>

        {selectedNode && (
          <Popover open={isPropertiesPopoverOpen} onOpenChange={setIsPropertiesPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-accent/50"
                aria-label="打开属性面板"
              >
                <InfoIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-80 p-0 flex flex-col">
               <PropertiesDisplayPanel selectedNode={selectedNode} />
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

export default TopologyPageContainer;
    

    