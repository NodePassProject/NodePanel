
'use client';

import React, { useCallback } from 'react';
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

// Initial setup (can be empty for max freedom at start)
const initialNodes: Node[] = [
  {
    id: 'node-1',
    type: 'default', 
    data: { label: 'Drag me' },
    position: { x: 100, y: 100 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  },
  {
    id: 'node-2',
    type: 'default',
    data: { label: 'Node 2' },
    position: { x: 300, y: 200 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  },
];
const initialEdges: Edge[] = []; 

let nodeIdCounter = initialNodes.length;

function FlowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges]
  );

  const onAddNode = useCallback(() => {
    nodeIdCounter++;
    const newNodeId = `node-${nodeIdCounter}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'default',
      data: { label: `Node ${nodeIdCounter}` },
      position: {
        // Ensure new nodes appear within a reasonable area of the viewport
        x: Math.random() * ( (typeof window !== "undefined" ? window.innerWidth : 800) * 0.5), 
        y: Math.random() * ( (typeof window !== "undefined" ? window.innerHeight : 600) * 0.5),
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

  const onClearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    nodeIdCounter = 0;
  }, [setNodes, setEdges]);

  return (
    <div className="h-full w-full relative">
      <div className="absolute top-4 left-4 z-10 space-x-2">
        <Button onClick={onAddNode} size="sm" variant="outline" className="shadow-md bg-card hover:bg-card/90">
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Node
        </Button>
        <Button
            onClick={onClearCanvas}
            size="sm"
            variant="destructive"
            className="shadow-md"
        >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear Canvas
        </Button>
      </div>
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
      >
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}

export default function TopologyPage() {
  return (
    <AppLayout>
      <div className="h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)] w-full" data-testid="topology-page-container">
        <ReactFlowProvider>
          <FlowEditor />
        </ReactFlowProvider>
      </div>
    </AppLayout>
  );
}
