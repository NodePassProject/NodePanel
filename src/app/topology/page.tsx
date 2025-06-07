
'use client';

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
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
  PanOnScrollMode,
  Panel,
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

interface ActualTopologyFlowWithStateProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (params: Connection | Edge) => void;
  onSelectionChange: ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => void;
  reactFlowWrapperRef: React.RefObject<HTMLDivElement>;
  onCenterView: (instance: ReturnType<typeof useReactFlow>) => void;
  onFormatLayout: () => void;
  onClearCanvas: () => void;
  onSubmitTopology: () => void;
  canSubmit: boolean;
  onMasterNodeDropOnCanvas: (config: NamedApiConfig, position: { x: number; y: number }) => void;
}

const ActualTopologyFlowWithState: React.FC<ActualTopologyFlowWithStateProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
  reactFlowWrapperRef, // This ref is for the div *containing* ReactFlow
  onCenterView,
  onFormatLayout,
  onClearCanvas,
  onSubmitTopology,
  canSubmit,
  onMasterNodeDropOnCanvas,
}) => {
  const { resolvedTheme } = useTheme();
  const [isClient, setIsClient] = useState(false);
  const reactFlowInstance = useReactFlow();


  useEffect(() => {
    setIsClient(true);
  }, []);

  const miniMapStyle = useMemo(() => ({
    backgroundColor: resolvedTheme === 'dark' ? 'hsl(var(--popover))' : 'hsl(var(--card))',
    border: `1px solid hsl(var(--border))`,
    borderRadius: '0.375rem',
  }), [resolvedTheme]);

  const memoizedMiniMap = useMemo(() => (
    isClient ? <MiniMap style={miniMapStyle} nodeStrokeWidth={3} zoomable pannable /> : null
  ), [miniMapStyle, isClient]);
  const memoizedBackground = useMemo(() => <Background variant="dots" gap={16} size={1} />, []);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const configString = event.dataTransfer.getData('application/nodepass-master-config');
    if (configString && reactFlowInstance) {
      try {
        const config = JSON.parse(configString) as NamedApiConfig;
        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        onMasterNodeDropOnCanvas(config, position);
      } catch (e) {
        console.error("Failed to parse dragged master config:", e);
        // Optionally show a toast error to the user
      }
    }
  };

  return (
    <div
      ref={reactFlowWrapperRef}
      className="h-full w-full bg-background rounded-lg shadow-md border"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
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
        panOnScroll={false}
        zoomOnScroll={true}
        panOnDrag={true}
        selectionOnDrag
        className="h-full w-full"
        nodeOrigin={[0.5, 0.5]}
      >
        <Panel position="top-right" className="!m-0 !p-2 bg-transparent">
          <ToolbarWrapperComponent
            onCenterView={onCenterView}
            onFormatLayout={onFormatLayout}
            onClearCanvas={onClearCanvas}
            onSubmitTopology={onSubmitTopology}
            canSubmit={canSubmit}
          />
        </Panel>
        {memoizedMiniMap}
        {memoizedBackground}
      </ReactFlow>
    </div>
  );
};

interface ToolbarWrapperComponentProps {
  onCenterView: (instance: ReturnType<typeof useReactFlow>) => void;
  onFormatLayout: () => void;
  onClearCanvas: () => void;
  onSubmitTopology: () => void;
  canSubmit: boolean;
}

const ToolbarWrapperComponent: React.FC<ToolbarWrapperComponentProps> = ({
  onCenterView,
  onFormatLayout,
  onClearCanvas,
  onSubmitTopology,
  canSubmit,
}) => {
  const reactFlowInstance = useReactFlow();
  return (
    <TopologyToolbar
      onCenterView={() => onCenterView(reactFlowInstance)}
      onFormatLayout={onFormatLayout}
      onClearCanvas={onClearCanvas}
      onSubmitTopology={onSubmitTopology}
      canSubmit={canSubmit}
    />
  );
};


export default function TopologyPage() {
  const [nodesInternal, setNodesInternal, onNodesChangeInternalWrapped] = useNodesState(initialNodes);
  const [edgesInternal, setEdgesInternal, onEdgesChangeInternalWrapped] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(0);
  const { toast } = useToast();
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null); // This ref is for the div *containing* ReactFlow

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodesInternal((nds) => applyNodeChanges(changes, nds)),
    [setNodesInternal]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdgesInternal((eds) => applyEdgeChanges(changes, eds)),
    [setEdgesInternal]
  );

  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdgesInternal((eds) => addEdge({ ...params, animated: true, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdgesInternal]
  );

  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[], edges: Edge[] }) => {
    setSelectedNode(selectedNodesList.length === 1 ? selectedNodesList[0] : null);
  }, []);


  const handleMasterNodeDroppedOnCanvas = useCallback((masterConfig: NamedApiConfig, position: { x: number; y: number }) => {
    const masterNodeData: Omit<Node, 'id' | 'position'> = {
      type: 'default', // Or a custom type if you have one for masters
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
    
    const newCounter = nodeIdCounter + 1;
    setNodeIdCounter(newCounter);
    const newNodeId = `${masterNodeData.type || 'node'}-master-${newCounter}`;

    const finalNewNode: Node = {
      id: newNodeId,
      position,
      ...masterNodeData,
    };

    setNodesInternal((nds) => nds.concat(finalNewNode));
    toast({ title: "主控节点已添加", description: `已添加主控 "${masterConfig.name}" 到画布。` });
  }, [nodeIdCounter, setNodesInternal, toast]);


  const handleClearCanvasCallback = useCallback(() => {
    setNodesInternal([]);
    setEdgesInternal([]);
    setNodeIdCounter(0);
    setSelectedNode(null);
    toast({ title: "画布已清空" });
  }, [setNodesInternal, setEdgesInternal, setNodeIdCounter, toast]);

  const handleCenterViewCallback = useCallback((instance: ReturnType<typeof useReactFlow> | null) => {
    if (!instance) return;
    if (nodesInternal.length > 0) {
      instance.fitView({ duration: 300, padding: 0.2 });
    } else {
      toast({ title: "画布为空", description: "无法居中空画布。" });
    }
  }, [nodesInternal, toast]);

  const handleFormatLayoutCallback = useCallback(() => {
    toast({ title: "格式化布局", description: "此功能待实现。" });
  }, [toast]);

  const handleSubmitTopologyCallback = useCallback(() => {
    toast({ title: "提交拓扑", description: "此功能待实现。" });
  }, [toast]);


  return (
    <AppLayout>
      <ReactFlowProvider>
        <div className="flex flex-col flex-grow h-full">
          <div className="flex flex-row flex-grow h-full overflow-hidden">
            {/* Left Sidebar - Unified Panel */}
            <div className="w-60 flex-shrink-0 p-2">
              <div className="flex flex-col h-full bg-background rounded-lg shadow-md border">
                {/* Masters Palette Section */}
                <div className="flex flex-col h-1/2 p-3">
                  <h2 className="text-base font-semibold font-title mb-1">主控列表</h2>
                  <p className="text-xs text-muted-foreground font-sans mb-2">拖拽主控到画布。</p>
                  <div className="flex-grow overflow-y-auto">
                    <MastersPalette />
                  </div>
                </div>

                <Separator className="my-0" /> 

                {/* Node Properties Section */}
                <div className="flex flex-col flex-grow min-h-0 p-3">
                  <h2 className="text-base font-semibold font-title mb-1">节点属性</h2>
                  <p className="text-xs text-muted-foreground font-sans mb-2">
                    {selectedNode ? `选中: ${selectedNode.data.label || selectedNode.id}` : '点击节点查看属性。'}
                  </p>
                  <div className="flex-grow overflow-y-hidden">
                    <PropertiesDisplayPanel selectedNode={selectedNode} />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Canvas Area */}
            <div className="flex-grow flex flex-col overflow-hidden p-2">
              <div className="flex-grow relative"> {/* Ensure this parent is relative for absolute positioning */}
                <div className="absolute inset-0"> {/* This div now takes the full space of its relative parent */}
                  <ActualTopologyFlowWithState
                    nodes={nodesInternal}
                    edges={edgesInternal}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onSelectionChange={onSelectionChange}
                    reactFlowWrapperRef={reactFlowWrapperRef}
                    onCenterView={handleCenterViewCallback}
                    onFormatLayout={handleFormatLayoutCallback}
                    onClearCanvas={handleClearCanvasCallback}
                    onSubmitTopology={handleSubmitTopologyCallback}
                    canSubmit={nodesInternal.length > 0 || edgesInternal.length > 0}
                    onMasterNodeDropOnCanvas={handleMasterNodeDroppedOnCanvas}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </ReactFlowProvider>
    </AppLayout>
  );
}
