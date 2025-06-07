
'use client';

import React, { useCallback, useState, useEffect } from 'react';
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
import { Settings, ListTree, Info as InfoIcon, PlusCircle } from 'lucide-react';

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
import { Card } from '@/components/ui/card'; // Used for consistency in Popover/Sheet content

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

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
    const newNodeData = { label: `新节点 ${newCounter}` };
    
    const viewport = reactFlowInstance.getViewport();
    const posX = viewport.width && viewport.width > 0 ? Math.random() * viewport.width / 2 + 50 : 100;
    const posY = viewport.height && viewport.height > 0 ? Math.random() * viewport.height / 2 + 50 : 100;

    const newNode: Node = {
      id: newNodeId,
      type: 'default',
      data: newNodeData,
      position: { x: posX, y: posY },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    setNodes((nds) => nds.concat(newNode));
    toast({ title: "节点已添加", description: `添加了节点 "${newNodeData.label}".` });
  }, [nodeIdCounter, setNodes, setNodeIdCounter, reactFlowInstance, toast]);

  const handleAddMasterNodeFromPalette = useCallback((masterConfig: NamedApiConfig) => {
    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    const newNodeId = `master-node-${masterConfig.id}-${newCounter}`;

    const viewport = reactFlowInstance.getViewport();
    const posX = viewport.width && viewport.width > 0 ? Math.random() * viewport.width / 2 + 20 : 80;
    const posY = viewport.height && viewport.height > 0 ? Math.random() * viewport.height / 2 + 20 : 80;
    
    const newNode: Node = {
      id: newNodeId,
      type: 'default',
      data: {
        label: `主控: ${masterConfig.name}`,
        nodeType: 'masterRepresentation',
        masterId: masterConfig.id,
        masterName: masterConfig.name,
      },
      position: { x: posX, y: posY },
      style: { borderColor: 'hsl(var(--primary))', borderWidth: 2, background: 'hsl(var(--primary)/10)' },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    setNodes((nds) => nds.concat(newNode));
    toast({ title: "主控节点已添加", description: `添加主控 "${masterConfig.name}" 到画布.` });
    setIsMastersSheetOpen(false);
  }, [nodeIdCounter, setNodes, setNodeIdCounter, toast, reactFlowInstance]);

  const handleClearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setNodeIdCounter(0);
    setSelectedNode(null);
    toast({ title: "画布已清空" });
    setIsToolbarPopoverOpen(false);
  }, [setNodes, setEdges, setNodeIdCounter, toast]);

  const handleCenterView = useCallback(() => {
    const masterNodes = nodes.filter(node => node.data?.nodeType === 'masterRepresentation');
    if (masterNodes.length > 0) {
      const firstMasterNode = masterNodes[0];
      reactFlowInstance.fitView({ nodes: [{ id: firstMasterNode.id }], duration: 300, padding: 0.3 });
      toast({ title: "视图已居中", description: `聚焦于主控 "${firstMasterNode.data.label}".` });
    } else if (nodes.length > 0) {
      reactFlowInstance.fitView({ duration: 300, padding: 0.1 });
      toast({ title: "视图已适应所有节点" });
    } else {
      toast({ title: "画布为空", description: "没有可居中的节点.", variant: "destructive" });
    }
    setIsToolbarPopoverOpen(false);
  }, [reactFlowInstance, nodes, toast]);

  const handleFormatLayout = useCallback(() => {
    toast({ title: "格式化布局", description: "此功能待实现." });
    console.log("Format Layout button clicked. Nodes:", nodes, "Edges:", edges);
    setIsToolbarPopoverOpen(false);
  }, [nodes, edges, toast]);

  const handleSubmitTopology = useCallback(() => {
    toast({ title: "提交拓扑", description: "此功能待实现." });
    console.log("Submit Topology button clicked. Nodes:", nodes, "Edges:", edges);
    setIsToolbarPopoverOpen(false);
  }, [nodes, edges, toast]);

  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[], edges: Edge[] }) => {
    if (selectedNodesList.length === 1) {
      setSelectedNode(selectedNodesList[0]);
    } else {
      setSelectedNode(null);
    }
  }, []);

  useEffect(() => {
    if (selectedNode && !nodes.find(n => n.id === selectedNode.id)) {
      setSelectedNode(null);
      setIsPropertiesSheetOpen(false);
    }
  }, [nodes, selectedNode]);

  return (
    <div className="h-full w-full relative" data-testid="topology-page-container">
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
        className="h-full w-full bg-background"
      >
        <Controls style={{ bottom: 10, right: 10, left: 'auto', top: 'auto' }} />
        <MiniMap nodeStrokeWidth={3} zoomable pannable style={{ bottom: 10, left: 10, right: 'auto', top: 'auto' }} />
        <Background variant="dots" gap={16} size={1} />
      </ReactFlow>

      <Popover open={isToolbarPopoverOpen} onOpenChange={setIsToolbarPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="absolute top-4 left-4 z-10 shadow-md rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
            aria-label="打开工具栏"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-2" side="bottom" align="start">
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
            variant="outline"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-[calc(50%+2.5rem)] z-10 shadow-md rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
            aria-label="打开主控列表"
          >
            <ListTree className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="font-title text-lg">主控列表</SheetTitle>
            <SheetDescription className="font-sans text-xs">
              点击主控将其添加到画布。
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
              variant="outline"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 shadow-md rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
              aria-label="打开属性面板"
            >
              <InfoIcon className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 p-0 flex flex-col">
             <PropertiesDisplayPanel selectedNode={selectedNode} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

export default function TopologyPageContainer() {
  return (
    <AppLayout>
      <div className="flex-grow h-full w-full"> {/* Ensure this container also takes full height */}
        <ReactFlowProvider>
          <TopologyFlow />
        </ReactFlowProvider>
      </div>
    </AppLayout>
  );
}
    
