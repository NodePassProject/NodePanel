
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

function TopologyPageContainer() {
  return (
    <AppLayout>
      {/* This div is the direct child of AppLayout's main area.
          It needs to grow and establish a context for its children.
          It's a flex column that grows.
      */}
      <div className="flex flex-col flex-grow">
        {/* This div provides the p-5 margin and should also grow, and be a flex column */}
        <div className="flex-grow p-5 flex flex-col">
          <ReactFlowProvider>
            {/* TopologyFlow will be made to grow within this flex column */}
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
  const [isMastersSheetOpen, setIsMastersSheetOpen] = useState(false);
  const [isPropertiesSheetOpen, setIsPropertiesSheetOpen] = useState(false);


  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges]
  );

  const handleAddGenericNode = useCallback(() => {
    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    const newNodeId = `node-${newCounter}`;
    const newNodeData = { label: `New Node ${newCounter}` };
    
    const viewport = reactFlowInstance.getViewport();
    const fallbackX = 100; // Fallback if viewport dimensions are zero
    const fallbackY = 100;

    // Position new node relative to the current viewport top-left
    // Ensure viewport dimensions are valid before using them for offset calculations
    const positionX = viewport.x + ((viewport.width && viewport.width > 0) ? (Math.random() * viewport.width * 0.5) : fallbackX);
    const positionY = viewport.y + ((viewport.height && viewport.height > 0) ? (Math.random() * viewport.height * 0.5) : fallbackY);
    

    const newNode: Node = {
      id: newNodeId,
      type: 'default',
      data: newNodeData,
      position: { x: positionX, y: positionY },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    setNodes((nds) => nds.concat(newNode));
    toast({ title: "Node Added", description: `Added node "${newNodeData.label}".` });
    setIsToolbarPopoverOpen(false);
  }, [nodeIdCounter, setNodes, setNodeIdCounter, reactFlowInstance, toast]);

  const handleAddMasterNodeFromPalette = useCallback((masterConfig: NamedApiConfig) => {
    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    const newNodeId = `master-node-${masterConfig.id}-${newCounter}`;

    const viewport = reactFlowInstance.getViewport();
    const fallbackX = 80;
    const fallbackY = 80;
    
    const positionX = viewport.x + ((viewport.width && viewport.width > 0) ? (Math.random() * viewport.width * 0.4) : fallbackX);
    const positionY = viewport.y + ((viewport.height && viewport.height > 0) ? (Math.random() * viewport.height * 0.4) : fallbackY);
        
    const newNode: Node = {
      id: newNodeId,
      type: 'default', 
      data: {
        label: `Master: ${masterConfig.name}`,
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
    toast({ title: "Master Node Added", description: `Added master "${masterConfig.name}" to canvas.` });
    setIsMastersSheetOpen(false); 
  }, [nodeIdCounter, setNodes, setNodeIdCounter, toast, reactFlowInstance]);

  const handleClearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setNodeIdCounter(0);
    setSelectedNode(null);
    toast({ title: "Canvas Cleared" });
    setIsToolbarPopoverOpen(false); 
  }, [setNodes, setEdges, setNodeIdCounter, toast]);

  const handleCenterView = useCallback(() => {
    const masterNodes = nodes.filter(node => node.data?.nodeType === 'masterRepresentation');
    if (masterNodes.length > 0) {
      const firstMasterNode = masterNodes[0];
      reactFlowInstance.fitView({ nodes: [{ id: firstMasterNode.id }], duration: 300, padding: 0.3 });
      toast({ title: "View Centered", description: `Focused on master "${firstMasterNode.data.label}".` });
    } else if (nodes.length > 0) {
      reactFlowInstance.fitView({ duration: 300, padding: 0.2 }); 
      toast({ title: "View Fitted to Nodes" });
    } else {
      toast({ title: "Canvas Empty", description: "No nodes to center.", variant: "destructive" });
    }
    setIsToolbarPopoverOpen(false); 
  }, [reactFlowInstance, nodes, toast]);

  const handleFormatLayout = useCallback(() => {
    toast({ title: "Format Layout", description: "This feature is pending implementation." });
    console.log("Format Layout button clicked. Nodes:", nodes, "Edges:", edges);
    setIsToolbarPopoverOpen(false); 
  }, [nodes, edges, toast]);

  const handleSubmitTopology = useCallback(() => {
    toast({ title: "Submit Topology", description: "This feature is pending implementation." });
    console.log("Submit Topology button clicked. Nodes:", nodes, "Edges:", edges);
    setIsToolbarPopoverOpen(false); 
  }, [nodes, edges, toast]);

  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[], edges: Edge[] }) => {
    if (selectedNodesList.length === 1) {
      setSelectedNode(selectedNodesList[0]);
       if (!isPropertiesSheetOpen) {
         setIsPropertiesSheetOpen(true);
       }
    } else {
      setSelectedNode(null);
       if (isPropertiesSheetOpen && selectedNodesList.length === 0) {
         setIsPropertiesSheetOpen(false);
       }
    }
  }, [isPropertiesSheetOpen, setIsPropertiesSheetOpen]);

  useEffect(() => {
    if (selectedNode && !nodes.find(n => n.id === selectedNode.id)) {
      setSelectedNode(null);
      setIsPropertiesSheetOpen(false);
    }
  }, [nodes, selectedNode]);

  const memoizedControls = useMemo(() => <Controls style={{ bottom: 10, right: 10 }} />, []);
  const memoizedMiniMap = useMemo(() => <MiniMap nodeStrokeWidth={3} zoomable pannable style={{ bottom: 10, left: 10, backgroundColor: 'hsl(var(--background)/0.8)'}} className="rounded-md shadow-md border border-border" />, []);
  const memoizedBackground = useMemo(() => <Background variant="dots" gap={16} size={1} />, []);

  return (
    // This div IS the canvas container AND the positioning parent for the buttons.
    // It MUST grow to fill the space given by its parent (the div with p-5).
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

      {/* Overlay Trigger Buttons Group */}
      <div className="absolute top-3 left-3 z-20 flex items-center space-x-2 p-1.5 bg-background/60 backdrop-blur-sm rounded-lg shadow-md border border-border">
        <Popover open={isToolbarPopoverOpen} onOpenChange={setIsToolbarPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-accent/50"
              aria-label="Open toolbar"
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

        <Sheet open={isMastersSheetOpen} onOpenChange={setIsMastersSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-accent/50"
              aria-label="Open masters list"
            >
              <ListTree className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 flex flex-col">
            <SheetHeader className="p-4 border-b">
              <SheetTitle className="font-title text-base">Masters List</SheetTitle>
              <SheetDescription className="font-sans text-xs">
                Click a master to add its representation to the canvas.
              </SheetDescription>
            </SheetHeader>
            <div className="p-4 flex-grow overflow-y-auto">
              <MastersPalette onAddMasterNode={handleAddMasterNodeFromPalette} />
            </div>
          </SheetContent>
        </Sheet>

        {selectedNode && (
          <Sheet open={isPropertiesSheetOpen} onOpenChange={setIsPropertiesSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-accent/50"
                aria-label="Open properties panel"
              >
                <InfoIcon className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 p-0 flex flex-col">
               <PropertiesDisplayPanel selectedNode={selectedNode} />
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
}

export default TopologyPageContainer;
    
