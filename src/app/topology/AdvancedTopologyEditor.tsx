
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
} from 'reactflow';
import dagre from 'dagre';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Server, DatabaseZap, User, Globe, ListTree, Puzzle, Info as InfoIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import { TopologyCanvasWrapper } from './TopologyCanvas';
import { MastersPalette } from './components/MastersPalette';
import { ComponentsPalette, type DraggableNodeType } from './components/ComponentsPalette';
import { PropertiesDisplayPanel } from './components/PropertiesDisplayPanel';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { useApiConfig } from '@/hooks/use-api-key';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { nodePassApi, type Instance as ApiInstanceType, getEventsUrl } from '@/lib/api';
import { buildUrlFromFormValues, type BuildUrlParams } from '@/components/nodepass/create-instance-dialog/utils';
import { extractPort, parseNodePassUrl, isWildcardHostname } from '@/lib/url-utils';
import { SubmitTopologyConfirmationDialog, type InstanceUrlConfigWithName } from './components/SubmitTopologyConfirmationDialog';
import { EditTopologyNodeDialog } from './components/EditTopologyNodeDialog';

import type { Node, CustomNodeData, NodeRole, TopologyContextMenu } from './topologyTypes';
import { nodeStyles } from './NodeRenderer';
import { ICON_ONLY_NODE_SIZE, EXPANDED_SC_NODE_WIDTH, EXPANDED_SC_NODE_BASE_HEIGHT, DETAIL_LINE_HEIGHT } from './topologyTypes';
import { calculateClientTunnelAddressForServer } from './topologyLogic';


const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

const DEFAULT_MASTER_NODE_WIDTH = 300; 
const DEFAULT_MASTER_NODE_HEIGHT = 150; 
const MIN_MASTER_NODE_HEIGHT = 120;
const MIN_MASTER_NODE_WIDTH = 200;
const M_NODE_CHILD_PADDING = 25;

const dagreGraph = new dagre.graphlib.Graph({ compound: true });
dagreGraph.setDefaultEdgeLabel(() => ({}));
dagreGraph.setGraph({ rankdir: 'LR', align: 'UL', nodesep: 60, ranksep: 70, edgesep: 20 });


export function AdvancedTopologyEditor() {
  const { deleteElements, fitView, getNodes, getEdges, setNodes: setReactFlowNodes, setEdges: setReactFlowEdges } = useReactFlow();
  
  const [nodesInternal, setNodesInternal, onNodesChangeInternalCallback] = useNodesState<Node>(initialNodes);
  const [edgesInternal, setEdgesInternal, onEdgesChangeInternal] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(0); 
  const { toast } = useToast();
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<TopologyContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const { apiConfigsList, getApiConfigById, getApiRootUrl, getToken, activeApiConfig } = useApiConfig();
  const queryClient = useQueryClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const updateMasterNodeDimensions = useCallback((masterNodeId: string, currentNodes: Node[]): Node[] => {
    const masterNode = currentNodes.find(n => n.id === masterNodeId);
    if (!masterNode || !masterNode.data.isContainer) return currentNodes;
  
    const children = currentNodes.filter(n => n.parentNode === masterNodeId);
    
    let newWidth = MIN_MASTER_NODE_WIDTH;
    let newHeight = MIN_MASTER_NODE_HEIGHT;

    if (children.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      children.forEach(child => {
        const childX = child.position.x;
        const childY = child.position.y;
        // Use actual child width/height, which might vary if expanded
        const childWidth = child.width || ICON_ONLY_NODE_SIZE;
        const childHeight = child.height || ICON_ONLY_NODE_SIZE;
  
        minX = Math.min(minX, childX);
        minY = Math.min(minY, childY);
        maxX = Math.max(maxX, childX + childWidth);
        maxY = Math.max(maxY, childY + childHeight);
      });
      
      newWidth = Math.max(maxX - minX + M_NODE_CHILD_PADDING * 2, MIN_MASTER_NODE_WIDTH);
      newHeight = Math.max(maxY - minY + M_NODE_CHILD_PADDING * 2, MIN_MASTER_NODE_HEIGHT);
    }
  
    const updatedMasterNode = {
      ...masterNode,
      width: newWidth,
      height: newHeight,
      style: { ...masterNode.style, width: newWidth, height: newHeight },
    };
  
    return currentNodes.map(n => (n.id === masterNodeId ? updatedMasterNode : n));
  }, []);

  const onNodesChangeInternal: OnNodesChange = useCallback((changes: NodeChange[]) => {
    setNodesInternal((nds) => {
      const appliedChanges = applyNodeChanges(changes, nds);
      let finalNodes = appliedChanges;
      
      const parentIdsToUpdate = new Set<string>();
      changes.forEach(change => {
        let affectedNodeId: string | undefined = undefined;
        if (change.type === 'remove') {
          affectedNodeId = change.id;
        } else if ('id' in change && (change.type === 'position' || change.type === 'dimensions')) {
          affectedNodeId = change.id;
        }

        if (affectedNodeId) {
          const originalNode = nds.find(n => n.id === affectedNodeId);
          if (originalNode && originalNode.parentNode) {
            parentIdsToUpdate.add(originalNode.parentNode);
          }
        }
      });

      parentIdsToUpdate.forEach(parentId => {
        finalNodes = updateMasterNodeDimensions(parentId, finalNodes);
      });
      
      return finalNodes;
    });
  }, [setNodesInternal, updateMasterNodeDimensions]);

  const createInstanceMutation = useMutation({
    mutationFn: (params: { data: { url: string }, useApiRoot: string, useApiToken: string, originalNodeId: string }) => {
      return nodePassApi.createInstance(params.data, params.useApiRoot, params.useApiToken);
    },
    onMutate: (variables) => {
      setNodesInternal(nds => nds.map(n => {
        if (n.id === variables.originalNodeId) {
          return { ...n, data: { ...n.data, submissionStatus: 'pending', submissionMessage: '提交中...' } };
        }
        return n;
      }));
    },
    onSuccess: (createdInstance, variables) => {
      toast({ title: `实例创建请求成功`, description: `节点 ${variables.originalNodeId.substring(0,8)}... -> ID: ${createdInstance.id.substring(0,8)}...` });
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
      toast({ title: `创建实例失败 (节点 ${variables.originalNodeId.substring(0,8)}...)`, description: error.message || '未知错误', variant: 'destructive' });
      setNodesInternal(nds => nds.map(n => {
        if (n.id === variables.originalNodeId) {
           return { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: error.message.substring(0,30) || '失败' } };
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
        toast({ title: '连接错误', description: '源节点或目标节点未找到。', variant: 'destructive' });
        return;
      }
      if (params.source === params.target) {
        toast({ title: '连接无效', description: '节点不能连接到自身。', variant: 'destructive' });
        return;
      }
      if (allCurrentEdges.some(edge => (edge.source === params.source && edge.target === params.target) || (edge.source === params.target && edge.target === params.source))) {
        toast({ title: '连接已存在', description: '这两个节点之间已经存在一条连接。', variant: 'destructive' });
        return;
      }

      const sourceRole = sourceNode.data.role;
      const targetRole = targetNode.data.role;

      if (sourceRole === 'M' || targetRole === 'M') {
          toast({ title: '连接无效', description: '主控 (M) 节点是容器，不能直接连接。请连接其内部的 S/C 节点。', variant: 'destructive'});
          return;
      }
      if (targetRole === 'U') {
        toast({ title: '连接无效', description: '用户 (U) 节点不能被其他节点链接 (作为目标)。', variant: 'destructive' });
        return;
      }
      if (sourceRole === 'T') {
        toast({ title: '连接无效', description: '目标 (T) 节点不能作为连接的起点。', variant: 'destructive' });
        return;
      }
      if (sourceRole === 'U' && !(targetRole === 'S' || targetRole === 'C')) {
        toast({ title: '连接无效', description: '用户 (U) 节点只能连接到 出口(S) 或 入口(C) 节点。', variant: 'destructive' });
        return;
      }
      if ((targetRole === 'T') && !(sourceRole === 'S' || sourceRole === 'C')) {
         toast({ title: '连接无效', description: '目标 (T) 节点只能被 出口(S) 或 入口(C) 连接。', variant: 'destructive' });
         return;
      }
      if (sourceRole === 'S' && targetRole !== 'C' && targetRole !== 'T') {
         toast({ title: '连接无效', description: '出口(S) 节点只能连接到 入口(C) 或 目标(T)。', variant: 'destructive'});
         return;
      }
      if (sourceRole === 'C' && !(targetRole === 'S' || targetRole === 'C' || targetRole === 'T')) {
         toast({ title: '连接无效', description: '入口(C) 节点只能连接到 出口(S), 入口(C), 或 目标(T)。', variant: 'destructive'});
         return;
      }
      
      const newEdgeBase = {
        ...params,
        id: `edge-${uuidv4()}`,
        animated: true,
        style: { strokeDasharray: '5 5' },
        type: 'smoothstep', 
        markerEnd: { type: MarkerType.ArrowClosed },
      };

      let nodesToUpdate: Node[] | null = null;
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

                nodesToUpdate = allCurrentNodes.map(n => {
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
                toast({ title: "跨主控入口(C)地址已自动更新", description: `入口(C) ${clientNodeForUpdate.data.label} 已自动配置连接到 出口(S) ${serverNodeForClientConfig.data.label}。` });
            } else {
                 nodesToUpdate = allCurrentNodes.map(n => {
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
                toast({ title: "警告: 无法自动配置跨主控入口(C)地址", description: "未能计算出有效的服务端隧道地址。请检查源S节点及其主控配置。入口(C)已设为隧道模式，请手动配置其隧道地址。", variant: "warning" });
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
        if (tNodeUpdated || scNodeUpdated) nodesToUpdate = tempNodes;
        if (tNodeUpdated) toast({ title: `落地 (T) ${targetNode.data.label} 已同步上游目标地址。`});
        if (scNodeUpdated) toast({ title: `${sourceNode.data.label} 已同步落地 (T) 目标地址。`});
      }

      if (nodesToUpdate) {
        setNodesInternal(nodesToUpdate);
      }
      setEdgesInternal((eds) => addEdge(newEdgeBase, eds));
    },
    [getNodes, getEdges, setNodesInternal, setEdgesInternal, toast, getApiConfigById]
  );
  
  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedNode(selectedNodesList.length === 1 ? selectedNodesList[0] : null);
    if (selectedNodesList.length !== 1) setContextMenu(null);
  }, []);

  const calculateExpandedNodeHeight = (data: CustomNodeData): number => {
    let numDetails = 2; // Base for Label, Role
    if (data.tunnelAddress) numDetails++;
    if (data.targetAddress) numDetails++;
    if (data.submissionStatus) numDetails++;
    return EXPANDED_SC_NODE_BASE_HEIGHT + (numDetails * DETAIL_LINE_HEIGHT) + (data.submissionStatus ? 5 : 0); // Extra padding for submission status
  };


  const onNodeClickHandler: NodeMouseHandler = useCallback((event, clickedNode) => {
    setNodesInternal(nds => nds.map(n => {
        if (n.id === clickedNode.id && (n.data.role === 'S' || n.data.role === 'C' || n.data.role === 'T' || n.data.role === 'U')) {
            const newIsExpanded = !n.data.isExpanded;
            const newWidth = newIsExpanded ? EXPANDED_SC_NODE_WIDTH : ICON_ONLY_NODE_SIZE;
            const newHeight = newIsExpanded ? calculateExpandedNodeHeight(n.data) : ICON_ONLY_NODE_SIZE;
            const updatedNode = { 
                ...n, 
                data: { ...n.data, isExpanded: newIsExpanded },
                width: newWidth,
                height: newHeight,
                style: { ...n.style, width: newWidth, height: newHeight } // Update style for React Flow
            };
             if (n.parentNode) {
                setTimeout(() => setNodesInternal(prevNodes => updateMasterNodeDimensions(n.parentNode!, prevNodes)), 0);
            }
            return updatedNode;
        }
        return n;
    }));
    setSelectedNode(clickedNode); // Also handle selection
  }, [setNodesInternal, updateMasterNodeDimensions, setSelectedNode]);


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

  const onPaneClick = useCallback(() => setContextMenu(null), [setContextMenu]);

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
      
      const parentMContainer = allCurrentNodes.find(n => {
          if (n.data.role !== 'M' || !n.data.isContainer) return false;
          const { x: nodeX, y: nodeY } = n.position;
          const nodeWidth = n.width ?? DEFAULT_MASTER_NODE_WIDTH;
          const nodeHeight = n.height ?? DEFAULT_MASTER_NODE_HEIGHT;
          return (position.x >= nodeX && position.x <= nodeX + nodeWidth && position.y >= nodeY && position.y <= nodeY + nodeHeight);
      });

      if (type === 'master' && draggedData) {
          if (parentMContainer) {
              toast({ title: "操作无效", description: "主控 (M) 节点不能嵌套在其他主控节点内。", variant: "destructive" });
              return;
          }
          const mId = `adv-master-${draggedData.id.substring(0, 8)}-${uuidv4().substring(0,4)}`;
          currentCounter++;
          newNodesList.push({
              id: mId, type: 'masterNode', position,
              data: {
                label: `主控: ${draggedData.name || '未命名'}`, role: 'M', isContainer: true,
                masterId: draggedData.id, masterName: draggedData.name,
                apiUrl: draggedData.apiUrl,
                defaultLogLevel: draggedData.masterDefaultLogLevel,
                defaultTlsMode: draggedData.masterDefaultTlsMode,
                masterSubRole: 'container', // For advanced editor, M is a container
              },
              style: { ...nodeStyles.m.base, width: MIN_MASTER_NODE_WIDTH, height: MIN_MASTER_NODE_HEIGHT }, // Start with min size
              width: MIN_MASTER_NODE_WIDTH, height: MIN_MASTER_NODE_HEIGHT,
          });
          toast({ title: "主控容器已创建" });
          setTimeout(() => { fitView({ nodes: [{id: mId}], duration: 400, padding: 0.2 }); }, 50);
          setNodesInternal(nds => nds.concat(newNodesList));

      } else if (type !== 'master') { 
          const nodeRole = type.toUpperCase() as NodeRole;
          const { labelPrefix, icon } = {
              'S': { labelPrefix: '出口(s)', icon: Server },
              'C': { labelPrefix: '入口(c)', icon: DatabaseZap },
              'T': { labelPrefix: '落地', icon: Globe },
              'U': { labelPrefix: '用户', icon: User },
          }[nodeRole]!;

          if ((nodeRole === 'S' || nodeRole === 'C') && !parentMContainer) {
              toast({ title: "操作无效", description: `${labelPrefix} (${nodeRole}) 必须拖拽到主控 (M) 容器内。`, variant: "destructive" });
              return;
          }
          
          currentCounter++;
          const newNodeId = `${nodeRole.toLowerCase()}-${uuidv4().substring(0,8)}`;
          const newNodeData: CustomNodeData = {
             label: `${labelPrefix} #${currentCounter}`, role: nodeRole, icon, // Keep label for properties panel & expanded view
             logLevel: 'master',
             isExpanded: false, // Initially collapsed
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
            width: ICON_ONLY_NODE_SIZE, // Initial size for icon-only
            height: ICON_ONLY_NODE_SIZE 
          };

          if (parentMContainer && (nodeRole === 'S' || nodeRole === 'C')) {
              newNode.parentNode = parentMContainer.id;
              newNode.extent = 'parent';
              
              const parentX = parentMContainer.position.x;
              const parentY = parentMContainer.position.y;
              const parentWidth = parentMContainer.width || MIN_MASTER_NODE_WIDTH;
              const parentHeight = parentMContainer.height || MIN_MASTER_NODE_HEIGHT;
              
              const relativeX = Math.max(M_NODE_CHILD_PADDING, Math.min(position.x - parentX - (ICON_ONLY_NODE_SIZE / 2), parentWidth - ICON_ONLY_NODE_SIZE - M_NODE_CHILD_PADDING));
              const relativeY = Math.max(M_NODE_CHILD_PADDING, Math.min(position.y - parentY - (ICON_ONLY_NODE_SIZE / 2), parentHeight - ICON_ONLY_NODE_SIZE - M_NODE_CHILD_PADDING));
              newNode.position = { x: relativeX, y: relativeY };

              setNodesInternal(nds => {
                const nodesWithNewChild = nds.concat([newNode]);
                return updateMasterNodeDimensions(parentMContainer.id, nodesWithNewChild);
              });
              toast({ title: `${labelPrefix} 节点已添加至 ${parentMContainer.data.label}` });

          } else if (nodeRole === 'U' || nodeRole === 'T') {
              newNodesList.push(newNode);
              setNodesInternal(nds => nds.concat(newNodesList));
              toast({ title: `${labelPrefix} 节点已添加` });
          }
      } 
      setNodeIdCounter(currentCounter);
  }, [nodeIdCounter, getNodes, toast, setNodesInternal, fitView, updateMasterNodeDimensions]);

  const handleChangeNodeRole = useCallback((nodeId: string, newRole: 'S' | 'C') => {
    setNodesInternal(nds => nds.map(node => {
        if (node.id === nodeId && (node.data.role === 'S' || node.data.role === 'C')) {
            const newLabelPrefix = newRole === 'S' ? '出口(s)' : '入口(c)';
            const newIcon = newRole === 'S' ? Server : DatabaseZap;
            let newData: CustomNodeData = { ...node.data, role: newRole, icon: newIcon, label: `${newLabelPrefix} ${node.data.label.split(' ').pop()}` };
            
            if (newRole === 'S') {
                newData.isSingleEndedForwardC = undefined;
                if (!newData.tunnelAddress || newData.tunnelAddress.startsWith("remote")) newData.tunnelAddress = `[::]:${10000 + nodeIdCounter}`;
                if (!newData.targetAddress || newData.targetAddress.startsWith("[")) newData.targetAddress = `127.0.0.1:${3000 + nodeIdCounter}`;
            } else { 
                newData.isSingleEndedForwardC = false; 
                if (!newData.tunnelAddress || newData.tunnelAddress.startsWith("[")) newData.tunnelAddress = `remote.server.com:${10000 + nodeIdCounter}`;
                if (!newData.targetAddress || newData.targetAddress.startsWith("127")) newData.targetAddress = `[::]:${3000 + nodeIdCounter + 1}`;
            }
            return { ...node, data: newData };
        }
        return node;
    }));
    toast({ title: "角色已更改" });
    setContextMenu(null);
  }, [setNodesInternal, toast, nodeIdCounter]);


  const handleClearCanvasCallback = useCallback(() => {
    setNodesInternal([]); setEdgesInternal([]); setNodeIdCounter(0); setSelectedNode(null); setContextMenu(null);
    toast({ title: '画布已清空' });
  }, [setNodesInternal, setEdgesInternal, toast]);

  const handleCenterViewCallback = useCallback(() => {
    setContextMenu(null);
    fitView({ duration: 300, padding: 0.2 });
  }, [fitView]);

  const handleFormatLayout = useCallback(() => {
    const currentNodes = getNodes();
    const currentEdges = getEdges();
    if (currentNodes.length === 0) return;

    dagreGraph.setGraph({ rankdir: 'LR', align: 'UL', nodesep: 60, ranksep: 80, edgesep: 30 });

    currentNodes.forEach((node) => {
      dagreGraph.setNode(node.id, { 
        width: node.width || (node.data.role === 'M' ? MIN_MASTER_NODE_WIDTH : ICON_ONLY_NODE_SIZE), 
        height: node.height || (node.data.role === 'M' ? MIN_MASTER_NODE_HEIGHT : ICON_ONLY_NODE_SIZE),
        label: node.data.label // Dagre uses label for debug, not displayed by React Flow directly from here
      });
      if (node.parentNode && node.data.role !== 'M') { // S/C/T/U children of M
         dagreGraph.setParent(node.id, node.parentNode);
      }
    });

    currentEdges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = currentNodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - (node.width || ICON_ONLY_NODE_SIZE) / 2,
          y: nodeWithPosition.y - (node.height || ICON_ONLY_NODE_SIZE) / 2,
        },
      };
    });
    
    // Update M node dimensions AFTER dagre positions children, so dagre can use initial estimates
    // then we refine M based on actual child positions from dagre.
    let finalNodes = layoutedNodes;
    const masterNodeIds = layoutedNodes.filter(n => n.data.role === 'M' && n.data.isContainer).map(n => n.id);
    masterNodeIds.forEach(masterId => {
      finalNodes = updateMasterNodeDimensions(masterId, finalNodes);
    });

    setReactFlowNodes(finalNodes); // Use setNodes from useReactFlow for direct update
    setReactFlowEdges(currentEdges); // Edges usually don't need position updates from dagre directly
    
    setTimeout(() => fitView({ duration: 400, padding: 0.1 }), 100);
    toast({ title: '布局已格式化' });
  }, [getNodes, getEdges, setReactFlowNodes, setReactFlowEdges, fitView, toast, updateMasterNodeDimensions]);


  const prepareInstancesForSubmission = useCallback((): InstanceUrlConfigWithName[] => {
    const instancesToCreate: InstanceUrlConfigWithName[] = [];
    const allCurrentNodes = getNodes();

    for (const node of allCurrentNodes) {
      if (node.data.role === 'S' || node.data.role === 'C') {
        let masterId: string | undefined;
        let masterConfigForNode: NamedApiConfig | null = null;
        
        const parentMNode = allCurrentNodes.find(n => n.id === node.parentNode);
        if (parentMNode) {
            masterId = parentMNode.data.masterId;
            masterConfigForNode = masterId ? getApiConfigById(masterId) : null;
        }
        
        if (!masterId || !masterConfigForNode) {
          setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '主控配置丢失' } } : n));
          continue;
        }

        let urlParams: BuildUrlParams | null = null;
        const instanceTypeForBuild: "入口(c)" | "出口(s)" = node.data.role === 'S' ? "出口(s)" : "入口(c)";

        if (node.data.role === 'S') {
          if (!node.data.targetAddress || !node.data.tunnelAddress) {
            setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '地址不完整' } } : n));
            continue;
          }
          urlParams = {
            instanceType: instanceTypeForBuild,
            tunnelAddress: node.data.tunnelAddress,
            targetAddress: node.data.targetAddress,
            logLevel: (node.data.logLevel as any) || masterConfigForNode.masterDefaultLogLevel || 'master',
            tlsMode: (node.data.tlsMode as any) || masterConfigForNode.masterDefaultTlsMode || 'master',
            certPath: node.data.certPath,
            keyPath: node.data.keyPath,
          };
        } else if (node.data.role === 'C') {
          if (node.data.isSingleEndedForwardC) { 
            if (!node.data.tunnelAddress || !node.data.targetAddress) {
              setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '单端转发地址不完整' } } : n));
              continue;
            }
            urlParams = {
              instanceType: instanceTypeForBuild,
              isSingleEndedForward: true,
              tunnelAddress: node.data.tunnelAddress, 
              targetAddress: node.data.targetAddress, 
              logLevel: (node.data.logLevel as any) || masterConfigForNode.masterDefaultLogLevel || 'master',
              tlsMode: (node.data.tlsMode as any) || '0', 
              certPath: node.data.certPath,
              keyPath: node.data.keyPath,
            };
          } else { 
            if (!node.data.tunnelAddress || !node.data.targetAddress) {
              setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '地址不完整' } } : n));
              continue;
            }
            urlParams = {
              instanceType: instanceTypeForBuild,
              isSingleEndedForward: false,
              tunnelAddress: node.data.tunnelAddress, 
              targetAddress: node.data.targetAddress, 
              logLevel: (node.data.logLevel as any) || masterConfigForNode.masterDefaultLogLevel || 'master',
              tlsMode: (node.data.tlsMode as any) || masterConfigForNode.masterDefaultTlsMode || 'master', 
              certPath: node.data.certPath,
              keyPath: node.data.keyPath,
            };
          }
        }

        if (urlParams) {
          const finalUrl = buildUrlFromFormValues(urlParams, masterConfigForNode);
          instancesToCreate.push({
            nodeId: node.id,
            nodeLabel: node.data.label,
            masterId: masterConfigForNode.id,
            masterName: masterConfigForNode.name,
            url: finalUrl,
            instanceType: instanceTypeForBuild
          });
        }
      }
    }
    return instancesToCreate;
  }, [getNodes, getApiConfigById, setNodesInternal, activeApiConfig]);


  const handleTriggerSubmitTopology = useCallback(async () => {
    setContextMenu(null); setIsSubmitting(true);
    if (!activeApiConfig && apiConfigsList.length > 0) { 
        toast({ title: "错误", description: "没有活动的API配置可用于连接事件流。请在画布上至少放置一个主控节点。", variant: "destructive" });
        setIsSubmitting(false); return;
    }
    const masterForSseCheck = activeApiConfig || apiConfigsList[0];
    if (!masterForSseCheck) {
        toast({ title: "错误", description: "没有可用的API配置来检查事件流连接。", variant: "destructive" });
        setIsSubmitting(false); return;
    }
    
    const ssePreCheckAbortController = new AbortController(); let sseCheckSuccess = false;
    const checkConnectionPromise = (async () => { try { 
        const apiRootForCheck = getApiRootUrl(masterForSseCheck.id); const tokenForCheck = getToken(masterForSseCheck.id);
        if (!apiRootForCheck || !tokenForCheck) throw new Error("API配置不完整。");
        const eventsUrl = getEventsUrl(apiRootForCheck); if (!eventsUrl) throw new Error("无法生成事件URL。");
        const response = await fetch(eventsUrl, { method: 'GET', headers: { 'X-API-Key': tokenForCheck, 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' }, signal: ssePreCheckAbortController.signal });
        if (!response.ok || !response.body) { const errorText = response.statusText || `HTTP error ${response.status}`; throw new Error(errorText); }
        const reader = response.body.getReader(); const { done } = await reader.read(); if (!done) sseCheckSuccess = true;
        if (!ssePreCheckAbortController.signal.aborted) ssePreCheckAbortController.abort("Pre-check complete");
        reader.releaseLock(); if (response.body.locked) await response.body.cancel().catch(e => console.warn("Error cancelling pre-check stream body:", e));
    } catch (error: any) { if (error.name !== 'AbortError') console.warn("SSE Pre-check connection error:", error.message); sseCheckSuccess = false; } })();
    const timeoutPromise = new Promise(resolve => setTimeout(() => { if (!sseCheckSuccess && !ssePreCheckAbortController.signal.aborted) ssePreCheckAbortController.abort("Pre-check timeout"); resolve(null); }, 10000));
    await Promise.race([checkConnectionPromise, timeoutPromise]);
    if (!sseCheckSuccess) { if (!ssePreCheckAbortController.signal.aborted) ssePreCheckAbortController.abort("Pre-check timeout or failure post-race"); toast({ title: "连接检查失败", description: "无法连接到主控事件流，请检查主控状态或网络。提交已取消。", variant: "destructive" }); setIsSubmitting(false); return; }

    setNodesInternal(nds => nds.map(n => ({ ...n, data: { ...n.data, submissionStatus: undefined, submissionMessage: undefined } })));
    const instancesToCreate = prepareInstancesForSubmission();
    if (instancesToCreate.length === 0) {
      toast({ title: '无实例可提交', description: '请配置有效的出口(s)/入口(c)节点。' });
      setIsSubmitting(false); return;
    }
    setInstancesForConfirmation(instancesToCreate); setIsSubmitConfirmOpen(true);
  }, [activeApiConfig, apiConfigsList, getApiRootUrl, getToken, toast, prepareInstancesForSubmission, setNodesInternal]);


  const listenForHandshakeViaSSE = useCallback(async (masterForSse: NamedApiConfig, signal: AbortSignal) => {
    const sseApiRoot = getApiRootUrl(masterForSse.id); const sseApiToken = getToken(masterForSse.id);
    if (!sseApiRoot || !sseApiToken) { toast({ title: "SSE 错误", description: `无法监听握手: 主控 ${masterForSse.name} 的API配置无效。`, variant: "destructive" }); return; }
    const eventsSSEUrl = getEventsUrl(sseApiRoot); if (!eventsSSEUrl) return;
    try {
        const response = await fetch(eventsSSEUrl, { method: 'GET', headers: { 'X-API-Key': sseApiToken, 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' }, signal });
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
                            const latency = match[1]; toast({ title: "✅ 隧道握手成功", description: `延迟: ${latency}ms` });
                            if (sseHandshakeAbortControllerRef.current && !sseHandshakeAbortControllerRef.current.signal.aborted) sseHandshakeAbortControllerRef.current.abort("Handshake detected");
                            return; } }
                } catch (e) { console.warn("SSE: Error parsing instance event data:", e, "Raw data:", eventDataStr); } } } }
    } catch (error: any) { if (error.name !== 'AbortError') { console.error("SSE: Handshake listener error:", error); toast({ title: "SSE 监听错误", description: `监听隧道握手时出错: ${error.message}`, variant: "destructive" }); }
    } finally { if (sseHandshakeAbortControllerRef.current && sseHandshakeAbortControllerRef.current.signal === signal && !signal.aborted) sseHandshakeAbortControllerRef.current.abort("Listener function completed or errored"); }
  }, [getApiRootUrl, getToken, toast, handshakeLogRegex]);

  const executeActualSubmission = useCallback(async () => {
    setIsSubmitConfirmOpen(false);
    toast({ title: '拓扑已提交', description: `正在创建 ${instancesForConfirmation.length} 个实例...` });

    const masterToListenOn = activeApiConfig || apiConfigsList[0];
    if (masterToListenOn) {
        if (sseHandshakeAbortControllerRef.current && !sseHandshakeAbortControllerRef.current.signal.aborted) sseHandshakeAbortControllerRef.current.abort("New submission handshake listener starting");
        const newAbortController = new AbortController(); sseHandshakeAbortControllerRef.current = newAbortController;
        listenForHandshakeViaSSE(masterToListenOn, newAbortController.signal);
        setTimeout(() => { if (newAbortController && !newAbortController.signal.aborted) { if (newAbortController.signal.reason !== "Handshake detected") toast({ title: "监听超时", description: "25秒内未检测到隧道握手事件。请检查Master日志。", variant: "default" }); newAbortController.abort("Handshake listener timeout"); if (sseHandshakeAbortControllerRef.current === newAbortController) sseHandshakeAbortControllerRef.current = null; } }, 25000);
    }

    const submissionPromises = instancesForConfirmation.map(inst => {
      const apiR = getApiRootUrl(inst.masterId); const apiT = getToken(inst.masterId);
      if (!apiR || !apiT) { setNodesInternal(nds => nds.map(n => n.id === inst.nodeId ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '主控API无效' } } : n)); return Promise.reject(new Error(`主控 ${inst.masterName} API配置无效。`)); }
      return createInstanceMutation.mutateAsync({ data: { url: inst.url }, useApiRoot: apiR, useApiToken: apiT, originalNodeId: inst.nodeId });
    });
    try { await Promise.allSettled(submissionPromises); } catch (e) { console.error("拓扑提交出错:", e); toast({ title: '拓扑提交过程中发生意外错误', variant: 'destructive' }); } finally { setIsSubmitting(false); }
  }, [instancesForConfirmation, getApiRootUrl, getToken, toast, createInstanceMutation, setNodesInternal, activeApiConfig, apiConfigsList, listenForHandshakeViaSSE]);

  useEffect(() => { return () => { if (sseHandshakeAbortControllerRef.current && !sseHandshakeAbortControllerRef.current.signal.aborted) { sseHandshakeAbortControllerRef.current.abort("Component unmounting"); sseHandshakeAbortControllerRef.current = null; } }; }, []);

  const handleOpenEditNodeDialog = (node: Node) => {
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

        const incomingEdge = allEdges.find(edge => edge.target === node.id);
        const outgoingEdge = allEdges.find(edge => edge.source === node.id);

        if (incomingEdge && allNodes.find(n=> n.id === incomingEdge.source)?.data.role === 'S') {
            const sourceSNode = allNodes.find(n => n.id === incomingEdge.source)!;
            const sourceParentNode = sourceSNode.parentNode ? allNodes.find(n => n.id === sourceSNode.parentNode) : undefined;
            const cNodeParentNode = node.parentNode ? allNodes.find(n => n.id === node.parentNode) : undefined;
            
            if (sourceParentNode && cNodeParentNode && sourceParentNode.data.masterId !== cNodeParentNode.data.masterId) {
                isInterMaster = true;
                const sourceMasterConfig = getApiConfigById(sourceParentNode.data.masterId!);
                const newClientTunnelAddress = calculateClientTunnelAddressForServer(sourceSNode.data, sourceMasterConfig);
                if (newClientTunnelAddress && newClientTunnelAddress.trim() !== "") {
                    sourceInfo = { serverTunnelAddress: newClientTunnelAddress };
                } else {
                    toast({ title: '无法确定隧道地址', description: '无法自动计算源 S 节点的隧道地址。', variant: "warning" });
                }
            }
        } else if (outgoingEdge && allNodes.find(n=> n.id === outgoingEdge.target)?.data.role === 'S') {
            const targetSNode = allNodes.find(n => n.id === outgoingEdge.target)!;
            const targetParentNode = targetSNode.parentNode ? allNodes.find(n => n.id === targetSNode.parentNode) : undefined;
            const cNodeParentNode = node.parentNode ? allNodes.find(n => n.id === node.parentNode) : undefined;

            if (targetParentNode && cNodeParentNode && targetParentNode.data.masterId !== cNodeParentNode.data.masterId) {
                 isInterMaster = true;
                 const targetMasterConfig = getApiConfigById(targetParentNode.data.masterId!);
                 const newClientTunnelAddress = calculateClientTunnelAddressForServer(targetSNode.data, targetMasterConfig);
                 if (newClientTunnelAddress && newClientTunnelAddress.trim() !== "") {
                    sourceInfo = { serverTunnelAddress: newClientTunnelAddress };
                } else {
                    toast({ title: '无法确定隧道地址', description: '无法自动计算目标 S 节点的隧道地址。', variant: "warning" });
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
  };

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

    // Update node width/height if expanded state changed or role implies size change
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
                                toast({ title: `跨主控入口(C) ${clientNode.data.label} 的地址已自动更新。` });
                            } else if (!newClientTunnelAddr || newClientTunnelAddr.trim() === "") {
                                toast({ title: `警告: 更新出口(S)后无法重新计算入口(C) ${clientNode.data.label} 的隧道地址。`, variant: "warning" });
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
                                toast({ title: `跨主控入口(C) ${clientNode.data.label} 的地址已自动更新。` });
                            } else if (!newClientTunnelAddr || newClientTunnelAddr.trim() === "") {
                                toast({ title: `警告: 更新出口(S)后无法重新计算入口(C) ${clientNode.data.label} 的隧道地址。`, variant: "warning" });
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
                        toast({ title: `落地 (T) ${newNodes[targetTNodeIndex].data.label} 已同步目标地址。`});
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
                       toast({ title: `${newNodes[sourceNodeIndex].data.label} 已同步落地 (T) 目标地址。`});
                     }
                }
            }
        });
    }
    
    setNodesInternal(newNodes);
    if (editedNode.data.role === 'M' && editedNode.data.isContainer) {
      setNodesInternal(prevNodes => updateMasterNodeDimensions(editedNode.id, prevNodes));
    } else if (editedNode.parentNode) {
      setNodesInternal(prevNodes => updateMasterNodeDimensions(editedNode.parentNode!, prevNodes));
    }

    toast({ title: `节点 "${mergedData.label || nodeId.substring(0,8)}" 属性已更新`});
    setIsEditNodeDialogOpen(false); setEditingNodeContext(null);
  }, [getNodes, getEdges, setNodesInternal, toast, getApiConfigById, updateMasterNodeDimensions]);


  const handleDeleteNode = (nodeToDelete: Node) => {
    const parentId = nodeToDelete.parentNode;
    deleteElements({ nodes: [nodeToDelete] });
    toast({ title: `节点 "${nodeToDelete.data.label || nodeToDelete.id}" 已删除` });
    if (selectedNode?.id === nodeToDelete.id) setSelectedNode(null);
    setContextMenu(null);
    if (parentId) {
        setNodesInternal(prevNodes => updateMasterNodeDimensions(parentId, prevNodes));
    }
  };
  const handleDeleteEdge = (edgeToDelete: Edge) => { deleteElements({ edges: [edgeToDelete] }); toast({ title: '链路已删除' }); setContextMenu(null); };

  const handleRenderMasterInstancesOnCanvas = useCallback(async (masterIdToRender: string) => {
    const masterConfig = getApiConfigById(masterIdToRender);
    if (!masterConfig) { toast({ title: "错误", description: "无法找到选定主控的配置。", variant: "destructive" }); return; }
    const apiR = getApiRootUrl(masterIdToRender); const apiT = getToken(masterIdToRender);
    if (!apiR || !apiT) { toast({ title: "错误", description: `主控 "${masterConfig.name}" 的API配置不完整。`, variant: "destructive" }); return; }

    setNodesInternal([]); setEdgesInternal([]); setNodeIdCounter(0); setSelectedNode(null); setContextMenu(null);
    let currentIdCounter = 0;

    toast({ title: `正在加载主控 ${masterConfig.name} 的实例...` });

    try {
        const fetchedInstancesRaw: ApiInstanceType[] = await nodePassApi.getInstances(apiR, apiT);
        const instancesForThisMaster = fetchedInstancesRaw.filter(inst => inst.id !== '********');

        const newRenderedNodes: Node[] = [];
        
        const mContainerNodeId = `adv-master-container-${masterConfig.id.substring(0, 8)}-${++currentIdCounter}`;
        const mContainerNode: Node = {
            id: mContainerNodeId, type: 'masterNode', position: { x: 100, y: 50 }, 
            data: {
                label: `主控: ${masterConfig.name}`, role: 'M', isContainer: true,
                masterId: masterConfig.id, masterName: masterConfig.name,
                apiUrl: masterConfig.apiUrl, defaultLogLevel: masterConfig.masterDefaultLogLevel,
                defaultTlsMode: masterConfig.masterDefaultTlsMode, masterSubRole: 'container',
            },
            style: { ...nodeStyles.m.base, width: MIN_MASTER_NODE_WIDTH, height: MIN_MASTER_NODE_HEIGHT },
            width: MIN_MASTER_NODE_WIDTH, height: MIN_MASTER_NODE_HEIGHT,
        };
        newRenderedNodes.push(mContainerNode);
        
        let internalNodeYOffset = M_NODE_CHILD_PADDING;
        const internalNodeXOffset = M_NODE_CHILD_PADDING;

        for (const inst of instancesForThisMaster) {
            const parsedUrl = parseNodePassUrl(inst.url); 
            const commonNodeData: Partial<CustomNodeData> = {
                originalInstanceId: inst.id, originalInstanceUrl: inst.url,
                tunnelAddress: parsedUrl.tunnelAddress || '', targetAddress: parsedUrl.targetAddress || '',
                logLevel: parsedUrl.logLevel || 'master',
                tlsMode: parsedUrl.tlsMode || (inst.type === 'client' ? '0' : 'master'),
                certPath: parsedUrl.certPath || '', keyPath: parsedUrl.keyPath || '',
                parentNode: mContainerNodeId, 
                isExpanded: false,
            };

            const nodeTypeIcon = inst.type === 'server' ? Server : DatabaseZap;
            const nodeRole = inst.type === 'server' ? 'S' : 'C';
            const instanceNodeId = `${nodeRole.toLowerCase()}-${inst.id.substring(0,8)}-${++currentIdCounter}`;
            
            const instanceNode: Node = {
                id: instanceNodeId, type: 'cardNode',
                position: { x: internalNodeXOffset, y: internalNodeYOffset },
                parentNode: mContainerNodeId, extent: 'parent',
                data: {
                    ...commonNodeData,
                    label: `${nodeRole}: ${inst.id.substring(0,5)}..`, role: nodeRole, icon: nodeTypeIcon,
                    isSingleEndedForwardC: nodeRole === 'C' ? (parsedUrl.scheme === 'client' && isWildcardHostname(extractHostname(parsedUrl.tunnelAddress || ""))) : undefined, 
                } as CustomNodeData,
                width: ICON_ONLY_NODE_SIZE, height: ICON_ONLY_NODE_SIZE,
            };
            newRenderedNodes.push(instanceNode);
            internalNodeYOffset += ICON_ONLY_NODE_SIZE + 15; 
        }
        
        const finalNodesWithChildren = updateMasterNodeDimensions(mContainerNodeId, newRenderedNodes);

        setNodesInternal(finalNodesWithChildren);
        setNodeIdCounter(currentIdCounter);

        setTimeout(() => { fitView({ duration: 400, padding: 0.1 }); handleFormatLayout(); }, 100);
        toast({ title: `主控 ${masterConfig.name} 的实例已渲染。`, description: `共 ${instancesForThisMaster.length} 个实例。` });

    } catch (error: any) {
      console.error(`渲染主控 ${masterConfig.name} 实例失败:`, error);
      toast({ title: `渲染主控 ${masterConfig.name} 实例失败`, description: error.message, variant: "destructive" });
      setNodesInternal([]); setEdgesInternal([]);
    }
  }, [getApiConfigById, getApiRootUrl, getToken, toast, setNodesInternal, setEdgesInternal, fitView, updateMasterNodeDimensions, handleFormatLayout]);


  return (
    <div ref={editorContainerRef} className="flex flex-col flex-grow h-full relative">
      <div className="flex flex-row flex-grow h-full overflow-hidden">
        <ScrollArea className="w-60 flex-shrink-0 border-r bg-muted/30 p-2">
          <div className="flex flex-col h-full bg-background rounded-lg shadow-md border">
            <div className="flex flex-col p-3">
              <h2 className="text-sm font-semibold font-title mb-1 flex items-center">
                <ListTree size={16} className="mr-2 text-primary" />
                主控列表 (M)
              </h2>
              <p className="text-xs text-muted-foreground font-sans mb-2">拖拽主控到画布创建容器。</p>
              <ScrollArea className="flex-grow pr-1 max-h-60">
                <MastersPalette onRenderMasterInstances={handleRenderMasterInstancesOnCanvas} />
              </ScrollArea>
            </div>
            <Separator className="my-0" />
            <div className="flex flex-col p-3">
              <h2 className="text-sm font-semibold font-title mb-1 flex items-center">
                <Puzzle size={16} className="mr-2 text-primary" />
                组件 (U, S, C, T)
              </h2>
              <p className="text-xs text-muted-foreground font-sans mb-2">拖拽 S/C 到主控容器内，U/T 到画布。</p>
              <div className="flex-grow overflow-y-auto pr-1"><ComponentsPalette /></div>
            </div>
            <Separator className="my-0" />
            <div className="flex flex-col flex-grow min-h-0 p-3">
              <h2 className="text-sm font-semibold font-title mb-1 flex items-center">
                <InfoIcon size={16} className="mr-2 text-primary" />
                节点属性
              </h2>
              <p className="text-xs text-muted-foreground font-sans mb-2">{selectedNode ? `选中: ${selectedNode.data.label || selectedNode.id}` : '点击节点查看属性。'}</p>
              <div className="flex-grow overflow-y-hidden"><PropertiesDisplayPanel selectedNode={selectedNode} /></div>
            </div>
          </div>
        </ScrollArea>
        <div className="flex-grow flex flex-col overflow-hidden p-2">
          <div className="flex-grow relative">
            <div className="absolute inset-0">
              <TopologyCanvasWrapper
                nodes={nodesInternal} edges={edgesInternal} onNodesChange={onNodesChangeInternalCallback} onEdgesChange={onEdgesChangeInternal} onConnect={onConnect}
                onSelectionChange={onSelectionChange} reactFlowWrapperRef={reactFlowWrapperRef} onNodeClick={onNodeClickHandler}
                onCenterView={handleCenterViewCallback} onFormatLayout={handleFormatLayout}
                onClearCanvas={handleClearCanvasCallback} onTriggerSubmitTopology={handleTriggerSubmitTopology}
                canSubmit={(nodesInternal.length > 0 || edgesInternal.length > 0) && !isSubmitting}
                isSubmitting={isSubmitting}
                onNodeDropOnCanvas={handleNodeDroppedOnCanvas} onNodeContextMenu={onNodeContextMenu} onEdgeContextMenu={onEdgeContextMenu} onPaneClick={onPaneClick}
              />
            </div>
          </div>
        </div>
      </div>
      {contextMenu && (
        <div ref={menuRef} style={{ top: contextMenu.top, left: contextMenu.left }} className="absolute z-[100] bg-popover border border-border rounded-md shadow-xl p-1.5 text-popover-foreground text-xs min-w-[150px]">
          {contextMenu.type === 'node' && (contextMenu.data as Node).data.role !== 'U' && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleOpenEditNodeDialog(contextMenu.data as Node)}>修改属性</Button>
          )}
          
          {(contextMenu.data as Node).type === 'node' && (contextMenu.data as Node).data.role === 'S' && (contextMenu.data as Node).data.parentNode && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleChangeNodeRole((contextMenu.data as Node).id, 'C')}>更改为入口(c)</Button>
          )}
          {(contextMenu.data as Node).type === 'node' && (contextMenu.data as Node).data.role === 'C' && (contextMenu.data as Node).data.parentNode && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleChangeNodeRole((contextMenu.data as Node).id, 'S')}>更改为出口(s)</Button>
          )}
          {contextMenu.type === 'node' && <Separator className="my-1"/>}
          {contextMenu.type === 'node' && (
              <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans text-destructive hover:!text-destructive" onClick={() => handleDeleteNode(contextMenu.data as Node)}>删除角色</Button>
          )}
          {contextMenu.type === 'edge' && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans text-destructive hover:!text-destructive" onClick={() => handleDeleteEdge(contextMenu.data as Edge)}>删除链路</Button>
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
