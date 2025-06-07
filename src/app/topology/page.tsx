
'use client';

import React, { useCallback, useState } from 'react';
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
  type Connection,
  type Edge,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css'; // Essential for ReactFlow styles

import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const initialNodes: Node[] = [
  {
    id: 'node-1',
    type: 'default',
    data: { label: 'Drag me' },
    position: { x: 50, y: 50 }, // Adjusted initial position for visibility
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  },
  {
    id: 'node-2',
    type: 'default',
    data: { label: 'Node 2' },
    position: { x: 250, y: 150 }, // Adjusted initial position
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  },
];
const initialEdges: Edge[] = [];

// New component for the ReactFlow canvas
function FlowCanvas({ nodes, edges, onNodesChange, onEdgesChange, onConnect }: {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (params: Connection | Edge) => void;
}) {
  return (
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
      panOnDrag={[0, 1, 2]} // 0: left, 1: middle, 2: right mouse
      className="h-full w-full" // Ensure it fills its container
    >
      <Controls />
      <MiniMap nodeStrokeWidth={3} zoomable pannable />
      <Background variant="dots" gap={12} size={1} />
    </ReactFlow>
  );
}

export default function TopologyPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [nodeIdCounter, setNodeIdCounter] = useState(initialNodes.length);

  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges]
  );

  const onAddNode = useCallback(() => {
    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    const newNodeId = `node-${newCounter}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'default',
      data: { label: `Node ${newCounter}` },
      position: {
        x: Math.random() * 300 + 50, // Random position within a typical view
        y: Math.random() * 200 + 50,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    setNodes((nds) => nds.concat(newNode));
  }, [nodeIdCounter, setNodes, setNodeIdCounter]);

  const onClearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setNodeIdCounter(0);
  }, [setNodes, setEdges, setNodeIdCounter]);

  return (
    <AppLayout>
      {/* This div takes full height available within AppLayout's main padded area */}
      <div className="flex h-full w-full gap-4" data-testid="topology-page-container">
        {/* Sidebar: Tools and Nodes Area */}
        <Card className="w-72 shrink-0 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-title">工具区</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 py-2">
            <Button onClick={onAddNode} size="sm" variant="outline" className="w-full font-sans">
              <PlusCircle className="mr-2 h-4 w-4" />
              添加节点
            </Button>
            <Button onClick={onClearCanvas} size="sm" variant="destructive" className="w-full font-sans">
              <Trash2 className="mr-2 h-4 w-4" />
              清空画布
            </Button>
          </CardContent>

          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-xl font-title">节点区</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow py-2"> {/* flex-grow allows this content to take remaining space */}
            <div className="border rounded-md min-h-[200px] p-3 text-sm text-muted-foreground font-sans bg-muted/30 h-full">
              <p>从这里拖拽节点类型到画布 (后续实现):</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>服务端</li>
                <li>客户端</li>
                <li>落地</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Canvas Area */}
        <Card className="flex-grow overflow-hidden"> {/* flex-grow for canvas to take remaining width, overflow-hidden for clean edges */}
          <CardContent className="p-0 h-full w-full"> {/* Remove padding and ensure full height for canvas */}
            <ReactFlowProvider>
              <FlowCanvas
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
              />
            </ReactFlowProvider>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
