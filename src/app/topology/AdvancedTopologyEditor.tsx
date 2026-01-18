'use client';

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  useReactFlow,
  type Connection,
  type Edge,
  applyNodeChanges,
  type OnNodesChange,
  type NodeChange,
  type NodeMouseHandler,
  Position,
  type NodeProps,
} from 'reactflow';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Server, Smartphone as ClientIcon, Globe, UserCircle2 as UserIcon, ListTree, Puzzle, Info as InfoIconLucide, Edit3, Trash2, RefreshCw, Smartphone, X, PanelLeft } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import { TopologyCanvasWrapper } from './TopologyCanvas';
import { MastersPalette } from './components/MastersPalette';
import { ComponentsPalette, type DraggableNodeType } from './components/ComponentsPalette';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { useApiConfig } from '@/hooks/use-api-key';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { nodePassApi, getEventsUrl } from '@/lib/api';
import { buildUrlFromFormValues, type BuildUrlParams, prepareClientUrlParams, prepareServerUrlParams } from '@/components/nodepass/create-instance-dialog/utils';
import { extractPort, parseNodePassUrl } from '@/lib/url-utils'; // parseNodePassUrl now used
import { SubmitTopologyConfirmationDialog, type InstanceUrlConfigWithName } from './components/SubmitTopologyConfirmationDialog';
import { EditTopologyNodeDialog } from './components/EditTopologyNodeDialog';

import type { Node, CustomNodeData, NodeRole, TopologyContextMenu } from './topologyTypes';
import { CardNode, MasterNode, nodeStyles } from './NodeRenderer';
import { ICON_ONLY_NODE_SIZE, EXPANDED_SC_NODE_WIDTH, EXPANDED_SC_NODE_BASE_HEIGHT, DETAIL_LINE_HEIGHT } from './topologyTypes';
import { calculateClientTunnelAddressForServer } from './topologyLogic';
import { useIsMobile } from '@/hooks/use-mobile';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';


const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

const MIN_MASTER_NODE_HEIGHT = 120;
const MIN_MASTER_NODE_WIDTH = 200;
const M_NODE_SCALE_FACTOR_PER_CHILD = 1.2;

const initialActiveHandles = {
  S: { top: true, bottom: true, left: false, right: false },
  C: { top: true, bottom: true, left: false, right: false },
  U: { top: false, bottom: true, left: false, right: false },
  T: { top: true, bottom: false, left: false, right: false },
  M: { top: true, bottom: true, left: true, right: true },
};

export function AdvancedTopologyEditor() {
  const { deleteElements, fitView, getNodes, getEdges, setEdges: setReactFlowEdges, project } = useReactFlow();
  const [nodesInternal, setNodesInternal, onNodesChangeInternalCallback] = useNodesState<Node>(initialNodes);
  const [edgesInternal, setEdgesInternal, onEdgesChangeInternal] = useEdgesState(initialEdges);
  const [nodeIdCounter, setNodeIdCounter] = useState(0);
  const { toast } = useToast();
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<TopologyContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const { apiConfigsList, getApiConfigById, getApiRootUrl, getToken, activeApiConfig } = useApiConfig();
  const queryClient = useQueryClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingCounts, setIsRefreshingCounts] = useState(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [instancesForConfirmation, setInstancesForConfirmation] = useState<InstanceUrlConfigWithName[]>([]);
  const [isEditNodeDialogOpen, setIsEditNodeDialogOpen] = useState(false);

  const [editingNodeContext, setEditingNodeContext] = useState<{
    node: Node;
    hasS: boolean;
    isInterMasterLink: boolean;
    sourceInfo?: { serverTunnelAddress: string; };
  } | null>(null);

  const handshakeLogRegex = /Tunnel handshaked:.*?in\s+(\d+)\s*ms/i;
  const sseHandshakeAbortControllerRef = useRef<AbortController | null>(null);

  const isMobile = useIsMobile();
  const [showMobileInfoAlert, setShowMobileInfoAlert] = useState(true);
  const [isPaletteDrawerOpen, setIsPaletteDrawerOpen] = useState(false);


  const updateMasterNodeDimensions = useCallback((masterNodeId: string, currentNodes: Node[]): Node[] => {
    const masterNode = currentNodes.find(n => n.id === masterNodeId);
    if (!masterNode || !masterNode.data.isContainer || masterNode.data.role !== 'M') {
      return currentNodes;
    }

    const children = currentNodes.filter(n => n.parentNode === masterNodeId);
    const numChildren = children.length;

    let newWidth: number;
    let newHeight: number;

    if (numChildren === 0) {
      newWidth = MIN_MASTER_NODE_WIDTH;
      newHeight = MIN_MASTER_NODE_HEIGHT;
    } else {
      newWidth = MIN_MASTER_NODE_WIDTH * Math.pow(M_NODE_SCALE_FACTOR_PER_CHILD, numChildren);
      newHeight = MIN_MASTER_NODE_HEIGHT * Math.pow(M_NODE_SCALE_FACTOR_PER_CHILD, numChildren);
    }

    newWidth = Math.round(newWidth);
    newHeight = Math.round(newHeight);

    if (masterNode.width === newWidth && masterNode.height === newHeight) {
      return currentNodes;
    }

    const updatedMasterNode = {
      ...masterNode,
      width: newWidth,
      height: newHeight,
      style: { ...masterNode.style, width: newWidth, height: newHeight },
    };

    return currentNodes.map(n => (n.id === masterNodeId ? updatedMasterNode : n));
  }, []);

 const getOptimalHandlesForConnection = useCallback((sourceNode: Node, targetNode: Node): { sourceHandle: string, targetHandle: string } => {
    let sh: Position, th: Position;

    const dy = (targetNode.positionAbsolute!.y + (targetNode.height! / 2)) -
               (sourceNode.positionAbsolute!.y + (sourceNode.height! / 2));

    if (dy >= 0) {
        sh = Position.Bottom;
        th = Position.Top;
    } else {
        sh = Position.Top;
        th = Position.Bottom;
    }

    if (sourceNode.data.role === 'U') {
        sh = Position.Bottom;
        if (targetNode.data.role === 'S' || targetNode.data.role === 'C') {
            th = Position.Top;
        }
    }
    if (targetNode.data.role === 'T') {
        th = Position.Top;
        if (sourceNode.data.role === 'S' || sourceNode.data.role === 'C') {
             if (dy >= 0) {
                sh = Position.Bottom;
            } else {
                sh = Position.Top;
            }
        }
    }

    if (sourceNode.data.role === 'U' && targetNode.data.role === 'T') {
        sh = Position.Bottom;
        th = Position.Top;
    }

    return { sourceHandle: sh, targetHandle: th };
  }, []);


  const updateAffectedNodeHandles = useCallback((nodeId: string, currentNodes: Node[], currentEdges: Edge[]): Node[] => {
    return currentNodes.map(n => {
      if (n.id === nodeId && (n.data.role === 'U' || n.data.role === 'T' || n.data.role === 'S' || n.data.role === 'C')) {
        const connectedEdges = currentEdges.filter(edge => edge.source === n.id || edge.target === n.id);
        const relevantConnections = connectedEdges.filter(edge => {
            const otherNodeId = edge.source === n.id ? edge.target : edge.source;
            const otherNode = currentNodes.find(cn => cn.id === otherNodeId);
            return otherNode && (otherNode.data.role === 'U' || otherNode.data.role === 'T' || otherNode.data.role === 'S' || otherNode.data.role === 'C');
        });

        let newActiveHandles = { ...initialActiveHandles[n.data.role as keyof typeof initialActiveHandles] };

        if (relevantConnections.length === 0) {
          // No change from initialActiveHandles
        } else if (n.data.role === 'U') {
            newActiveHandles = { top: false, bottom: true, left: false, right: false };
        } else if (n.data.role === 'T') {
            newActiveHandles = { top: true, bottom: false, left: false, right: false };
        } else if (n.data.role === 'S' || n.data.role === 'C') {
            newActiveHandles = { top: true, bottom: true, left: false, right: false };
        }

        newActiveHandles.left = false;
        newActiveHandles.right = false;

        return { ...n, data: { ...n.data, activeHandles: newActiveHandles } };
      }
      return n;
    });
  }, []);

  const handleOpenEditNodeDialog = useCallback((node: Node) => {
    setContextMenu(null);

    const allNodes = getNodes();
    const allEdges = getEdges();

    let hasS = false;
    let isInterMaster = false;
    let sourceInfo: { serverTunnelAddress: string } | undefined = undefined;

    if (node.data.role === 'C') {
        const targetParentNode = allNodes.find(n => n.id === node.parentNode);

        if (targetParentNode) {
            hasS = allNodes.some(n => n.parentNode === targetParentNode.id && n.data.role === 'S');
        }

        const incomingEdgeToC = allEdges.find(edge => edge.target === node.id && allNodes.find(n=> n.id === edge.source)?.data.role === 'S');
        if (incomingEdgeToC) {
            const sourceSNode = allNodes.find(n => n.id === incomingEdgeToC.source)!;
            const sourceParentNode = sourceSNode.parentNode ? allNodes.find(n => n.id === sourceSNode.parentNode) : undefined;
            const cNodeParentNode = node.parentNode ? allNodes.find(n => n.id === node.parentNode) : undefined;

            if (sourceParentNode && cNodeParentNode && sourceParentNode.data.masterId !== cNodeParentNode.data.masterId) {
                isInterMaster = true;
                const sourceMasterConfig = getApiConfigById(sourceParentNode.data.masterId!);
                const newClientTunnelAddress = calculateClientTunnelAddressForServer(sourceSNode.data, sourceMasterConfig);
                if (newClientTunnelAddress && newClientTunnelAddress.trim() !== "") {
                    sourceInfo = { serverTunnelAddress: newClientTunnelAddress };
                } else {
                    toast({ title: 'Unable to determine tunnel address', description: 'Failed to automatically calculate the tunnel address of the source S node.', variant: "warning" });
                }
            }
        } else {
            const outgoingEdgeFromC = allEdges.find(edge => edge.source === node.id && allNodes.find(n => n.id === edge.target)?.data.role === 'S');
            if (outgoingEdgeFromC) {
                 const targetSNode = allNodes.find(n => n.id === outgoingEdgeFromC.target)!;
                 const targetParentNode = targetSNode.parentNode ? allNodes.find(n => n.id === targetSNode.parentNode) : undefined;
                 const cNodeParentNode = node.parentNode ? allNodes.find(n => n.id === node.parentNode) : undefined;

                 if(targetParentNode && cNodeParentNode && targetParentNode.data.masterId !== cNodeParentNode.data.masterId) {
                    isInterMaster = true;
                    const targetMasterConfig = getApiConfigById(targetParentNode.data.masterId!);
                    const newClientTunnelAddress = calculateClientTunnelAddressForServer(targetSNode.data, targetMasterConfig);
                    if (newClientTunnelAddress && newClientTunnelAddress.trim() !== "") {
                        sourceInfo = { serverTunnelAddress: newClientTunnelAddress };
                    } else {
                         toast({ title: 'Unable to determine tunnel address', description: 'Failed to automatically calculate the tunnel address of the target S node.', variant: "warning" });
                    }
                 }
            }
        }
    }

    setEditingNodeContext({
        node,
        hasS,
        isInterMasterLink: isInterMaster,
        sourceInfo: sourceInfo,
    });
    setIsEditNodeDialogOpen(true);
  }, [getNodes, getEdges, getApiConfigById, toast]);

  const handleDeleteNode = useCallback((nodeToDelete: Node) => {
    const parentId = nodeToDelete.parentNode;
    const edgesToRemove = getEdges().filter(edge => edge.source === nodeToDelete.id || edge.target === nodeToDelete.id);
    const nodeIdsToUpdateHandles = new Set<string>();
    edgesToRemove.forEach(edge => {
        if (edge.source !== nodeToDelete.id) nodeIdsToUpdateHandles.add(edge.source);
        if (edge.target !== nodeToDelete.id) nodeIdsToUpdateHandles.add(edge.target);
    });

    deleteElements({ nodes: [{ id: nodeToDelete.id }], edges: edgesToRemove });
    toast({ title: `Node "${nodeToDelete.data.label || nodeToDelete.id}" deleted` });

    setContextMenu(null);

    setNodesInternal(prevNodes => {
        let currentNodes = prevNodes.filter(n => n.id !== nodeToDelete.id);
        if (parentId) {
            currentNodes = updateMasterNodeDimensions(parentId, currentNodes);
        }
        nodeIdsToUpdateHandles.forEach(nodeId => {
            currentNodes = updateAffectedNodeHandles(nodeId, currentNodes, getEdges());
        });
        return currentNodes;
    });
  }, [getEdges, deleteElements, toast, setNodesInternal, updateMasterNodeDimensions, updateAffectedNodeHandles]);


  const memoizedNodeTypes = useMemo(() => ({
    cardNode: (props: NodeProps<CustomNodeData>) => (
      <CardNode
        {...props}
        onEditRequest={handleOpenEditNodeDialog}
        onDeleteRequest={handleDeleteNode}
      />
    ),
    masterNode: MasterNode,
  }), [handleOpenEditNodeDialog, handleDeleteNode]);

  const onNodesChangeInternal: OnNodesChange = useCallback((changes: NodeChange[]) => {
    setNodesInternal((nds) => {
      const appliedChanges = applyNodeChanges(changes, nds);
      let finalNodes = appliedChanges;

      const parentIdsToUpdate = new Set<string>();
      let nodesMoved = false;
      const movedNodeIds = new Set<string>();

      changes.forEach(change => {
        if (change.type === 'remove') {
          const removedNode = nds.find(n => n.id === change.id);
          if (removedNode && removedNode.parentNode) {
            parentIdsToUpdate.add(removedNode.parentNode);
          }
        } else if (change.type === 'add' && change.item.parentNode) {
            parentIdsToUpdate.add(change.item.parentNode);
        } else if (change.type === 'dimensions' && change.dragging === false) {
            const changedNode = finalNodes.find(n => n.id === change.id);
            if (changedNode && (changedNode.data.role === 'U' || changedNode.data.role === 'T' || changedNode.data.role === 'S' || changedNode.data.role === 'C')) {
                nodesMoved = true;
                movedNodeIds.add(change.id);
            }
             if (changedNode && changedNode.parentNode) {
                 parentIdsToUpdate.add(changedNode.parentNode);
            }
        } else if (change.type === 'position' && change.dragging === false && change.positionAbsolute) {
            const movedNode = finalNodes.find(n => n.id === change.id);
            if (movedNode && (movedNode.data.role === 'U' || movedNode.data.role === 'T' || movedNode.data.role === 'S' || movedNode.data.role === 'C')) {
                nodesMoved = true;
                movedNodeIds.add(change.id);
            }
        }
      });

      parentIdsToUpdate.forEach(parentId => {
        finalNodes = updateMasterNodeDimensions(parentId, finalNodes);
      });

      if (nodesMoved) {
        let currentEdges = getEdges();
        const edgesToUpdate: Edge[] = [];
        const affectedNodeIdsForHandleUpdate = new Set<string>(movedNodeIds);

        currentEdges.forEach(edge => {
          const sourceNode = finalNodes.find(n => n.id === edge.source);
          const targetNode = finalNodes.find(n => n.id === edge.target);

          if (sourceNode && targetNode && (movedNodeIds.has(sourceNode.id) || movedNodeIds.has(targetNode.id)) &&
              (sourceNode.data.role === 'U' || sourceNode.data.role === 'T' || sourceNode.data.role === 'S' || sourceNode.data.role === 'C') &&
              (targetNode.data.role === 'U' || targetNode.data.role === 'T' || targetNode.data.role === 'S' || targetNode.data.role === 'C')) {

            const { sourceHandle, targetHandle } = getOptimalHandlesForConnection(sourceNode, targetNode);
            if (edge.sourceHandle !== sourceHandle || edge.targetHandle !== targetHandle) {
              edgesToUpdate.push({ ...edge, sourceHandle, targetHandle });
            }
            affectedNodeIdsForHandleUpdate.add(sourceNode.id);
            affectedNodeIdsForHandleUpdate.add(targetNode.id);
          }
        });

        if (edgesToUpdate.length > 0) {
          setReactFlowEdges(eds => eds.map(ed => edgesToUpdate.find(uEd => uEd.id === ed.id) || ed));
          currentEdges = getEdges();
        }

        affectedNodeIdsForHandleUpdate.forEach(nodeId => {
            finalNodes = updateAffectedNodeHandles(nodeId, finalNodes, currentEdges);
        });
      }
      return finalNodes;
    });
  }, [setNodesInternal, updateMasterNodeDimensions, getEdges, setReactFlowEdges, getOptimalHandlesForConnection, updateAffectedNodeHandles]);


  const setEdgesAndUpdateHandles = useCallback((newEdges: Edge[] | ((prevEdges: Edge[]) => Edge[])) => {
    const resolvedEdges = typeof newEdges === 'function' ? newEdges(getEdges()) : newEdges;
    setEdgesInternal(resolvedEdges);

    setNodesInternal(nds => {
        let finalNodes = [...nds];
        const allNodeIdsInvolvedInEdges = new Set<string>();
        resolvedEdges.forEach(edge => {
            allNodeIdsInvolvedInEdges.add(edge.source);
            allNodeIdsInvolvedInEdges.add(edge.target);
        });

        const currentEdgeNodeIds = new Set<string>();
         getEdges().forEach(edge => {
            currentEdgeNodeIds.add(edge.source);
            currentEdgeNodeIds.add(edge.target);
        });

        const nodesToPotentiallyResetHandles = new Set([...allNodeIdsInvolvedInEdges, ...currentEdgeNodeIds]);

        nodesToPotentiallyResetHandles.forEach(nodeId => {
           finalNodes = updateAffectedNodeHandles(nodeId, finalNodes, resolvedEdges);
        });
        return finalNodes;
    });

  }, [setEdgesInternal, setNodesInternal, updateAffectedNodeHandles, getEdges]);


  const createInstanceMutation = useMutation({
    mutationFn: (params: { data: { url: string }, useApiRoot: string, useApiToken: string, originalNodeId: string }) => {
      return nodePassApi.createInstance(params.data, params.useApiRoot, params.useApiToken);
    },
    onMutate: (variables) => {
      setNodesInternal(nds => nds.map(n => {
        if (n.id === variables.originalNodeId) {
          return { ...n, data: { ...n.data, submissionStatus: 'pending', submissionMessage: 'Submitting...' } };
        }
        return n;
      }));
    },
    onSuccess: (createdInstance, variables) => {
      toast({ title: `Instance creation request succeeded`, description: `Node ${variables.originalNodeId.substring(0,8)}... -> ID: ${createdInstance.id.substring(0,8)}...` });
      setNodesInternal(nds => nds.map(n => {
         if (n.id === variables.originalNodeId) {
            return { ...n, data: { ...n.data, submissionStatus: 'success', submissionMessage: `ID: ${createdInstance.id.substring(0,8)}...`, originalInstanceId: createdInstance.id, originalInstanceUrl: variables.data.url } };
        }
        return n;
      }));
      const submittedInstanceInfo = instancesForConfirmation.find(inst => inst.nodeId === variables.originalNodeId && inst.url === variables.data.url);
      if (submittedInstanceInfo) {
        queryClient.invalidateQueries({ queryKey: ['instances', submittedInstanceInfo.masterId]});
        queryClient.invalidateQueries({ queryKey: ['masterInstancesCount', submittedInstanceInfo.masterId]});
      }
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTopologyPage']});
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']});
    },
    onError: (error: any, variables) => {
      toast({ title: `Instance creation failed (Node ${variables.originalNodeId.substring(0,8)}...)`, description: error.message || 'Unknown error', variant: 'destructive' });
      setNodesInternal(nds => nds.map(n => {
        if (n.id === variables.originalNodeId) {
           return { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: error.message.substring(0,30) || 'Failed' } };
        }
        return n;
      }));
    },
  });

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      const allCurrentNodes = getNodes();
      const allCurrentEdges = getEdges();
      const sourceNode = allCurrentNodes.find(n => n.id === params.source!);
      const targetNode = allCurrentNodes.find(n => n.id === params.target!);

      if (!sourceNode || !targetNode) {
        toast({ title: 'Connection error', description: 'Source node or target node not found.', variant: 'destructive' });
        return;
      }
      if (params.source === params.target) {
        toast({ title: 'Invalid connection', description: 'A node cannot connect to itself.', variant: 'destructive' });
        return;
      }
      if (allCurrentEdges.some(edge => (edge.source === params.source && edge.target === params.target) || (edge.source === params.target && edge.target === params.source))) {
        toast({ title: 'Connection exists', description: 'A connection already exists between these two nodes.', variant: 'destructive' });
        return;
      }

      const sourceRole = sourceNode.data.role;
      const targetRole = targetNode.data.role;

      if (sourceRole === 'M' || targetRole === 'M') {
          toast({ title: 'Invalid connection', description: 'Master (M) nodes are containers and cannot connect directly. Please connect their internal S/C nodes.', variant: 'destructive'});
          return;
      }
      if (targetRole === 'U') {
        toast({ title: 'Invalid connection', description: 'User Entry (U) nodes cannot be connected by other nodes.', variant: 'destructive' });
        return;
      }
      if (sourceRole === 'T') {
        toast({ title: 'Invalid connection', description: 'Target Service (T) nodes cannot be connection sources.', variant: 'destructive' });
        return;
      }
      if (sourceRole === 'U' && !(targetRole === 'S' || targetRole === 'C')) {
        toast({ title: 'Invalid connection', description: 'User Entry (U) nodes can only connect to Server (S) or Client (C) nodes.', variant: 'destructive' });
        return;
      }
      if (targetRole === 'T' && !(sourceRole === 'S' || sourceRole === 'C')) {
         toast({ title: 'Invalid connection', description: 'Target Service (T) nodes can only be connected by Server (S) or Client (C) nodes.', variant: 'destructive'});
         return;
      }
      if (sourceRole === 'S' && !(targetRole === 'C' || targetRole === 'T')) {
         toast({ title: 'Invalid connection', description: 'Server (S) nodes can only connect to Client (C) or Target Service (T).', variant: 'destructive'});
         return;
      }
      if (sourceRole === 'C' && !(targetRole === 'S' || targetRole === 'C' || targetRole === 'T')) {
         toast({ title: 'Invalid connection', description: 'Client (C) nodes can only connect to Server (S), Client (C), or Target Service (T).', variant: 'destructive'});
         return;
      }

      if (sourceRole === 'U' && allCurrentEdges.some(edge => edge.source === sourceNode.id)) {
        toast({ title: 'Invalid connection', description: 'User Entry (U) nodes can only have one outgoing connection.', variant: 'destructive' });
        return;
      }
      if (targetRole === 'T' && allCurrentEdges.some(edge => edge.target === targetNode.id)) {
        toast({ title: 'Invalid connection', description: 'Target Service (T) nodes can only have one incoming connection.', variant: 'destructive' });
        return;
      }

      const { sourceHandle, targetHandle } = getOptimalHandlesForConnection(sourceNode, targetNode);

      const newEdgeBase: Edge = {
        ...params,
        sourceHandle,
        targetHandle,
        id: `edge-${uuidv4()}`,
        style: { strokeWidth: 3.5 },
        markerEnd: { type: MarkerType.ArrowClosed },
        type: 'smoothstep',
      };

      if (sourceRole === 'S' && targetRole === 'C') {
        newEdgeBase.animated = true;
        newEdgeBase.style!.strokeDasharray = '5 5';
        newEdgeBase.style!.stroke = 'hsl(var(--primary))';
      } else if (sourceRole === 'C' && targetRole === 'S') {
        newEdgeBase.animated = true;
        newEdgeBase.style!.strokeDasharray = '5 5';
        newEdgeBase.style!.stroke = 'hsl(var(--accent))';
      } else if (
        (sourceRole === 'U' && (targetRole === 'S' || targetRole === 'C')) ||
        ((sourceRole === 'S' || sourceRole === 'C') && targetRole === 'T')
      ) {
        newEdgeBase.animated = true;
        newEdgeBase.style!.stroke = 'hsl(var(--chart-4))';
      } else {
        newEdgeBase.animated = false;
        newEdgeBase.style!.stroke = 'hsl(var(--muted-foreground))';
      }


      let nodesToUpdateForAddress: Node[] = [];
      let clientNodeForUpdate: Node | null = null;
      let serverNodeForClientConfig: Node | null = null;

      if (sourceNode.data.role === 'S' && targetNode.data.role === 'C') {
        serverNodeForClientConfig = sourceNode;
        clientNodeForUpdate = targetNode;
      } else if (sourceNode.data.role === 'C' && targetNode.data.role === 'S') {
        clientNodeForUpdate = sourceNode;
        serverNodeForClientConfig = targetNode;
      }

      if (clientNodeForUpdate && serverNodeForClientConfig) {
        const clientParentNode = allCurrentNodes.find(n => n.id === clientNodeForUpdate!.parentNode);
        const serverParentNode = allCurrentNodes.find(n => n.id === serverNodeForClientConfig!.parentNode);

        if (clientParentNode && serverParentNode && clientParentNode.data.masterId !== serverParentNode.data.masterId) {
            const serverMasterConfig = getApiConfigById(serverParentNode.data.masterId!);
            const newClientTunnelAddress = calculateClientTunnelAddressForServer(serverNodeForClientConfig.data, serverMasterConfig);

            if (newClientTunnelAddress && newClientTunnelAddress.trim() !== "") {
                let newClientLocalTargetPort = parseInt(extractPort(serverNodeForClientConfig.data.tunnelAddress || "0") || "0", 10);
                if (newClientLocalTargetPort > 0) newClientLocalTargetPort++; else newClientLocalTargetPort = 3001;
                const newClientTargetAddress = `[::]:${newClientLocalTargetPort.toString()}`;

                nodesToUpdateForAddress = allCurrentNodes.map(n => {
                    if (n.id === clientNodeForUpdate!.id) {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                tunnelAddress: newClientTunnelAddress,
                                targetAddress: newClientTargetAddress,
                                isSingleEndedForwardC: false,
                                tlsMode: n.data.tlsMode || 'master'
                            }
                        };
                    }
                    return n;
                });
                toast({ title: "Cross-master client (C) address auto-updated", description: `Client (C) ${clientNodeForUpdate.data.label} automatically configured to connect to Server (S) ${serverNodeForClientConfig.data.label}.` });
            } else {
                 nodesToUpdateForAddress = allCurrentNodes.map(n => {
                    if (n.id === clientNodeForUpdate!.id) {
                        return {
                          ...n,
                          data: {
                            ...n.data,
                            isSingleEndedForwardC: false,
                            tlsMode: n.data.tlsMode || 'master'
                          }
                        };
                    }
                    return n;
                });
                toast({ title: "Warning: Unable to auto-configure cross-master client (C) address", description: "Failed to compute a valid server tunnel address. Please check the source S node and its master configuration. Client (C) is set to tunnel mode, please manually configure its tunnel address.", variant: "warning" });
            }
        }
      } else if ((sourceNode.data.role === 'S' || sourceNode.data.role === 'C') && targetNode.data.role === 'T') {
        let tNodeUpdated = false;
        let scNodeUpdated = false;
        let tempNodes = [...allCurrentNodes];

        if (sourceNode.data.targetAddress && sourceNode.data.targetAddress.trim() !== "" && sourceNode.data.targetAddress !== targetNode.data.targetAddress) {
            tempNodes = tempNodes.map(n => n.id === targetNode.id ? { ...n, data: { ...n.data, targetAddress: sourceNode.data.targetAddress } } : n);
            tNodeUpdated = true;
        } else if (targetNode.data.targetAddress && targetNode.data.targetAddress.trim() !== "" && targetNode.data.targetAddress !== sourceNode.data.targetAddress) {
            tempNodes = tempNodes.map(n => n.id === sourceNode.id ? { ...n, data: { ...n.data, targetAddress: targetNode.data.targetAddress } } : n);
            scNodeUpdated = true;
        }
        if (tNodeUpdated || scNodeUpdated) nodesToUpdateForAddress = tempNodes;
        if (tNodeUpdated) toast({ title: `Target Service (T) ${targetNode.data.label} synced upstream target address.`});
        if (scNodeUpdated) toast({ title: `${sourceNode.data.label} synced Target Service (T) target address.`});
      }

      if (nodesToUpdateForAddress.length > 0) {
        setNodesInternal(nodesToUpdateForAddress);
        setEdgesAndUpdateHandles((eds) => addEdge(newEdgeBase, eds));
      } else {
        setEdgesAndUpdateHandles((eds) => addEdge(newEdgeBase, eds));
      }
    },
    [getNodes, getEdges, setNodesInternal, setEdgesAndUpdateHandles, toast, getApiConfigById, getOptimalHandlesForConnection]
  );

  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[]; edges: Edge[] }) => {
    if (selectedNodesList.length !== 1) setContextMenu(null);
  }, []);

  const calculateExpandedNodeHeight = (data: CustomNodeData): number => {
    let numDetails = 1;
    if (data.tunnelAddress) numDetails++;
    if (data.targetAddress) numDetails++;
    if (data.submissionStatus) numDetails++;
    return EXPANDED_SC_NODE_BASE_HEIGHT + (numDetails * DETAIL_LINE_HEIGHT) + (data.submissionStatus ? 5 : 0);
  };


  const onNodeClickHandler: NodeMouseHandler = useCallback((event, clickedNode) => {
    setNodesInternal(nds => {
        let parentToUpdate: string | null = null;
        const updatedNodes = nds.map(n => {
            if (n.id === clickedNode.id && (n.data.role === 'S' || n.data.role === 'C' || n.data.role === 'T' || n.data.role === 'U')) {
                const newIsExpanded = !n.data.isExpanded;
                const newWidth = newIsExpanded ? EXPANDED_SC_NODE_WIDTH : ICON_ONLY_NODE_SIZE;
                const newHeight = newIsExpanded ? calculateExpandedNodeHeight(n.data) : ICON_ONLY_NODE_SIZE;
                if (n.parentNode) {
                    parentToUpdate = n.parentNode;
                }
                return {
                    ...n,
                    data: { ...n.data, isExpanded: newIsExpanded },
                    width: newWidth,
                    height: newHeight,
                    style: { ...n.style, width: newWidth, height: newHeight }
                };
            }
            return n;
        });

        if (parentToUpdate) {
            return updateMasterNodeDimensions(parentToUpdate, updatedNodes);
        }
        return updatedNodes;
    });
  }, [setNodesInternal, updateMasterNodeDimensions]);


  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    const bounds = editorContainerRef.current?.getBoundingClientRect();
    const top = event.clientY - (bounds?.top || 0);
    const left = event.clientX - (bounds?.left || 0);
    setContextMenu({ id: node.id, type: 'node', top, left, data: node });
  }, [setContextMenu]);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    const bounds = editorContainerRef.current?.getBoundingClientRect();
    const top = event.clientY - (bounds?.top || 0);
    const left = event.clientX - (bounds?.left || 0);
    setContextMenu({ id: edge.id, type: 'edge', top, left, data: edge });
  }, [setContextMenu]);

 const onPaneClick = useCallback(() => {
    setContextMenu(null);
    let parentsToUpdateDueToCollapse = new Set<string>();

    setNodesInternal(nds => {
      const updatedNodes = nds.map(n => {
        if ((n.data.role === 'S' || n.data.role === 'C' || n.data.role === 'T' || n.data.role === 'U') && n.data.isExpanded) {
          if (n.parentNode) {
            parentsToUpdateDueToCollapse.add(n.parentNode);
          }
          return {
            ...n,
            data: { ...n.data, isExpanded: false },
            width: ICON_ONLY_NODE_SIZE,
            height: ICON_ONLY_NODE_SIZE,
            style: { ...n.style, width: ICON_ONLY_NODE_SIZE, height: ICON_ONLY_NODE_SIZE },
          };
        }
        return n;
      });

      let finalNodesAfterCollapse = updatedNodes;
      parentsToUpdateDueToCollapse.forEach(parentId => {
        finalNodesAfterCollapse = updateMasterNodeDimensions(parentId, finalNodesAfterCollapse);
      });

      return finalNodesAfterCollapse;
    });
  }, [setContextMenu, setNodesInternal, updateMasterNodeDimensions]);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as HTMLElement)) setContextMenu(null);
    };
    if (contextMenu) document.addEventListener('mousedown', handleClickOutside);
    else document.removeEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  const handleNodeDroppedOnCanvas = useCallback((
      type: DraggableNodeType | 'master',
      position: { x: number; y: number },
      draggedData?: NamedApiConfig
  ) => {
      const allCurrentNodes = getNodes();
      let currentCounter = nodeIdCounter;
      let newNodesList: Node[] = [];

      const M_NODE_CHILD_PADDING_VISUAL = 25;

      const parentMContainer = allCurrentNodes.find(n => {
          if (n.data.role !== 'M' || !n.data.isContainer) return false;
          const { x: nodeX, y: nodeY } = n.position;
          const nodeWidth = n.width ?? MIN_MASTER_NODE_WIDTH;
          const nodeHeight = n.height ?? MIN_MASTER_NODE_HEIGHT;
          return (position.x >= nodeX && position.x <= nodeX + nodeWidth && position.y >= nodeY && position.y <= nodeY + nodeHeight);
      });

      if (type === 'master' && draggedData) {
          if (parentMContainer) {
              toast({ title: "Invalid operation", description: "Master (M) nodes cannot be nested inside other master nodes.", variant: "destructive" });
              return;
          }
          const mId = `adv-master-${draggedData.id.substring(0, 8)}-${uuidv4().substring(0,4)}`;
          currentCounter++;
          newNodesList.push({
              id: mId, type: 'masterNode', position,
              data: {
                label: `Master: ${draggedData.name || 'Unnamed'}`, role: 'M', isContainer: true,
                masterId: draggedData.id, masterName: draggedData.name,
                apiUrl: draggedData.apiUrl,
                defaultLogLevel: draggedData.masterDefaultLogLevel,
                defaultTlsMode: draggedData.masterDefaultTlsMode,
                masterSubRole: 'container',
                activeHandles: { ...initialActiveHandles.M }
              },
              style: { ...nodeStyles.m.base, width: MIN_MASTER_NODE_WIDTH, height: MIN_MASTER_NODE_HEIGHT },
              width: MIN_MASTER_NODE_WIDTH, height: MIN_MASTER_NODE_HEIGHT,
          });
          toast({ title: "Master container created" });
          setTimeout(() => { fitView({ nodes: [{id: mId}], duration: 400, padding: 0.2 }); }, 50);
          setNodesInternal(nds => nds.concat(newNodesList));

      } else if (type !== 'master') {
          const nodeRole = type.toUpperCase() as NodeRole;
          const { labelPrefix, icon } = {
              'S': { labelPrefix: 'Server', icon: Server },
              'C': { labelPrefix: 'Client', icon: ClientIcon },
              'T': { labelPrefix: 'Target Service', icon: Globe },
              'U': { labelPrefix: 'User Entry', icon: UserIcon },
          }[nodeRole]!;

          if ((nodeRole === 'S' || nodeRole === 'C') && !parentMContainer) {
              toast({ title: "Invalid operation", description: `${labelPrefix} (${nodeRole}) must be dragged inside a Master (M) container.`, variant: "destructive" });
              return;
          }

          currentCounter++;
          const newNodeId = `${nodeRole.toLowerCase()}-${uuidv4().substring(0,8)}`;
          const newNodeData: CustomNodeData = {
             label: `${labelPrefix} #${currentCounter}`, role: nodeRole, icon,
             logLevel: 'master',
             isExpanded: false,
             activeHandles: { ...initialActiveHandles[nodeRole as keyof typeof initialActiveHandles] },
             tunnelKey: "",
             minPoolSize: undefined,
             maxPoolSize: undefined,
          };

          if (nodeRole === 'S') {
            newNodeData.tunnelAddress = `[::]:${10000 + currentCounter}`;
            newNodeData.targetAddress = `127.0.0.1:${3000 + currentCounter}`;
            newNodeData.tlsMode = parentMContainer?.data.defaultTlsMode || 'master';
            newNodeData.logLevel = parentMContainer?.data.defaultLogLevel || 'master';
          } else if (nodeRole === 'C') {
            newNodeData.isSingleEndedForwardC = false;
            newNodeData.tunnelAddress = `remote-server.example.com:${10000 + currentCounter}`;
            newNodeData.targetAddress = `[::]:${3000 + currentCounter + 1}`;
            newNodeData.logLevel = parentMContainer?.data.defaultLogLevel || 'master';
            newNodeData.tlsMode = 'master';
          } else if (nodeRole === 'T') {
            newNodeData.targetAddress = `192.168.1.20:${8080 + currentCounter}`;
          }

          const newNode: Node = {
            id: newNodeId,
            type: 'cardNode',
            position,
            data: newNodeData,
            width: ICON_ONLY_NODE_SIZE,
            height: ICON_ONLY_NODE_SIZE
          };

          if (parentMContainer && (nodeRole === 'S' || nodeRole === 'C')) {
              newNode.parentNode = parentMContainer.id;
              newNode.extent = 'parent';

              const parentX = parentMContainer.position.x;
              const parentY = parentMContainer.position.y;
              const currentParentWidth = parentMContainer.width || MIN_MASTER_NODE_WIDTH;
              const currentParentHeight = parentMContainer.height || MIN_MASTER_NODE_HEIGHT;

              const relativeX = Math.max(M_NODE_CHILD_PADDING_VISUAL, Math.min(position.x - parentX - (ICON_ONLY_NODE_SIZE / 2), currentParentWidth - ICON_ONLY_NODE_SIZE - M_NODE_CHILD_PADDING_VISUAL));
              const relativeY = Math.max(M_NODE_CHILD_PADDING_VISUAL, Math.min(position.y - parentY - (ICON_ONLY_NODE_SIZE / 2), currentParentHeight - ICON_ONLY_NODE_SIZE - M_NODE_CHILD_PADDING_VISUAL));
              newNode.position = { x: relativeX, y: relativeY };

              setNodesInternal(nds => {
                const nodesWithNewChild = nds.concat([newNode]);
                return updateMasterNodeDimensions(parentMContainer.id, nodesWithNewChild);
              });
              toast({ title: `${labelPrefix} node added to ${parentMContainer.data.label}` });

          } else if (nodeRole === 'U' || nodeRole === 'T') {
              newNodesList.push(newNode);
              setNodesInternal(nds => nds.concat(newNodesList));
              toast({ title: `${labelPrefix} node added` });
          }
      }
      setNodeIdCounter(currentCounter);
  }, [nodeIdCounter, getNodes, toast, setNodesInternal, fitView, updateMasterNodeDimensions]);


  const handleChangeNodeRole = useCallback((nodeId: string, newRole: 'S' | 'C') => {
    setNodesInternal(nds => nds.map(node => {
        if (node.id === nodeId && (node.data.role === 'S' || node.data.role === 'C')) {
            const newLabelPrefix = newRole === 'S' ? 'Server' : 'Client';
            const newIcon = newRole === 'S' ? Server : ClientIcon;
            let newData: CustomNodeData = {
                ...node.data,
                role: newRole,
                icon: newIcon,
                label: `${newLabelPrefix} ${node.data.label.split(' ').pop()}`,
                activeHandles: { ...initialActiveHandles[newRole as keyof typeof initialActiveHandles] }
            };

            if (newRole === 'S') {
                newData.isSingleEndedForwardC = undefined;
                if (!newData.tunnelAddress || newData.tunnelAddress.startsWith("remote")) newData.tunnelAddress = `[::]:${10000 + nodeIdCounter}`;
                if (!newData.targetAddress || newData.targetAddress.startsWith("[")) newData.targetAddress = `127.0.0.1:${3000 + nodeIdCounter}`;
                newData.minPoolSize = undefined;
                newData.maxPoolSize = undefined;
            } else { // C
                newData.isSingleEndedForwardC = false;
                if (!newData.tunnelAddress || newData.tunnelAddress.startsWith("[")) newData.tunnelAddress = `remote.server.com:${10000 + nodeIdCounter}`;
                if (!newData.targetAddress || newData.targetAddress.startsWith("127")) newData.targetAddress = `[::]:${3000 + nodeIdCounter + 1}`;
            }
            return { ...node, data: newData };
        }
        return node;
    }));
    toast({ title: "Role changed" });
    setContextMenu(null);
  }, [setNodesInternal, toast, nodeIdCounter]);


  const handleClearCanvasCallback = useCallback(() => {
    setNodesInternal([]); setEdgesInternal([]); setNodeIdCounter(0); setContextMenu(null);
    toast({ title: 'Canvas cleared' });
  }, [setNodesInternal, setEdgesInternal, toast]);

  const handleCenterViewCallback = useCallback(() => {
    setContextMenu(null);
    fitView({ duration: 300, padding: 0.2 });
  }, [fitView]);

  const handleRefreshAllInstanceCounts = useCallback(async () => {
    setIsRefreshingCounts(true);
    toast({ title: "Refreshing master instance counts...", description: "Please wait." });
    try {
      await queryClient.invalidateQueries({ queryKey: ['masterInstancesCount'] });
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast({ title: "Instance counts refreshed", description: "Instance counts in the master list have been updated." });
    } catch (error) {
      toast({ title: "Refresh failed", description: "An error occurred while refreshing instance counts.", variant: "destructive" });
      console.error("Failed to refresh instance counts:", error);
    } finally {
      setIsRefreshingCounts(false);
    }
  }, [queryClient, toast]);


  const prepareInstancesForSubmission = useCallback((): InstanceUrlConfigWithName[] => {
    const instancesToCreate: InstanceUrlConfigWithName[] = [];
    const allCurrentNodes = getNodes();
    const allCurrentEdges = getEdges();
    const localOnLog = (message: string, type: 'INFO' | 'WARN' | 'ERROR') => {
      if (type === 'ERROR') toast({ title: "Configuration error", description: message, variant: "destructive" });
      if (type === 'WARN') toast({ title: "Configuration warning", description: message, variant: "warning" });
    };

    for (const node of allCurrentNodes) {
        if (node.data.role !== 'S' && node.data.role !== 'C') continue;

        const parentMNode = allCurrentNodes.find(n => n.id === node.parentNode);
        if (!parentMNode || !parentMNode.data.masterId) {
            setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: 'Parent master missing' } } : n));
            continue;
        }
        const masterConfigForNode = getApiConfigById(parentMNode.data.masterId);
        if (!masterConfigForNode) {
            setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: 'Master config not found' } } : n));
            continue;
        }

        let urlParams: BuildUrlParams | null = null;
        const nodeLabelForDialog = node.data.label.replace(/^(Server|Client)\s*/, '').trim();

        if (node.data.role === 'S') {
            const sNode = node;
            const isReverseTunnelForU = allCurrentEdges.some(edgeFromU =>
                allCurrentNodes.find(uNode => uNode.id === edgeFromU.source)?.data.role === 'U' &&
                edgeFromU.target === sNode.id &&
                allCurrentEdges.some(edgeToC =>
                    edgeToC.source === sNode.id &&
                    allCurrentNodes.find(cNode => cNode.id === edgeToC.target)?.data.role === 'C'
                )
            );

            let sTargetAddressForUrl = sNode.data.targetAddress;
            if (isReverseTunnelForU) {
                const sListenPortStr = extractPort(sNode.data.tunnelAddress || "");
                if (sListenPortStr) {
                    const sListenPortNum = parseInt(sListenPortStr, 10);
                    sTargetAddressForUrl = `[::]:${sListenPortNum + 1}`;
                    localOnLog(`U->S->C chain (reverse): Server ${sNode.data.label} target address inferred as ${sTargetAddressForUrl}. C will connect to this S's ${sNode.data.tunnelAddress} and forward to C's own target address.`, 'INFO');
                } else {
                     localOnLog(`Warning: In U->S->C chain (reverse), server ${sNode.data.label} (${sNode.id.substring(0,8)}) listen address (${sNode.data.tunnelAddress}) port could not be parsed. Using configured business target address.`, 'WARN');
                }
            }

            const sSubmission = prepareServerUrlParams({
                instanceType: "Server",
                tunnelAddress: sNode.data.tunnelAddress,
                targetAddress: sTargetAddressForUrl, // Use potentially modified target address
                logLevel: (sNode.data.logLevel as any),
                tlsMode: (sNode.data.tlsMode as any),
                certPath: sNode.data.certPath,
                keyPath: sNode.data.keyPath,
                tunnelKey: sNode.data.tunnelKey,
            }, localOnLog);
            if (sSubmission) urlParams = sSubmission.serverParams;

        } else if (node.data.role === 'C') {
            const cNode = node;
            const cSubmission = prepareClientUrlParams({
                instanceType: "Client",
                isSingleEndedForwardC: !!cNode.data.isSingleEndedForwardC,
                tunnelAddress: cNode.data.tunnelAddress,
                targetAddress: cNode.data.targetAddress,
                logLevel: (cNode.data.logLevel as any),
                tlsMode: (cNode.data.tlsMode as any),
                certPath: cNode.data.certPath,
                keyPath: cNode.data.keyPath,
                tunnelKey: cNode.data.tunnelKey,
                minPoolSize: cNode.data.minPoolSize,
                maxPoolSize: cNode.data.maxPoolSize,
            }, masterConfigForNode, localOnLog);
            if (cSubmission) urlParams = cSubmission.clientParams;
        }


        if (urlParams) {
            const finalUrl = buildUrlFromFormValues(urlParams, masterConfigForNode);
            instancesToCreate.push({
                nodeId: node.id, nodeLabel: nodeLabelForDialog,
                masterId: masterConfigForNode.id, masterName: masterConfigForNode.name,
                url: finalUrl, instanceType: node.data.role === 'S' ? "Server" : "Client",
            });
        } else {
             setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: 'URL params preparation failed' } } : n));
        }
    }
    return instancesToCreate;
  }, [getNodes, getEdges, getApiConfigById, setNodesInternal, toast]);


  const handleTriggerSubmitTopology = useCallback(async () => {
    setContextMenu(null); setIsSubmitting(true);
    if (!activeApiConfig && apiConfigsList.length > 0) {
        toast({ title: "Error", description: "No active API configuration available for connecting event stream. Please place at least one master node on the canvas.", variant: "destructive" });
        setIsSubmitting(false); return;
    }
    const masterForSseCheck = activeApiConfig || apiConfigsList[0];
    if (!masterForSseCheck) {
        toast({ title: "Error", description: "No available API configuration to check event stream connection.", variant: "destructive" });
        setIsSubmitting(false); return;
    }

    const ssePreCheckAbortController = new AbortController(); let sseCheckSuccess = false;
    const checkConnectionPromise = (async () => { try {
        const apiRootForCheck = getApiRootUrl(masterForSseCheck.id); const tokenForCheck = getToken(masterForSseCheck.id);
        if (!apiRootForCheck || !tokenForCheck) throw new Error("API configuration incomplete.");
        const eventsUrl = getEventsUrl(apiRootForCheck); if (!eventsUrl) throw new Error("Unable to generate events URL.");
        const response = await fetch(eventsUrl, { method: 'GET', headers: { 'X-API-Key': tokenForCheck, 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' }, signal: ssePreCheckAbortController.signal, mode: 'cors', credentials: 'omit' });
        if (!response.ok || !response.body) { const errorText = response.statusText || `HTTP error ${response.status}`; throw new Error(errorText); }
        const reader = response.body.getReader(); const { done } = await reader.read(); if (!done) sseCheckSuccess = true;
        if (!ssePreCheckAbortController.signal.aborted) ssePreCheckAbortController.abort("Pre-check complete");
        reader.releaseLock(); if (response.body.locked) await response.body.cancel().catch(e => console.warn("Error cancelling pre-check stream body:", e));
    } catch (error: any) { if (error.name !== 'AbortError') console.warn("SSE Pre-check connection error:", error.message); sseCheckSuccess = false; } })();
    const timeoutPromise = new Promise(resolve => setTimeout(() => { if (!sseCheckSuccess && !ssePreCheckAbortController.signal.aborted) ssePreCheckAbortController.abort("Pre-check timeout"); resolve(null); }, 10000));
    await Promise.race([checkConnectionPromise, timeoutPromise]);
    if (!sseCheckSuccess) { if (!ssePreCheckAbortController.signal.aborted) ssePreCheckAbortController.abort("Pre-check timeout or failure post-race"); toast({ title: "Connection check failed", description: "Failed to connect to master event stream, please check master status or network. Submission cancelled.", variant: "destructive" }); setIsSubmitting(false); return; }

    setNodesInternal(nds => nds.map(n => ({ ...n, data: { ...n.data, submissionStatus: undefined, submissionMessage: undefined } })));
    const instancesToCreate = prepareInstancesForSubmission();
    if (instancesToCreate.length === 0) {
      toast({ title: 'No instances to submit', description: 'Please configure valid Server (S)/Client (C) nodes.' });
      setIsSubmitting(false); return;
    }
    setInstancesForConfirmation(instancesToCreate); setIsSubmitConfirmOpen(true);
  }, [activeApiConfig, apiConfigsList, getApiRootUrl, getToken, toast, prepareInstancesForSubmission, setNodesInternal]);


  const listenForHandshakeViaSSE = useCallback(async (masterForSse: NamedApiConfig, signal: AbortSignal) => {
    const sseApiRoot = getApiRootUrl(masterForSse.id); const sseApiToken = getToken(masterForSse.id);
    if (!sseApiRoot || !sseApiToken) { toast({ title: "SSE Error", description: `Cannot listen for handshake: Master ${masterForSse.name} API config invalid.`, variant: "destructive" }); return; }
    const eventsSSEUrl = getEventsUrl(sseApiRoot); if (!eventsSSEUrl) return;
    try {
        const response = await fetch(eventsSSEUrl, { method: 'GET', headers: { 'X-API-Key': sseApiToken, 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' }, signal, mode: 'cors', credentials: 'omit' });
        if (!response.ok || !response.body) { const errorText = response.statusText || `HTTP error ${response.status}`; throw new Error(errorText); }
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (true) {
            if (signal.aborted) break; const { value, done } = await reader.read(); if (signal.aborted || done) break;
            buffer += decoder.decode(value, { stream: true }); const messageBlocks = buffer.split('\n\n'); buffer = messageBlocks.pop() || '';
            for (const block of messageBlocks) {
                if (signal.aborted) break; if (block.trim() === '') continue;
                let eventName = 'message'; let eventDataStr = ''; const lines = block.split('\n');
                for (const line of lines) { if (line.startsWith('event:')) eventName = line.substring('event:'.length).trim(); else if (line.startsWith('data:')) eventDataStr += line.substring('data:'.length).trimStart(); }
                if (eventName === 'instance' && eventDataStr) { try {
                    const jsonData = JSON.parse(eventDataStr); if (jsonData.type === 'log' && typeof jsonData.logs === 'string') {
                        const match = jsonData.logs.match(handshakeLogRegex); if (match && match[1]) {
                            const latency = match[1]; toast({ title: "✅ Tunnel handshake successful", description: `Latency: ${latency}ms` });
                            if (sseHandshakeAbortControllerRef.current && !sseHandshakeAbortControllerRef.current.signal.aborted) sseHandshakeAbortControllerRef.current.abort("Handshake detected");
                            return; } }
                } catch (e) { console.warn("SSE: Error parsing instance event data:", e, "Raw data:", eventDataStr); } } } }
    } catch (error: any) { if (error.name !== 'AbortError') { console.error("SSE: Handshake listener error:", error); toast({ title: "SSE Listener Error", description: `Error listening for tunnel handshake: ${error.message}`, variant: "destructive" }); }
    } finally { if (sseHandshakeAbortControllerRef.current && sseHandshakeAbortControllerRef.current.signal === signal && !signal.aborted) sseHandshakeAbortControllerRef.current.abort("Listener function completed or errored"); }
  }, [getApiRootUrl, getToken, toast, handshakeLogRegex]);

  const executeActualSubmission = useCallback(async () => {
    setIsSubmitConfirmOpen(false);
    toast({ title: 'Topology submitted', description: `Creating ${instancesForConfirmation.length} instances...` });

    const masterToListenOn = activeApiConfig || apiConfigsList[0];
    if (masterToListenOn) {
        if (sseHandshakeAbortControllerRef.current && !sseHandshakeAbortControllerRef.current.signal.aborted) sseHandshakeAbortControllerRef.current.abort("New submission handshake listener starting");
        const newAbortController = new AbortController(); sseHandshakeAbortControllerRef.current = newAbortController;
        listenForHandshakeViaSSE(masterToListenOn, newAbortController.signal);
        setTimeout(() => { if (newAbortController && !newAbortController.signal.aborted) { if (newAbortController.signal.reason !== "Handshake detected") toast({ title: "Listening timeout", description: "No tunnel handshake event detected within 25 seconds. Please check Master logs.", variant: "default" }); newAbortController.abort("Handshake listener timeout"); if (sseHandshakeAbortControllerRef.current === newAbortController) sseHandshakeAbortControllerRef.current = null; } }, 25000);
    }

    const submissionPromises = instancesForConfirmation.map(inst => {
      const apiR = getApiRootUrl(inst.masterId); const apiT = getToken(inst.masterId);
      if (!apiR || !apiT) { setNodesInternal(nds => nds.map(n => n.id === inst.nodeId ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: 'Master API invalid' } } : n)); return Promise.reject(new Error(`Master ${inst.masterName} API config invalid.`)); }
      return createInstanceMutation.mutateAsync({ data: { url: inst.url }, useApiRoot: apiR, useApiToken: apiT, originalNodeId: inst.nodeId });
    });
    try { await Promise.allSettled(submissionPromises); } catch (e) { console.error("Topology submission error:", e); toast({ title: 'Unexpected error during topology submission', variant: 'destructive' }); } finally { setIsSubmitting(false); }
  }, [instancesForConfirmation, getApiRootUrl, getToken, toast, createInstanceMutation, setNodesInternal, activeApiConfig, apiConfigsList, listenForHandshakeViaSSE]);

  useEffect(() => { return () => { if (sseHandshakeAbortControllerRef.current && !sseHandshakeAbortControllerRef.current.signal.aborted) { sseHandshakeAbortControllerRef.current.abort("Component unmounting"); sseHandshakeAbortControllerRef.current = null; } }; }, []);

  const handleSaveNodeProperties = useCallback((nodeId: string, updatedDataFromDialog: Partial<CustomNodeData>) => {
    const allCurrentNodes = getNodes();
    let newNodes = [...allCurrentNodes];
    const nodeIndex = newNodes.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) return;

    const originalNodeDataFromState = newNodes[nodeIndex].data;
    let mergedData = { ...originalNodeDataFromState, ...updatedDataFromDialog };

    if (mergedData.role === 'C') {
        const clientNode = newNodes[nodeIndex];
        const clientParentNode = allCurrentNodes.find(n => n.id === clientNode.parentNode);
        let isInterMasterLinkForThisC = false;

        const incomingEdgeToC = getEdges().find(edge => edge.target === clientNode.id && allCurrentNodes.find(n => n.id === edge.source)?.data.role === 'S');
        if (incomingEdgeToC) {
            const sourceSNode = allCurrentNodes.find(n => n.id === incomingEdgeToC.source)!;
            const sourceSParentNode = allCurrentNodes.find(n => n.id === sourceSNode.parentNode);
            if(clientParentNode && sourceSParentNode && clientParentNode.data.masterId !== sourceSParentNode.data.masterId) {
                isInterMasterLinkForThisC = true;
            }
        } else {
            const outgoingEdgeFromC = getEdges().find(edge => edge.source === clientNode.id && allCurrentNodes.find(n => n.id === edge.target)?.data.role === 'S');
            if (outgoingEdgeFromC) {
                const targetSNode = allCurrentNodes.find(n => n.id === outgoingEdgeFromC.target)!;
                const targetSParentNode = allCurrentNodes.find(n => n.id === targetSNode.parentNode);
                if (clientParentNode && targetSParentNode && clientParentNode.data.masterId !== targetSParentNode.data.masterId) {
                    isInterMasterLinkForThisC = true;
                }
            }
        }

        if (isInterMasterLinkForThisC) {
            mergedData.isSingleEndedForwardC = false;
        }
    }

    newNodes[nodeIndex] = { ...newNodes[nodeIndex], data: mergedData };
    const editedNode = newNodes[nodeIndex];

    if (editedNode.data.role === 'S' || editedNode.data.role === 'C' || editedNode.data.role === 'T' || editedNode.data.role === 'U') {
        const isExpanded = !!editedNode.data.isExpanded;
        newNodes[nodeIndex].width = isExpanded ? EXPANDED_SC_NODE_WIDTH : ICON_ONLY_NODE_SIZE;
        newNodes[nodeIndex].height = isExpanded ? calculateExpandedNodeHeight(editedNode.data) : ICON_ONLY_NODE_SIZE;
        newNodes[nodeIndex].style = { ...newNodes[nodeIndex].style, width: newNodes[nodeIndex].width, height: newNodes[nodeIndex].height };
    }


    if (editedNode.data.role === 'S') {
        getEdges().forEach(edge => {
            if (edge.source === editedNode.id) {
                const clientNodeIndex = newNodes.findIndex(n => n.id === edge.target && n.data.role === 'C');
                if (clientNodeIndex !== -1) {
                    const clientNode = newNodes[clientNodeIndex];
                    const serverParentMNode = allCurrentNodes.find(n => n.id === editedNode.parentNode);
                    const clientParentMNode = allCurrentNodes.find(n => n.id === clientNode.parentNode);

                    if (serverParentMNode && clientParentMNode && serverParentMNode.data.masterId !== clientParentMNode.data.masterId) {
                        const serverMasterConfig = getApiConfigById(serverParentMNode.data.masterId!);
                        if (serverMasterConfig) {
                            const newClientTunnelAddr = calculateClientTunnelAddressForServer(editedNode.data, serverMasterConfig);
                            if (newClientTunnelAddr && newClientTunnelAddr.trim() !== "" && newClientTunnelAddr !== clientNode.data.tunnelAddress) {
                                let newClientLocalTargetPort = parseInt(extractPort(editedNode.data.tunnelAddress || "0") || "0", 10);
                                if (newClientLocalTargetPort > 0) newClientLocalTargetPort++; else newClientLocalTargetPort = 3001;
                                const newClientTargetAddress = `[::]:${newClientLocalTargetPort.toString()}`;

                                newNodes[clientNodeIndex] = {
                                    ...clientNode,
                                    data: {
                                        ...clientNode.data,
                                        tunnelAddress: newClientTunnelAddr,
                                        targetAddress: newClientTargetAddress,
                                        isSingleEndedForwardC: false,
                                        tlsMode: clientNode.data.tlsMode || 'master'
                                    }
                                };
                                toast({ title: `Cross-master client (C) ${clientNode.data.label} address auto-updated.` });
                            } else if (!newClientTunnelAddr || newClientTunnelAddr.trim() === "") {
                                toast({ title: `Warning: Could not recalculate tunnel address for client (C) ${clientNode.data.label} after server (S) update.`, variant: "warning" });
                            }
                        }
                    }
                }
            }
            else if (edge.target === editedNode.id) {
                const clientNodeIndex = newNodes.findIndex(n => n.id === edge.source && n.data.role === 'C');
                 if (clientNodeIndex !== -1) {
                    const clientNode = newNodes[clientNodeIndex];
                    const serverParentMNode = allCurrentNodes.find(n => n.id === editedNode.parentNode);
                    const clientParentMNode = allCurrentNodes.find(n => n.id === clientNode.parentNode);

                    if (serverParentMNode && clientParentMNode && serverParentMNode.data.masterId !== clientParentMNode.data.masterId) {
                        const serverMasterConfig = getApiConfigById(serverParentMNode.data.masterId!);
                        if (serverMasterConfig) {
                            const newClientTunnelAddr = calculateClientTunnelAddressForServer(editedNode.data, serverMasterConfig);
                            if (newClientTunnelAddr && newClientTunnelAddr.trim() !== "" && newClientTunnelAddr !== clientNode.data.tunnelAddress) {
                                let newClientLocalTargetPort = parseInt(extractPort(editedNode.data.tunnelAddress || "0") || "0", 10);
                                if (newClientLocalTargetPort > 0) newClientLocalTargetPort++; else newClientLocalTargetPort = 3001;
                                const newClientTargetAddress = `[::]:${newClientLocalTargetPort.toString()}`;

                                newNodes[clientNodeIndex] = {
                                    ...clientNode,
                                    data: {
                                        ...clientNode.data,
                                        tunnelAddress: newClientTunnelAddr,
                                        targetAddress: newClientTargetAddress,
                                        isSingleEndedForwardC: false,
                                        tlsMode: clientNode.data.tlsMode || 'master'
                                    }
                                };
                                toast({ title: `Cross-master client (C) ${clientNode.data.label} address auto-updated.` });
                            } else if (!newClientTunnelAddr || newClientTunnelAddr.trim() === "") {
                                toast({ title: `Warning: Could not recalculate tunnel address for client (C) ${clientNode.data.label} after server (S) update.`, variant: "warning" });
                            }
                        }
                    }
                }
            }
        });
    } else if ((editedNode.data.role === 'S' || editedNode.data.role === 'C')) {
        getEdges().forEach(edge => {
            if (edge.source === editedNode.id) {
                const targetTNodeIndex = newNodes.findIndex(n => n.id === edge.target && n.data.role === 'T');
                if (targetTNodeIndex !== -1 && editedNode.data.targetAddress !== newNodes[targetTNodeIndex].data.targetAddress) {
                    newNodes[targetTNodeIndex] = { ...newNodes[targetTNodeIndex], data: { ...newNodes[targetTNodeIndex].data, targetAddress: editedNode.data.targetAddress }};
                    if (originalNodeDataFromState.targetAddress !== editedNode.data.targetAddress) {
                        toast({ title: `Target Service (T) ${newNodes[targetTNodeIndex].data.label} synced target address.`});
                    }
                }
            }
        });
    } else if (editedNode.data.role === 'T') {
        getEdges().forEach(edge => {
            if (edge.target === editedNode.id) {
                const sourceNodeIndex = newNodes.findIndex(n => n.id === edge.source && (n.data.role === 'S' || n.data.role === 'C'));
                if (sourceNodeIndex !== -1 && editedNode.data.targetAddress !== newNodes[sourceNodeIndex].data.targetAddress) {
                     newNodes[sourceNodeIndex] = { ...newNodes[sourceNodeIndex], data: { ...newNodes[sourceNodeIndex].data, targetAddress: editedNode.data.targetAddress }};
                     if (originalNodeDataFromState.targetAddress !== editedNode.data.targetAddress) {
                       toast({ title: `${newNodes[sourceNodeIndex].data.label} synced Target Service (T) target address.`});
                     }
                }
            }
        });
    }

    let finalNodesAfterSave = newNodes;
    if (editedNode.data.role === 'M' && editedNode.data.isContainer) {
      finalNodesAfterSave = updateMasterNodeDimensions(editedNode.id, finalNodesAfterSave);
    } else if (editedNode.parentNode) {
      finalNodesAfterSave = updateMasterNodeDimensions(editedNode.parentNode!, finalNodesAfterSave);
    }

    const affectedNodeIdsForHandleUpdate = new Set<string>([nodeId]);
     getEdges().forEach(edge => {
        if(edge.source === nodeId) affectedNodeIdsForHandleUpdate.add(edge.target);
        if(edge.target === nodeId) affectedNodeIdsForHandleUpdate.add(edge.source);
    });

    affectedNodeIdsForHandleUpdate.forEach(idToUpdateHandles => {
        finalNodesAfterSave = updateAffectedNodeHandles(idToUpdateHandles, finalNodesAfterSave, getEdges());
    });

    setNodesInternal(finalNodesAfterSave);

    toast({ title: `Node "${mergedData.label || nodeId.substring(0,8)}" properties updated`});
    setIsEditNodeDialogOpen(false); setEditingNodeContext(null);
  }, [getNodes, getEdges, setNodesInternal, toast, getApiConfigById, updateMasterNodeDimensions, updateAffectedNodeHandles]);

  const handleDeleteEdge = (edgeToDelete: Edge) => {
    const sourceNodeId = edgeToDelete.source;
    const targetNodeId = edgeToDelete.target;
    deleteElements({ edges: [edgeToDelete] });
    toast({ title: 'Link deleted' });
    setContextMenu(null);
    setNodesInternal(prevNodes => {
        let currentNodes = [...prevNodes];
        currentNodes = updateAffectedNodeHandles(sourceNodeId, currentNodes, getEdges());
        currentNodes = updateAffectedNodeHandles(targetNodeId, currentNodes, getEdges());
        return currentNodes;
    });
  };

  const handleAddItemFromMobilePalette = useCallback((
    type: DraggableNodeType | 'master',
    itemData?: NamedApiConfig
  ) => {
    if (!reactFlowWrapperRef.current) {
      toast({ title: "Unable to add node", description: "Editor not fully loaded.", variant: "warning" });
      return;
    }
    const reactFlowBounds = reactFlowWrapperRef.current.getBoundingClientRect();
    const centerX = reactFlowBounds.width / 2;
    const centerY = reactFlowBounds.height / 2;

    const projectedPosition = project({ x: centerX, y: centerY });

    // Apply a small random offset to prevent stacking if multiple items are added quickly
    projectedPosition.x += (Math.random() - 0.5) * 10;
    projectedPosition.y += (Math.random() - 0.5) * 10;

    handleNodeDroppedOnCanvas(type, projectedPosition, itemData);
    setIsPaletteDrawerOpen(false); // Close drawer after adding
  }, [project, handleNodeDroppedOnCanvas, toast, setIsPaletteDrawerOpen]);


  return (
    <div ref={editorContainerRef} className="flex flex-col flex-grow h-full relative">
       {isMobile && showMobileInfoAlert && (
        <Alert variant="default" className="mb-2 border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-700/60">
          <Smartphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <AlertTitle className="font-title text-blue-700 dark:text-blue-300">Mobile Device Optimization Notice</AlertTitle>
          <AlertDescription className="text-blue-600 dark:text-blue-400 font-sans text-xs">
            The topology editor provides a better experience on desktop devices. Some complex operations may be limited on mobile devices.
          </AlertDescription>
           <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 h-6 w-6 p-0 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/50"
            onClick={() => setShowMobileInfoAlert(false)}
            aria-label="Close notification"
          >
            <X size={16} />
          </Button>
        </Alert>
      )}
      <div className="flex flex-row flex-grow h-full overflow-hidden">
        {!isMobile && (
            <ScrollArea className="w-60 flex-shrink-0 border-r bg-muted/30 p-2">
            <div className="flex flex-col h-full bg-background rounded-lg shadow-md border">
                <div className="flex flex-col p-3">
                <h2 className="text-sm font-semibold font-title mb-1 flex items-center">
                    <ListTree size={16} className="mr-2 text-primary" />
                    Master List
                </h2>
                <p className="text-xs text-muted-foreground font-sans mb-2">Drag masters onto the canvas.</p>
                <ScrollArea className="flex-grow pr-1 max-h-60">
                    <MastersPalette />
                </ScrollArea>
                </div>
                <Separator className="my-0" />
                <div className="flex flex-col p-3">
                <h2 className="text-sm font-semibold font-title mb-1 flex items-center">
                    <Puzzle size={16} className="mr-2 text-primary" />
                    Component Cards
                </h2>
                <p className="text-xs text-muted-foreground font-sans mb-2">Drag instances into masters.</p>
                <div className="flex-grow overflow-y-auto pr-1"><ComponentsPalette /></div>
                </div>
            </div>
            </ScrollArea>
        )}

        {isMobile && (
          <Sheet open={isPaletteDrawerOpen} onOpenChange={setIsPaletteDrawerOpen}>
            <SheetContent side="left" className="w-[260px] p-0 flex flex-col">
              <SheetHeader className="p-3 border-b">
                <SheetTitle className="font-title text-base">Components and Masters</SheetTitle>
                 <SheetDescription className="text-xs font-sans text-left pt-1">Tap items to add them to the center of the canvas.</SheetDescription>
              </SheetHeader>
              <ScrollArea className="flex-grow">
                <div className="p-3 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold font-title mb-1 flex items-center">
                      <ListTree size={16} className="mr-2 text-primary" />
                      Master List
                    </h2>
                    <p className="text-xs text-muted-foreground font-sans mb-2">Tap masters to add to the canvas.</p>
                    <MastersPalette isMobileClickToAdd={isMobile} onItemClick={handleAddItemFromMobilePalette} />
                  </div>
                  <Separator />
                  <div>
                    <h2 className="text-sm font-semibold font-title mb-1 flex items-center">
                      <Puzzle size={16} className="mr-2 text-primary" />
                      Component Cards
                    </h2>
                    <p className="text-xs text-muted-foreground font-sans mb-2">Tap instances to add inside masters or on the canvas.</p>
                    <ComponentsPalette isMobileClickToAdd={isMobile} onItemClick={handleAddItemFromMobilePalette} />
                  </div>
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        )}

        <div className="flex-grow flex flex-col overflow-hidden p-2">
          <div className="flex-grow relative">
            <div className="absolute inset-0">
              <TopologyCanvasWrapper
                nodes={nodesInternal} edges={edgesInternal} onNodesChange={onNodesChangeInternalCallback} onEdgesChange={onEdgesChangeInternal} onConnect={onConnect}
                onSelectionChange={onSelectionChange} reactFlowWrapperRef={reactFlowWrapperRef} onNodeClick={onNodeClickHandler}
                onCenterView={handleCenterViewCallback}
                onClearCanvas={handleClearCanvasCallback} onTriggerSubmitTopology={handleTriggerSubmitTopology}
                onTriggerRefreshAllInstanceCounts={handleRefreshAllInstanceCounts}
                canSubmit={(nodesInternal.length > 0 || edgesInternal.length > 0) && !isSubmitting}
                isSubmitting={isSubmitting}
                isRefreshingCounts={isRefreshingCounts}
                onNodeDropOnCanvas={handleNodeDroppedOnCanvas} onNodeContextMenu={onNodeContextMenu} onEdgeContextMenu={onEdgeContextMenu} onPaneClick={onPaneClick}
                customNodeTypes={memoizedNodeTypes}
                isMobile={isMobile}
                onToggleMobilePalette={() => setIsPaletteDrawerOpen(true)}
              />
            </div>
          </div>
        </div>
      </div>
      {contextMenu && (
        <div ref={menuRef} style={{ top: contextMenu.top, left: contextMenu.left }} className="absolute z-[100] bg-popover border border-border rounded-md shadow-xl p-1.5 text-popover-foreground text-xs min-w-[150px]">
          {contextMenu.type === 'node' && (contextMenu.data as Node).data.role !== 'U' && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleOpenEditNodeDialog(contextMenu.data as Node)}>Edit Properties</Button>
          )}

          {(contextMenu.data as Node).type === 'node' && (contextMenu.data as Node).data.role === 'S' && (contextMenu.data as Node).data.parentNode && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleChangeNodeRole((contextMenu.data as Node).id, 'C')}>Change to Client (C)</Button>
          )}
          {(contextMenu.data as Node).type === 'node' && (contextMenu.data as Node).data.role === 'C' && (contextMenu.data as Node).data.parentNode && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleChangeNodeRole((contextMenu.data as Node).id, 'S')}>Change to Server (S)</Button>
          )}
          {contextMenu.type === 'node' && <Separator className="my-1"/>}
          {contextMenu.type === 'node' && (
              <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans text-destructive hover:!text-destructive" onClick={() => handleDeleteNode(contextMenu.data as Node)}>Delete Role</Button>
          )}
          {contextMenu.type === 'edge' && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans text-destructive hover:!text-destructive" onClick={() => handleDeleteEdge(contextMenu.data as Edge)}>Delete Link</Button>
          )}
        </div>
      )}
       <SubmitTopologyConfirmationDialog
        open={isSubmitConfirmOpen}
        onOpenChange={(isOpen) => {
            setIsSubmitConfirmOpen(isOpen);
            if (!isOpen && !createInstanceMutation.isPending) setIsSubmitting(false);
        }}
        instancesToCreate={instancesForConfirmation}
        onConfirm={executeActualSubmission}
        isSubmitting={createInstanceMutation.isPending}
      />
      <EditTopologyNodeDialog
          open={isEditNodeDialogOpen}
          onOpenChange={(isOpen) => {
              setIsEditNodeDialogOpen(isOpen);
              if (!isOpen) setEditingNodeContext(null);
          }}
          node={editingNodeContext?.node || null}
          hasServerNodesInParentContainer={editingNodeContext?.hasS || false}
          isInterMasterClientLink={editingNodeContext?.isInterMasterLink || false}
          interMasterLinkSourceInfo={editingNodeContext?.sourceInfo}
          onSave={handleSaveNodeProperties}
      />
    </div>
  );
}