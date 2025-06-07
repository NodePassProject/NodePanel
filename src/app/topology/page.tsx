
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
} from 'reactflow';
import 'reactflow/dist/style.css'; // Essential for ReactFlow styles

import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TopologyToolbar } from './components/TopologyToolbar';
import { MastersPalette } from './components/MastersPalette';
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


  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges]
  );

  const handleAddGenericNode = useCallback(() => {
    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    const newNodeId = `node-${newCounter}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'default',
      data: { label: `节点 ${newCounter}` },
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
    const newNodeId = `master-node-${masterConfig.id}-${newCounter}`; // More unique ID
    const newNode: Node = {
      id: newNodeId,
      type: 'default', 
      data: { 
        label: `主控: ${masterConfig.name}`,
        nodeType: 'masterRepresentation', // Custom property to identify these nodes
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
    toast({ title: "主控节点已添加", description: `已将 "${masterConfig.name}" 添加到画布。`});
  }, [nodeIdCounter, setNodes, setNodeIdCounter, toast]);


  const handleClearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setNodeIdCounter(0);
    toast({ title: "画布已清空"});
  }, [setNodes, setEdges, setNodeIdCounter, toast]);

  const handleCenterView = useCallback(() => {
    const masterNodes = nodes.filter(node => node.data?.nodeType === 'masterRepresentation');
    if (masterNodes.length > 0) {
      const firstMasterNode = masterNodes[0];
      reactFlowInstance.fitView({ nodes: [{id: firstMasterNode.id}], duration: 300, padding: 0.3 });
      toast({ title: "视图已居中", description: `聚焦于主控 "${firstMasterNode.data.label}".`});
    } else if (nodes.length > 0) {
      reactFlowInstance.fitView({duration: 300, padding: 0.1});
      toast({ title: "视图已适应所有节点"});
    } else {
      toast({ title: "画布为空", description: "画布上没有节点可供居中。" , variant: "destructive"});
    }
  }, [reactFlowInstance, nodes, toast]);

  const handleFormatLayout = useCallback(() => {
    // Placeholder for actual layouting logic (e.g., ELK.js, Dagre)
    toast({ title: "格式化布局", description: "此功能待实现。"});
    console.log("Format Layout button clicked. Nodes:", nodes, "Edges:", edges);
  }, [nodes, edges, toast]);

  const handleSubmitTopology = useCallback(() => {
    // Placeholder for topology submission logic
    toast({ title: "提交拓扑", description: "此功能待实现。"});
    console.log("Submit Topology button clicked. Nodes:", nodes, "Edges:", edges);
  }, [nodes, edges, toast]);


  return (
    <AppLayout>
      <div className="flex flex-col h-full w-full gap-4 md:flex-row" data-testid="topology-page-container">
        
        {/* Sidebar: Tools and Masters Palette */}
        <Card className="w-full md:w-72 shrink-0 flex flex-col">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-lg font-title">工具区</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <TopologyToolbar
              onAddNode={handleAddGenericNode}
              onCenterView={handleCenterView}
              onFormatLayout={handleFormatLayout}
              onClearCanvas={handleClearCanvas}
              onSubmitTopology={handleSubmitTopology}
              canSubmit={nodes.length > 0} 
            />
          </CardContent>
          
          <div className="my-2 border-t border-border mx-4"></div>

          <CardHeader className="pb-2 pt-2">
            <CardTitle className="text-lg font-title">主控列表</CardTitle>
            <CardDescription className="font-sans text-xs">点击主控将其添加到画布。</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow py-2 min-h-0">
            <MastersPalette onAddMasterNode={handleAddMasterNodeFromPalette} />
          </CardContent>
        </Card>

        {/* Canvas Area */}
        <Card className="flex-grow overflow-hidden h-[calc(100vh-var(--header-height)-var(--footer-height)-10rem)] md:h-auto">
          <CardContent className="p-0 h-full w-full">
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
                panOnScroll
                selectionOnDrag
                panOnDrag={[0, 1, 2]}
                className="h-full w-full"
              >
                <Controls />
                <MiniMap nodeStrokeWidth={3} zoomable pannable />
                <Background variant="dots" gap={12} size={1} />
              </ReactFlow>
          </CardContent>
        </Card>
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
