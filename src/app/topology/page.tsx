
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
import 'reactflow/dist/style.css'; // Essential for ReactFlow styles

import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TopologyToolbar } from './components/TopologyToolbar';
import { MastersPalette } from './components/MastersPalette';
import { PropertiesDisplayPanel } from './components/PropertiesDisplayPanel'; // New component
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { useToast } from '@/hooks/use-toast';


const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

// ReactFlow canvas component
function FlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [nodeIdCounter, setNodeIdCounter] = useState(0);
  const { toast } = useToast();
  const reactFlowInstance = useReactFlow();
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);


  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges]
  );

  const handleAddGenericNode = useCallback(() => {
    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    const newNodeId = `node-${newCounter}`;
    const newNodeData = { label: `Node ${newCounter}` };
    const newNode: Node = {
      id: newNodeId,
      type: 'default', // Or your custom node type
      data: newNodeData,
      position: {
        x: Math.random() * 400 + 50,
        y: Math.random() * 200 + 50,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    setNodes((nds) => nds.concat(newNode));
  }, [nodeIdCounter, setNodes, setNodeIdCounter]);

  const handleAddMasterNodeFromPalette = useCallback((masterConfig: NamedApiConfig) => {
    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    const newNodeId = `master-node-${masterConfig.id}-${newCounter}`; 
    const newNode: Node = {
      id: newNodeId,
      type: 'default', 
      data: { 
        label: `Master: ${masterConfig.name}`,
        nodeType: 'masterRepresentation', 
        masterId: masterConfig.id,
        masterName: masterConfig.name,
      },
      position: {
        x: Math.random() * 200 + 20, 
        y: Math.random() * 150 + 20,
      },
      style: { borderColor: 'hsl(var(--primary))', borderWidth: 2, background: 'hsl(var(--primary)/10)' }, 
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    setNodes((nds) => nds.concat(newNode));
    toast({ title: "Master Node Added", description: `Added "${masterConfig.name}" to the canvas.`});
  }, [nodeIdCounter, setNodes, setNodeIdCounter, toast]);


  const handleClearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setNodeIdCounter(0);
    setSelectedNode(null);
    toast({ title: "Canvas Cleared"});
  }, [setNodes, setEdges, setNodeIdCounter, toast]);

  const handleCenterView = useCallback(() => {
    const masterNodes = nodes.filter(node => node.data?.nodeType === 'masterRepresentation');
    if (masterNodes.length > 0) {
      const firstMasterNode = masterNodes[0];
      reactFlowInstance.fitView({ nodes: [{id: firstMasterNode.id}], duration: 300, padding: 0.3 });
      toast({ title: "View Centered", description: `Focused on Master "${firstMasterNode.data.label}".`});
    } else if (nodes.length > 0) {
      reactFlowInstance.fitView({duration: 300, padding: 0.1});
      toast({ title: "View Fitted to All Nodes"});
    } else {
      toast({ title: "Canvas Empty", description: "No nodes to center." , variant: "destructive"});
    }
  }, [reactFlowInstance, nodes, toast]);

  const handleFormatLayout = useCallback(() => {
    toast({ title: "Format Layout", description: "This feature is pending implementation."});
    console.log("Format Layout button clicked. Nodes:", nodes, "Edges:", edges);
  }, [nodes, edges, toast]);

  const handleSubmitTopology = useCallback(() => {
    toast({ title: "Submit Topology", description: "This feature is pending implementation."});
    console.log("Submit Topology button clicked. Nodes:", nodes, "Edges:", edges);
  }, [nodes, edges, toast]);

  const onSelectionChange = useCallback((params: { nodes: Node[], edges: Edge[] }) => {
    if (params.nodes.length === 1) {
      setSelectedNode(params.nodes[0]);
    } else {
      setSelectedNode(null);
    }
  }, []);


  return (
    <AppLayout>
      <div className="flex flex-col h-full w-full gap-3" data-testid="topology-page-container">
        
        {/* Toolbar Header Card */}
        <Card className="shrink-0">
          <CardContent className="p-3">
            <TopologyToolbar
              onAddNode={handleAddGenericNode}
              onCenterView={handleCenterView}
              onFormatLayout={handleFormatLayout}
              onClearCanvas={handleClearCanvas}
              onSubmitTopology={handleSubmitTopology}
              canSubmit={nodes.length > 0} 
            />
          </CardContent>
        </Card>

        {/* Main Content Area: Sidebar + Canvas */}
        <div className="flex flex-row flex-grow gap-3 min-h-0"> {/* min-h-0 is important for flex children to scroll */}
          {/* Sidebar: Masters Palette and Properties Panel */}
          <Card className="w-72 shrink-0 flex flex-col"> {/* Fixed width for sidebar */}
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-lg font-title">主控列表</CardTitle>
              <CardDescription className="font-sans text-xs">点击主控将其添加到画布。</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow py-2 min-h-0 overflow-y-auto"> {/* Ensure MastersPalette can scroll if content overflows */}
              <MastersPalette onAddMasterNode={handleAddMasterNodeFromPalette} />
            </CardContent>
            
            <div className="my-2 border-t border-border mx-4"></div>

            <PropertiesDisplayPanel selectedNode={selectedNode} />
          </Card>

          {/* Canvas Area */}
          <Card className="flex-grow overflow-hidden"> {/* Canvas card takes remaining space and handles its own overflow */}
            <CardContent className="p-0 h-full w-full">
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
                  panOnDrag={[PanOnScrollMode.Free, PanOnScrollMode.Right, PanOnScrollMode.Left]} // Ensure panOnDrag is correctly typed
                  className="h-full w-full" // ReactFlow will fill its parent
                >
                  <Controls />
                  <MiniMap nodeStrokeWidth={3} zoomable pannable />
                  <Background variant="dots" gap={12} size={1} />
                </ReactFlow>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}


export default function TopologyPageContainer() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  )
}

