
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
  type OnNodesChange,
  type OnEdgesChange,
} from 'reactflow';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'; // Added useQuery
import { Server, DatabaseZap, Cable, UserCircle2 as User, Globe, Cog, ListTree, Puzzle, Info as InfoIcon } from 'lucide-react'; // Updated Icons

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
import { nodePassApi, type Instance as ApiInstanceType } from '@/lib/api'; // Added ApiInstanceType
import { buildUrlFromFormValues, type BuildUrlParams } from '@/components/nodepass/create-instance-dialog/utils';
import { extractPort, extractHostname, formatHostForDisplay, isWildcardHostname, formatHostForUrl, parseNodePassUrl } from '@/lib/url-utils';
import { SubmitTopologyConfirmationDialog, type InstanceUrlConfigWithName } from './components/SubmitTopologyConfirmationDialog';
import { EditTopologyNodeDialog } from './components/EditTopologyNodeDialog';

import type { Node, CustomNodeData, NodeRole, TopologyContextMenu } from './topologyTypes';
import { CARD_NODE_WIDTH, CARD_NODE_HEIGHT, nodeStyles } from './NodeRenderer';
import { getEffectiveServerMasterConfig, calculateClientTunnelAddressForServer } from './topologyLogic';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

const TOTAL_ZOOM_LEVELS = 10;
const TARGET_ZOOM_LEVEL = 4;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 1.0;
const zoomStep = (MAX_ZOOM - MIN_ZOOM) / (TOTAL_ZOOM_LEVELS - 1);
const initialZoom = MIN_ZOOM + (TARGET_ZOOM_LEVEL - 1) * zoomStep;

const M_NODE_FOR_LINK_WIDTH = 200;
const M_NODE_FOR_LINK_HEIGHT = 60; // Increased height for M nodes in U-M-T links


export function TopologyEditor() {
  const [nodesInternal, setNodesInternal, onNodesChangeInternal] = useNodesState<Node>(initialNodes);
  const [edgesInternal, setEdgesInternal, onEdgesChangeInternal] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(0);
  const { toast } = useToast();
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);
  const { deleteElements, fitView, getViewport, setViewport } = useReactFlow(); // Added getViewport, setViewport
  const [contextMenu, setContextMenu] = useState<TopologyContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const { getApiConfigById, getApiRootUrl, getToken } = useApiConfig();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [instancesForConfirmation, setInstancesForConfirmation] = useState<InstanceUrlConfigWithName[]>([]);
  const [isEditNodeDialogOpen, setIsEditNodeDialogOpen] = useState(false);
  // const [nodeToEdit, setNodeToEdit] = useState<Node | null>(null); // Replaced by editingNodeContext
  const [editingNodeContext, setEditingNodeContext] = useState<{ node: Node; hasS: boolean } | null>(null);


  const getNodeById = useCallback((id: string): Node | undefined => nodesInternal.find((n) => n.id === id), [nodesInternal]);

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
      toast({ title: `实例创建成功`, description: `节点 ${variables.originalNodeId.substring(0,8)}... -> ID: ${createdInstance.id.substring(0,8)}...` });
      setNodesInternal(nds => nds.map(n => {
         if (n.id === variables.originalNodeId) {
            let message = `ID: ${createdInstance.id.substring(0,8)}...`;
            if (n.data.role === 'M' && n.data.submissionMessage && n.data.submissionMessage.startsWith('ID:')) {
                message = `${n.data.submissionMessage}, ${message}`;
            }
            return { ...n, data: { ...n.data, submissionStatus: 'success', submissionMessage: message } };
        }
        return n;
      }));
      const submittedInstanceInfo = instancesForConfirmation.find(inst => inst.nodeId === variables.originalNodeId && inst.url === variables.data.url);
      if (submittedInstanceInfo) {
        queryClient.invalidateQueries({ queryKey: ['instances', submittedInstanceInfo.masterId]});
        queryClient.invalidateQueries({ queryKey: ['masterInstancesCount', submittedInstanceInfo.masterId]});
      } else {
         const masterIdForInvalidation = getNodeById(variables.originalNodeId)?.data.masterId;
         if (masterIdForInvalidation) {
           queryClient.invalidateQueries({ queryKey: ['instances', masterIdForInvalidation]});
           queryClient.invalidateQueries({ queryKey: ['masterInstancesCount', masterIdForInvalidation]});
         }
      }
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTopologyPage']});
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']});
    },
    onError: (error: any, variables) => {
      toast({ title: `创建实例失败 (节点 ${variables.originalNodeId.substring(0,8)}...)`, description: error.message || '未知错误', variant: 'destructive' });
      setNodesInternal(nds => nds.map(n => {
        if (n.id === variables.originalNodeId) {
           let message = error.message.substring(0,30) || '失败';
            if (n.data.role === 'M' && n.data.submissionMessage && n.data.submissionMessage.startsWith('ID:')) {
                message = `${n.data.submissionMessage}, 另一部分: ${message}`;
            }
           return { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: message } };
        }
        return n;
      }));
    },
  });

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      const sourceNode = getNodeById(params.source!);
      const targetNode = getNodeById(params.target!);

      if (!sourceNode || !targetNode) {
        toast({ title: '连接错误', description: '源节点或目标节点未找到。', variant: 'destructive' });
        return;
      }
      if (params.source === params.target) {
        toast({ title: '连接无效', description: '节点不能连接到自身。', variant: 'destructive' });
        return;
      }
      if (edgesInternal.some(edge => (edge.source === params.source && edge.target === params.target) || (edge.source === params.target && edge.target === params.source))) {
        toast({ title: '连接已存在', description: '这两个节点之间已经存在一条连接。', variant: 'destructive' });
        return;
      }

      if (targetNode.data.role === 'U') {
        toast({ title: '连接无效', description: '用户端 (U) 节点不能被其他节点链接。', variant: 'destructive' });
        return;
      }
      if (sourceNode.data.role === 'U' && targetNode.data.role !== 'M' && targetNode.data.role !== 'C') {
        toast({ title: '连接无效', description: '用户端 (U) 节点只能链接到主控 (M) 或 入口(c) 节点。', variant: 'destructive' });
        return;
      }


      if (sourceNode.data.role === 'T') {
        toast({ title: '连接无效', description: '落地 (T) 节点不能作为连接的起点。', variant: 'destructive' });
        return;
      }

      // Prevent C node in single-ended mode from connecting to S node in same master
      if (sourceNode.data.role === 'C' && sourceNode.data.isSingleEndedForwardC && targetNode.data.role === 'S' && sourceNode.data.parentNode === targetNode.data.parentNode) {
        toast({ title: '连接无效', description: '单端转发模式的入口(c)不能连接到同一主控内的出口(s)。', variant: 'destructive' });
        return;
      }


      if (targetNode.data.role === 'T') {
        const sourceIsConnectableToT = sourceNode.data.role === 'S' || (sourceNode.data.role === 'C' && !sourceNode.data.isSingleEndedForwardC) || (sourceNode.data.role === 'M' && sourceNode.data.masterSubRole === 'client-role');
        if (!sourceIsConnectableToT) {
            toast({ title: '连接无效', description: '落地 (T) 节点只能被主控 (客户隧道角色), 出口(s), 或 非单端转发的入口(c) 节点链接。', variant: 'destructive' });
            return;
        }
      }

      const sourceParentId = sourceNode.data.parentNode;
      const targetParentId = targetNode.data.parentNode;
      const isInternalConnection = sourceParentId && targetParentId && sourceParentId === targetParentId;

      if (isInternalConnection && !(sourceNode.data.role === 'C' && !sourceNode.data.isSingleEndedForwardC && targetNode.data.role === 'S')) {
         toast({ title: '连接无效', description: '在主控容器内，只允许从非单端转发模式的入口(c)连接到出口(s)。', variant: 'destructive' });
         return;
      }

      const newEdge = {
        ...params,
        animated: true,
        style: { strokeDasharray: '5 5' },
        type: isInternalConnection ? 'step' : 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
      };

      setEdgesInternal((eds) => addEdge(newEdge, eds));
      let updatedNodes = [...nodesInternal];

      if (sourceNode.data.role === 'C' && !sourceNode.data.isSingleEndedForwardC && targetNode.data.role === 'S') {
        const clientNode = sourceNode;
        const serverNode = targetNode;

        const effectiveServerMasterCfg = getEffectiveServerMasterConfig(serverNode.data, getNodeById, getApiConfigById);
        const newClientTunnelAddress = calculateClientTunnelAddressForServer(serverNode.data, effectiveServerMasterCfg);

        let clientLocalTargetPort = extractPort(clientNode.data.targetAddress || "");
        if (!clientLocalTargetPort) {
            const serverListenPortNum = parseInt(extractPort(serverNode.data.tunnelAddress || "") || "0", 10);
            if (serverListenPortNum > 0) {
                clientLocalTargetPort = (serverListenPortNum + 1).toString();
            }
        }
        const clientLocalTargetHost = extractHostname(clientNode.data.targetAddress || "") || "[::]";
        const newClientTargetAddress = clientLocalTargetPort ? `${formatHostForDisplay(clientLocalTargetHost)}:${clientLocalTargetPort}` : clientNode.data.targetAddress;

        updatedNodes = updatedNodes.map(n => {
            if (n.id === clientNode.id) {
                return { ...n, data: { ...n.data, tunnelAddress: newClientTunnelAddress, targetAddress: newClientTargetAddress } };
            }
            return n;
        });
        if (newClientTunnelAddress !== clientNode.data.tunnelAddress || newClientTargetAddress !== clientNode.data.targetAddress) {
          toast({ title: "入口(c) 地址已更新", description: `入口(c) ${clientNode.data.label} 已自动配置连接到 出口(s) ${serverNode.data.label}。`});
        }
      }

      const sourceIsConnectableToTForSync = sourceNode.data.role === 'S' || (sourceNode.data.role === 'C' && !sourceNode.data.isSingleEndedForwardC) || (sourceNode.data.role === 'M' && sourceNode.data.masterSubRole === 'client-role');
      if (sourceIsConnectableToTForSync && targetNode.data.role === 'T') {
        const scOrMNode = sourceNode;
        const tNode = targetNode;
        let tNodeUpdated = false;
        let scOrMNodeUpdated = false;

        const sourceTargetAddr = scOrMNode.data.targetAddress;

        if (sourceTargetAddr && sourceTargetAddr.trim() !== "" && sourceTargetAddr !== tNode.data.targetAddress) {
          updatedNodes = updatedNodes.map(n =>
            n.id === tNode.id ? { ...n, data: { ...n.data, targetAddress: sourceTargetAddr } } : n
          );
          tNodeUpdated = true;
        } else if (tNode.data.targetAddress && tNode.data.targetAddress.trim() !== "" && tNode.data.targetAddress !== sourceTargetAddr) {
          updatedNodes = updatedNodes.map(n =>
            n.id === scOrMNode.id ? { ...n, data: { ...n.data, targetAddress: tNode.data.targetAddress } } : n
          );
          scOrMNodeUpdated = true;
        }
        if (tNodeUpdated) toast({ title: `落地 ${tNode.data.label} 已同步上游目标地址。`});
        if (scOrMNodeUpdated) toast({ title: `${scOrMNode.data.label} 已同步落地目标地址。`});
      }
      setNodesInternal(updatedNodes);
    },
    [edgesInternal, setEdgesInternal, toast, getNodeById, setNodesInternal, nodesInternal, getApiConfigById]
  );

  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedNode(selectedNodesList.length === 1 ? selectedNodesList[0] : null);
    if (selectedNodesList.length !== 1) setContextMenu(null);
  }, []);

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
      let currentCounter = nodeIdCounter;
      const newNodes: Node[] = [];
      let newEdges: Edge[] = []; // Changed to let
      let nodesToFit: { id: string }[] | null = null;

      const mNodeWidth = 300, mNodeHeight = 200;

      const parentMContainer = nodesInternal.find(n => {
          if (n.data.role !== 'M' || !n.data.isContainer) return false;
          const { x: nodeX, y: nodeY } = n.position;
          const nodeWidth = n.width ?? 0;
          const nodeHeight = n.height ?? 0;
          return (position.x >= nodeX && position.x <= nodeX + nodeWidth && position.y >= nodeY && position.y <= nodeY + nodeHeight);
      });

      if (type === 'master' && draggedData) {
          if (parentMContainer) {
              const sNodeId = `s-from-master-${draggedData.id.substring(0, 8)}-${++currentCounter}`;
              const relativePosition = { x: position.x - parentMContainer.position.x - (CARD_NODE_WIDTH / 2), y: position.y - parentMContainer.position.y - (CARD_NODE_HEIGHT / 2) };
              const sNode: Node = {
                  id: sNodeId, type: 'cardNode', position: relativePosition, parentNode: parentMContainer.id, extent: 'parent',
                  data: {
                      label: `出口(s): ${draggedData.name}`, role: 'S', icon: Server, parentNode: parentMContainer.id,
                      representedMasterId: draggedData.id, representedMasterName: draggedData.name,
                      tunnelAddress: `[::]:${10000 + currentCounter}`,
                      targetAddress: `127.0.0.1:${3000 + currentCounter}`,
                      logLevel: draggedData.masterDefaultLogLevel || parentMContainer.data.defaultLogLevel || 'master',
                      tlsMode: draggedData.masterDefaultTlsMode || parentMContainer.data.defaultTlsMode || 'master',
                  },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              };
              newNodes.push(sNode);

              // Find default client in this parentMContainer that is single-ended AND needs to be converted
              const defaultClientToConvert = nodesInternal.find(n => n.data.parentNode === parentMContainer.id && n.data.isDefaultClient && n.data.isSingleEndedForwardC);
              if (defaultClientToConvert) {
                  const effectiveServerMasterCfg = getEffectiveServerMasterConfig(sNode.data, (id) => newNodes.concat(nodesInternal).find(n => n.id === id), getApiConfigById);
                  const newClientTunnelAddr = calculateClientTunnelAddressForServer(sNode.data, effectiveServerMasterCfg);
                  const newClientTargetAddr = `[::]:${(parseInt(extractPort(sNode.data.tunnelAddress || "0") || "0", 10) + 1).toString()}`;

                  setNodesInternal(nds => nds.map(n => {
                      if (n.id === defaultClientToConvert.id) {
                          return {
                              ...n,
                              data: {
                                  ...n.data,
                                  isSingleEndedForwardC: false, // Convert to normal client
                                  tunnelAddress: newClientTunnelAddr,
                                  targetAddress: newClientTargetAddr,
                                  tlsMode: parentMContainer.data.defaultTlsMode || 'master',
                              }
                          };
                      }
                      return n;
                  }));
                  newEdges.push({
                      id: `edge-${defaultClientToConvert.id}-${sNode.id}`, source: defaultClientToConvert.id, target: sNode.id,
                      type: 'step', markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
                  });
                  toast({ title: "入口(c)已更新并连接到新出口(s)" });
              } else {
                // If no single-ended client to convert, check if there's a normal default client to connect to
                const normalDefaultClient = nodesInternal.find(n => n.data.parentNode === parentMContainer.id && n.data.isDefaultClient && !n.data.isSingleEndedForwardC);
                if (normalDefaultClient) {
                     newEdges.push({
                        id: `edge-${normalDefaultClient.id}-${sNode.id}`, source: normalDefaultClient.id, target: sNode.id,
                        type: 'step', markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
                    });
                     toast({ title: "新出口(s)已连接到默认入口(c)" });
                }
              }

              toast({ title: "出口(s)节点已添加至主控容器" });
          } else {
              const mId = `master-${draggedData.id.substring(0, 8)}-${++currentCounter}`;
              const uId = `user-for-${mId}`;
              const cId = `default-client-for-${mId}`;
              const tId = `default-tunnel-for-${mId}`;

              newNodes.push({
                  id: mId, type: 'masterNode', position,
                  data: {
                    label: `主控: ${draggedData.name || '未命名'}`, role: 'M', isContainer: true,
                    masterId: draggedData.id, masterName: draggedData.name,
                    apiUrl: draggedData.apiUrl,
                    defaultLogLevel: draggedData.masterDefaultLogLevel,
                    defaultTlsMode: draggedData.masterDefaultTlsMode,
                    masterSubRole: "server-role",
                  },
                  style: { ...nodeStyles.m.base, width: mNodeWidth, height: mNodeHeight },
                  width: mNodeWidth, height: mNodeHeight,
              });

              // Default client is single-ended because no S nodes in this new M yet.
              newNodes.push({
                  id: cId, type: 'cardNode', parentNode: mId, extent: 'parent',
                  position: { x: (mNodeWidth / 2) - (CARD_NODE_WIDTH / 2), y: 50 },
                  data: {
                    label: '本地 (C)', role: 'C', icon: DatabaseZap, parentNode: mId, isDefaultClient: true,
                    isSingleEndedForwardC: true, // True by default when M is new
                    tunnelAddress: `[::]:${10001 + currentCounter}`, // Local listen for single-ended
                    targetAddress: `remote.example.com:80`, // Remote target for single-ended
                    logLevel: draggedData.masterDefaultLogLevel || 'master',
                    tlsMode: '0', // Default for single-ended client's connection to target
                  },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              });

              newNodes.push({
                  id: uId, type: 'cardNode',
                  position: { x: position.x - CARD_NODE_WIDTH - 60, y: position.y + (mNodeHeight / 2) - (CARD_NODE_HEIGHT / 2) },
                  data: { label: '用户', role: 'U', icon: User },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              });

              newNodes.push({
                  id: tId, type: 'cardNode',
                  position: { x: position.x + mNodeWidth + 60, y: position.y + (mNodeHeight / 2) - (CARD_NODE_HEIGHT / 2) },
                  data: { label: '落地', role: 'T', icon: Globe, targetAddress: '192.168.1.10:80' },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              });

              newEdges.push({
                  id: `edge-${uId}-${mId}`, source: uId, target: mId, type: 'smoothstep', targetHandle: 'm-left',
                  markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
              });
              newEdges.push({
                  id: `edge-${mId}-${tId}`, source: mId, target: tId, type: 'smoothstep', sourceHandle: 'm-right',
                  markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
              });
              toast({ title: "主控容器已创建" });
              nodesToFit = [{ id: uId }, { id: mId }, { id: tId }];
          }
      } else if (type !== 'master') {
          const nodeRole = type.toUpperCase() as NodeRole;
          const { labelPrefix, icon, width, height } = {
              'S': { labelPrefix: '出口(s)', icon: Server, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
              'C': { labelPrefix: '入口(c)', icon: DatabaseZap, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
              'T': { labelPrefix: '落地', icon: Globe, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
              'U': { labelPrefix: '用户', icon: User, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
          }[nodeRole]!;

          if ((nodeRole === 'S' || nodeRole === 'C') && !parentMContainer) {
              toast({ title: "操作无效", description: `请将 ${labelPrefix} (${nodeRole}) 拖拽到主控 (M) 容器内。`, variant: "destructive" });
              return;
          }

          const newNodeId = `${nodeRole.toLowerCase()}-${++currentCounter}`;
          const newNodeData: CustomNodeData = {
             label: labelPrefix, role: nodeRole, icon,
             logLevel: 'master',
          };

          if (nodeRole === 'S') {
            newNodeData.tunnelAddress = `[::]:${10000 + currentCounter}`;
            newNodeData.targetAddress = `127.0.0.1:${3000 + currentCounter}`;
            newNodeData.tlsMode = parentMContainer?.data.defaultTlsMode || 'master';
          } else if (nodeRole === 'C') {
            if (parentMContainer) {
                const sNodesInParent = nodesInternal.filter(n => n.data.parentNode === parentMContainer.id && n.data.role === 'S');
                newNodeData.isSingleEndedForwardC = sNodesInParent.length === 0;
                if (newNodeData.isSingleEndedForwardC) {
                    newNodeData.tunnelAddress = `[::]:${10002 + currentCounter + Math.floor(Math.random()*50)}`;
                    newNodeData.targetAddress = `some.external.service:${8000 + currentCounter}`;
                    newNodeData.tlsMode = '0';
                } else {
                    newNodeData.targetAddress = `[::]:${10001 + currentCounter + Math.floor(Math.random()*50)}`;
                    newNodeData.tlsMode = parentMContainer.data.defaultTlsMode || 'master';
                }
            } else { // Should not happen based on earlier check, but as fallback
                newNodeData.isSingleEndedForwardC = true;
                newNodeData.tunnelAddress = `[::]:${10002 + currentCounter + Math.floor(Math.random()*50)}`;
                newNodeData.targetAddress = `some.external.service:${8000 + currentCounter}`;
                newNodeData.tlsMode = '0';
            }
          } else if (nodeRole === 'T') {
            newNodeData.targetAddress = '192.168.1.20:8080';
          }

          const newNode: Node = { id: newNodeId, type: 'cardNode', position, data: newNodeData, width, height };

          if (parentMContainer) {
              newNode.parentNode = parentMContainer.id;
              newNode.extent = 'parent';
              newNode.position = { x: position.x - parentMContainer.position.x - (width / 2), y: position.y - parentMContainer.position.y - (height / 2) };
              newNode.data.logLevel = parentMContainer.data.defaultLogLevel || 'master';
              if (nodeRole === 'S') newNode.data.tlsMode = parentMContainer.data.defaultTlsMode || 'master';
              // For C nodes, tlsMode is already set based on isSingleEndedForwardC logic above.

              if (nodeRole === 'S') {
                  const defaultClientToConvert = nodesInternal.find(n => n.data.parentNode === parentMContainer.id && n.data.isDefaultClient && n.data.isSingleEndedForwardC);
                  if (defaultClientToConvert) {
                        const effectiveServerMasterCfg = getEffectiveServerMasterConfig(newNode.data, (id) => newNodes.concat(nodesInternal).find(n => n.id === id), getApiConfigById);
                        const newClientTunnelAddr = calculateClientTunnelAddressForServer(newNode.data, effectiveServerMasterCfg);
                        const newClientTargetAddr = `[::]:${(parseInt(extractPort(newNode.data.tunnelAddress || "0") || "0", 10) + 1).toString()}`;

                        setNodesInternal(nds => nds.map(n => {
                           if (n.id === defaultClientToConvert.id) {
                               return { ...n, data: {
                                   ...n.data,
                                   isSingleEndedForwardC: false,
                                   tunnelAddress: newClientTunnelAddr,
                                   targetAddress: newClientTargetAddr,
                                   tlsMode: parentMContainer.data.defaultTlsMode || 'master',
                               }};
                           }
                           return n;
                        }));
                        newEdges.push({
                            id: `edge-${defaultClientToConvert.id}-${newNodeId}`, source: defaultClientToConvert.id, target: newNodeId,
                            type: 'step', markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
                        });
                        toast({ title: "入口(c)已更新并连接到新出口(s)" });
                  } else {
                     const normalDefaultClient = nodesInternal.find(n => n.data.parentNode === parentMContainer.id && n.data.isDefaultClient && !n.data.isSingleEndedForwardC);
                     if (normalDefaultClient) {
                         newEdges.push({
                            id: `edge-${normalDefaultClient.id}-${newNodeId}`, source: normalDefaultClient.id, target: newNodeId,
                            type: 'step', markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
                        });
                         toast({ title: "新出口(s)已连接到默认入口(c)" });
                     }
                  }
              }
          }
          newNodes.push(newNode);
          toast({ title: `${labelPrefix} 节点已添加` });
      } else { return; }

      setNodesInternal(nds => nds.concat(newNodes));
      if (newEdges.length > 0) setEdgesInternal(eds => eds.concat(newEdges));
      setNodeIdCounter(currentCounter + newNodes.length);

      if (nodesToFit) {
        setTimeout(() => {
          fitView({ nodes: nodesToFit, duration: 400, padding: 0.2 });
        }, 50);
      }
  }, [nodeIdCounter, nodesInternal, toast, setNodesInternal, setEdgesInternal, fitView, getApiConfigById]);

    const handleChangeNodeRole = useCallback((nodeId: string, newRole: 'S' | 'C') => {
        setNodesInternal(nds => nds.map(node => {
            if (node.id === nodeId) {
                const newLabel = newRole === 'S' ? '出口(s)' : '入口(c)';
                const newIcon = newRole === 'S' ? Server : DatabaseZap;
                let newData: CustomNodeData = { ...node.data, role: newRole, icon: newIcon, label: newLabel };
                const parentM = node.data.parentNode ? getNodeById(node.data.parentNode) : null;

                if (newRole === 'S') { // Becoming a Server
                    newData.isSingleEndedForwardC = false; // Servers are not single-ended
                    newData.tlsMode = parentM?.data.defaultTlsMode || 'master';
                    // Server needs tunnelAddress (listen) and targetAddress (forward)
                    if (!newData.tunnelAddress || newData.tunnelAddress.startsWith("remote.example.com")) newData.tunnelAddress = `[::]:${10000 + nodeIdCounter}`;
                    if (!newData.targetAddress || newData.targetAddress.startsWith("[::]")) newData.targetAddress = `127.0.0.1:${3000 + nodeIdCounter}`;
                } else if (newRole === 'C') { // Becoming a Client
                    if (parentM) {
                        const sNodesInParent = nodesInternal.filter(n => n.data.parentNode === parentM.id && n.data.role === 'S' && n.id !== nodeId);
                        newData.isSingleEndedForwardC = sNodesInParent.length === 0;
                        if (newData.isSingleEndedForwardC) {
                            newData.tlsMode = '0';
                            if (!newData.tunnelAddress || !newData.tunnelAddress.startsWith("[::]")) newData.tunnelAddress = `[::]:${10000 + nodeIdCounter + 1}`;
                            if (!newData.targetAddress || newData.targetAddress.startsWith("127.0.0.1")) newData.targetAddress = `remote.service.com:${8000 + nodeIdCounter}`;
                        } else {
                            newData.tlsMode = parentM.data.defaultTlsMode || 'master';
                             // Client needs tunnelAddress (connect to S) and targetAddress (local forward)
                            const firstSNode = sNodesInParent[0]; // Connect to the first available S node
                            if (firstSNode?.data.tunnelAddress) {
                                newData.tunnelAddress = calculateClientTunnelAddressForServer(firstSNode.data, getEffectiveServerMasterConfig(firstSNode.data, getNodeById, getApiConfigById));
                                newData.targetAddress = `[::]:${(parseInt(extractPort(firstSNode.data.tunnelAddress) || "0", 10) + 1).toString()}`;
                            } else { // Fallback if no S node to connect to (should ideally not happen if !isSingleEndedForwardC)
                                newData.tunnelAddress = ""; // Clear it, user must define
                                newData.targetAddress = `[::]:${10000 + nodeIdCounter + 2}`;
                            }
                        }
                    } else { // No parent, client defaults to single-ended
                        newData.isSingleEndedForwardC = true;
                        newData.tlsMode = '0';
                        newData.tunnelAddress = `[::]:${10000 + nodeIdCounter + 1}`;
                        newData.targetAddress = `remote.service.com:${8000 + nodeIdCounter}`;
                    }
                }
                return { ...node, data: newData };
            }
            return node;
        }));
        toast({ title: "角色已更改" });
        setContextMenu(null);
    }, [setNodesInternal, toast, getNodeById, nodesInternal, getApiConfigById, nodeIdCounter]);

  const handleClearCanvasCallback = useCallback(() => {
    setNodesInternal([]); setEdgesInternal([]); setNodeIdCounter(0); setSelectedNode(null); setContextMenu(null);
    toast({ title: '画布已清空' });
  }, [setNodesInternal, setEdgesInternal, toast]);

  const handleCenterViewCallback = useCallback((instance: ReturnType<typeof useReactFlow> | null) => {
      if (!instance) return;
      setContextMenu(null);
      instance.fitView({ duration: 300, padding: 0.2 });
  }, []);

  const prepareInstancesForSubmission = useCallback((): InstanceUrlConfigWithName[] => {
    const instancesToCreate: InstanceUrlConfigWithName[] = [];
    for (const node of nodesInternal) {
      if (node.data.role === 'S' || node.data.role === 'C') {
        let masterId: string | undefined;
        if (node.data.representedMasterId) {
            masterId = node.data.representedMasterId;
        } else if (node.parentNode) {
            const parentMNode = getNodeById(node.parentNode);
            masterId = parentMNode?.data.masterId;
        }

        if (!masterId) {
          setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '无主控' } } : n));
          continue;
        }

        const masterConfig = getApiConfigById(masterId);
        if (!masterConfig) {
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
            logLevel: (node.data.logLevel as any) || 'master',
            tlsMode: (node.data.tlsMode as any) || 'master',
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
              tunnelAddress: node.data.tunnelAddress, // This is local listen for single-ended
              targetAddress: node.data.targetAddress, // This is remote target for single-ended
              logLevel: (node.data.logLevel as any) || 'master',
              tlsMode: (node.data.tlsMode as any) || '0', // Default TLS for single-ended client target conn
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
              tunnelAddress: node.data.tunnelAddress, // Connect to S
              targetAddress: node.data.targetAddress, // Local forward
              logLevel: (node.data.logLevel as any) || 'master',
              tlsMode: (node.data.tlsMode as any) || 'master', // Default TLS for client-server conn
              certPath: node.data.certPath,
              keyPath: node.data.keyPath,
            };
          }
        }

        if (urlParams) {
          const finalUrl = buildUrlFromFormValues(urlParams, masterConfig);
          instancesToCreate.push({
            nodeId: node.id,
            nodeLabel: node.data.representedMasterName ? `${instanceTypeForBuild}: ${node.data.representedMasterName}` : node.data.label,
            masterId: masterConfig.id,
            masterName: masterConfig.name,
            url: finalUrl,
            instanceType: instanceTypeForBuild
          });
        }
      } else if (node.data.role === 'M' && node.data.masterSubRole === 'client-role' && node.data.remoteMasterIdForTunnel && node.data.remoteServerListenAddress && node.data.remoteServerForwardAddress && node.data.targetAddress) {
        const clientMasterConfig = getApiConfigById(node.data.masterId!);
        const serverMasterConfig = getApiConfigById(node.data.remoteMasterIdForTunnel);

        if (!clientMasterConfig || !serverMasterConfig) {
          setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '隧道主控配置不完整' } } : n));
          continue;
        }

        const clientRemoteHost = extractHostname(serverMasterConfig.apiUrl);
        const clientRemotePort = extractPort(node.data.remoteServerListenAddress);
        if (!clientRemoteHost || !clientRemotePort) {
            setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '无法构建客户端隧道地址' } } : n));
            continue;
        }
        const clientTunnelAddressToRemote = `${formatHostForUrl(clientRemoteHost)}:${clientRemotePort}`;

        const clientUrlParams: BuildUrlParams = {
            instanceType: "入口(c)",
            tunnelAddress: clientTunnelAddressToRemote,
            targetAddress: node.data.targetAddress,
            logLevel: (node.data.logLevel as any) || clientMasterConfig.masterDefaultLogLevel || 'master',
            tlsMode: (node.data.tlsMode as any) || clientMasterConfig.masterDefaultTlsMode || 'master',
            certPath: node.data.certPath,
            keyPath: node.data.keyPath,
        };
        const clientFinalUrl = buildUrlFromFormValues(clientUrlParams, clientMasterConfig);
        instancesToCreate.push({
            nodeId: node.id,
            nodeLabel: `${node.data.label} (入口部分)`,
            masterId: clientMasterConfig.id,
            masterName: clientMasterConfig.name,
            url: clientFinalUrl,
            instanceType: "入口(c)",
        });

        const serverUrlParams: BuildUrlParams = {
            instanceType: "出口(s)",
            tunnelAddress: node.data.remoteServerListenAddress,
            targetAddress: node.data.remoteServerForwardAddress,
            logLevel: (node.data.logLevel as any) || serverMasterConfig.masterDefaultLogLevel || 'master',
            tlsMode: (node.data.tlsMode as any) || serverMasterConfig.masterDefaultTlsMode || 'master',
            certPath: (node.data.tlsMode === '2' && clientUrlParams.tlsMode === '2') ? node.data.certPath : "",
            keyPath: (node.data.tlsMode === '2' && clientUrlParams.tlsMode === '2') ? node.data.keyPath : "",
        };
        const serverFinalUrl = buildUrlFromFormValues(serverUrlParams, serverMasterConfig);
        instancesToCreate.push({
            nodeId: node.id,
            nodeLabel: `${node.data.label} (出口部分 @ ${serverMasterConfig.name})`,
            masterId: serverMasterConfig.id,
            masterName: serverMasterConfig.name,
            url: serverFinalUrl,
            instanceType: "出口(s)",
        });
      }
    }
    return instancesToCreate;
  }, [nodesInternal, getNodeById, getApiConfigById, setNodesInternal]);

  const handleTriggerSubmitTopology = useCallback(() => {
    setContextMenu(null);
    setNodesInternal(nds => nds.map(n => ({ ...n, data: { ...n.data, submissionStatus: undefined, submissionMessage: undefined } })));

    const instancesToCreate = prepareInstancesForSubmission();

    if (instancesToCreate.length === 0) {
      toast({ title: '无实例可提交', description: '请配置有效的出口(s)/入口(c)节点或跨主控隧道。' });
      return;
    }
    setInstancesForConfirmation(instancesToCreate);
    setIsSubmitConfirmOpen(true);
  }, [prepareInstancesForSubmission, toast, setNodesInternal]);

  const executeActualSubmission = useCallback(async () => {
    setIsSubmitting(true);
    setIsSubmitConfirmOpen(false);

    toast({ title: '开始提交拓扑...', description: `准备创建 ${instancesForConfirmation.length} 个实例。` });

    const submissionPromises = instancesForConfirmation.map(inst => {
      const apiR = getApiRootUrl(inst.masterId);
      const apiT = getToken(inst.masterId);
      if (!apiR || !apiT) {
        setNodesInternal(nds => nds.map(n => n.id === inst.nodeId ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '主控API无效' } } : n));
        return Promise.reject(new Error(`主控 ${inst.masterName} API配置无效。`));
      }
      return createInstanceMutation.mutateAsync({ data: { url: inst.url }, useApiRoot: apiR, useApiToken: apiT, originalNodeId: inst.nodeId });
    });

    try {
        await Promise.allSettled(submissionPromises);
        toast({ title: '拓扑提交处理完毕', description: '检查各节点状态。'});
    } catch (e) {
        console.error("拓扑提交出错:", e);
        toast({ title: '拓扑提交过程中发生意外错误', variant: 'destructive' });
    } finally {
        setIsSubmitting(false);
        setInstancesForConfirmation([]);
    }
  }, [instancesForConfirmation, getApiRootUrl, getToken, toast, createInstanceMutation, setNodesInternal]);

  const handleOpenEditNodeDialog = (node: Node) => {
    let hasS = false;
    if (node.data.role === 'C' && node.data.parentNode) {
        hasS = nodesInternal.some(n => n.data.parentNode === node.data.parentNode && n.data.role === 'S');
    }
    setEditingNodeContext({ node, hasS });
    setIsEditNodeDialogOpen(true);
    setContextMenu(null);
  };

  const handleSaveNodeProperties = useCallback((nodeId: string, updatedDataFromDialog: Partial<CustomNodeData>) => {
    let newNodes = [...nodesInternal];
    const nodeIndex = newNodes.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) return;

    const originalNodeDataFromState = newNodes[nodeIndex].data; // Get it before potential modification
    // const originalNodeDataFromState = nodesInternal.find(n => n.id === nodeId)?.data; // This would be pre-modification too.

    const mergedData = { ...originalNodeDataFromState, ...updatedDataFromDialog };
    newNodes[nodeIndex] = { ...newNodes[nodeIndex], data: mergedData };

    const editedNode = newNodes[nodeIndex];

    const isForwardingSourceNode = editedNode.data.role === 'S' || (editedNode.data.role === 'C' && !editedNode.data.isSingleEndedForwardC) || (editedNode.data.role === 'M' && editedNode.data.masterSubRole === 'client-role');

    if (isForwardingSourceNode) {
        edgesInternal.forEach(edge => {
            if (edge.source === editedNode.id) {
                const targetTNodeIndex = newNodes.findIndex(n => n.id === edge.target && n.data.role === 'T');
                if (targetTNodeIndex !== -1) {
                    const connectedTNodeOriginalData = nodesInternal.find(n => n.id === newNodes[targetTNodeIndex].id)?.data;
                    if (editedNode.data.targetAddress !== connectedTNodeOriginalData?.targetAddress) {
                        newNodes[targetTNodeIndex] = {
                            ...newNodes[targetTNodeIndex],
                            data: { ...newNodes[targetTNodeIndex].data, targetAddress: editedNode.data.targetAddress }
                        };
                         if(originalNodeDataFromState.targetAddress !== editedNode.data.targetAddress){
                            toast({ title: `落地 ${newNodes[targetTNodeIndex].data.label} 已同步目标地址。`});
                         }
                    }
                }
            }
        });
    } else if (editedNode.data.role === 'T') {
        // const originalTNodeData = nodesInternal.find(n => n.id === editedNode.id)?.data; // This is original before this whole save.
        const originalTNodeData = originalNodeDataFromState; // If editedNode is T, this is its original data
        edgesInternal.forEach(edge => {
            if (edge.target === editedNode.id) {
                const sourceNodeIndex = newNodes.findIndex(n => n.id === edge.source && (n.data.role === 'S' || (n.data.role === 'C' && !n.data.isSingleEndedForwardC) || (n.data.role === 'M' && n.data.masterSubRole === 'client-role')));
                if (sourceNodeIndex !== -1) {
                     const connectedSourceNodeOriginalData = nodesInternal.find(n => n.id === newNodes[sourceNodeIndex].id)?.data;
                    if (editedNode.data.targetAddress !== connectedSourceNodeOriginalData?.targetAddress) {
                        newNodes[sourceNodeIndex] = {
                            ...newNodes[sourceNodeIndex],
                            data: { ...newNodes[sourceNodeIndex].data, targetAddress: editedNode.data.targetAddress }
                        };
                         if (originalTNodeData?.targetAddress !== editedNode.data.targetAddress) { 
                           toast({ title: `${newNodes[sourceNodeIndex].data.label} 已同步落地目标地址。`});
                         }
                    }
                }
            }
        });
    }

    if (editedNode.data.role === 'S') {
        edgesInternal.forEach(edge => {
            if (edge.target === editedNode.id) { // If an edge points TO this S node (it's a target)
                const clientNodeIndex = newNodes.findIndex(n => n.id === edge.source && n.data.role === 'C' && !n.data.isSingleEndedForwardC);
                if (clientNodeIndex !== -1) {
                    const clientNode = newNodes[clientNodeIndex];
                    const effectiveServerMasterCfg = getEffectiveServerMasterConfig(editedNode.data, (id) => newNodes.find(n => n.id === id), getApiConfigById);
                    const newClientAddr = calculateClientTunnelAddressForServer(editedNode.data, effectiveServerMasterCfg);
                     if (clientNode.data.tunnelAddress !== newClientAddr) {
                         newNodes[clientNodeIndex] = { ...clientNode, data: { ...clientNode.data, tunnelAddress: newClientAddr }};
                         if (originalNodeDataFromState.tunnelAddress !== editedNode.data.tunnelAddress) {
                             toast({ title: `入口(c) ${clientNode.data.label} 的隧道地址已更新。` });
                         }
                    }
                }
            }
        });
    } else if (editedNode.data.role === 'M' && originalNodeDataFromState.apiUrl !== editedNode.data.apiUrl) {
        const mContainerNode = editedNode;
        const mContainerMasterConfig = getApiConfigById(mContainerNode.data.masterId!);

        newNodes.forEach((sNode) => {
            if (sNode.data.parentNode === mContainerNode.id && sNode.data.role === 'S' && !sNode.data.representedMasterId) {
                edgesInternal.forEach(edge => {
                    if (edge.target === sNode.id) {
                        const clientNodeIndexToUpdate = newNodes.findIndex(n => n.id === edge.source && n.data.role === 'C' && !n.data.isSingleEndedForwardC);
                        if (clientNodeIndexToUpdate !== -1) {
                            const clientNodeToUpdate = newNodes[clientNodeIndexToUpdate];
                            const newClientTunAddr = calculateClientTunnelAddressForServer(sNode.data, mContainerMasterConfig);
                             if (clientNodeToUpdate.data.tunnelAddress !== newClientTunAddr) {
                                newNodes[clientNodeIndexToUpdate] = { ...clientNodeToUpdate, data: { ...clientNodeToUpdate.data, tunnelAddress: newClientTunAddr }};
                                toast({ title: `入口(c) ${clientNodeToUpdate.data.label} 的隧道地址已更新。` });
                            }
                        }
                    }
                });
            }
        });
    }

    setNodesInternal(newNodes);
    toast({ title: `节点 "${mergedData.label || nodeId.substring(0,8)}" 属性已更新`});
    setIsEditNodeDialogOpen(false);
    setEditingNodeContext(null);
  }, [nodesInternal, edgesInternal, setNodesInternal, toast, getNodeById, getApiConfigById]);


  const handleDeleteNode = (nodeToDelete: Node) => {
    const parentMId = nodeToDelete.data.parentNode;
    deleteElements({ nodes: [nodeToDelete] });
    toast({ title: `节点 "${nodeToDelete.data.label || nodeToDelete.id}" 已删除` });
    if (selectedNode?.id === nodeToDelete.id) setSelectedNode(null);
    setContextMenu(null);

    // If the deleted node was an S node and it was the last S node in its M container,
    // convert any C nodes in that M container to single-ended.
    if (nodeToDelete.data.role === 'S' && parentMId) {
        const remainingSNodesInParent = nodesInternal.filter(n => n.id !== nodeToDelete.id && n.data.parentNode === parentMId && n.data.role === 'S');
        if (remainingSNodesInParent.length === 0) {
            setNodesInternal(prevNodes =>
                prevNodes.map(n => {
                    if (n.data.parentNode === parentMId && n.data.role === 'C') {
                        const parentMConfig = getApiConfigById(getNodeById(parentMId)?.data.masterId || "");
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                isSingleEndedForwardC: true,
                                tunnelAddress: `[::]:${10000 + Math.floor(Math.random() * 1000)}`, // Reset local listen
                                targetAddress: 'remote.example.com:80', // Reset remote target
                                tlsMode: '0', // Reset TLS for single-ended target
                            }
                        };
                    }
                    return n;
                })
            );
            toast({ title: `主控 ${getNodeById(parentMId)?.data.label} 内无出口(s)，入口(c)已切换为单端转发模式。`});
        }
    }
  };
  const handleDeleteEdge = (edgeToDelete: Edge) => { deleteElements({ edges: [edgeToDelete] }); toast({ title: '链路已删除' }); setContextMenu(null); };

  const handleRenderMasterInstancesOnCanvas = useCallback(async (masterId: string) => {
    const masterConfig = getApiConfigById(masterId);
    if (!masterConfig) {
      toast({ title: "错误", description: "无法找到选定主控的配置。", variant: "destructive" });
      return;
    }
    const apiR = getApiRootUrl(masterId);
    const apiT = getToken(masterId);
    if (!apiR || !apiT) {
      toast({ title: "错误", description: `主控 "${masterConfig.name}" 的API配置不完整。`, variant: "destructive" });
      return;
    }

    setNodesInternal([]);
    setEdgesInternal([]);
    setSelectedNode(null);
    let currentIdCounter = 0; // Reset counter for fresh rendering
    setNodeIdCounter(0); // Reset global counter as well

    toast({ title: `正在加载主控 ${masterConfig.name} 的实例...`});

    try {
      const fetchedInstances: ApiInstanceType[] = await nodePassApi.getInstances(apiR, apiT);
      const validInstances = fetchedInstances.filter(inst => inst.id !== '********');

      const newRenderedNodes: Node[] = [];
      const newRenderedEdges: Edge[] = [];
      const clientInstances = validInstances.filter(inst => inst.type === 'client');
      const serverInstances = validInstances.filter(inst => inst.type === 'server');
      const pairedServerInstanceIds = new Set<string>();
      let linkIndex = 0;

      // Process client instances first to form links
      for (const clientInst of clientInstances) {
        const parsedClientUrl = parseNodePassUrl(clientInst.url);
        const uNodeId = `u-${clientInst.id.substring(0,5)}-${++currentIdCounter}`;
        const mNodeId = `m-${clientInst.id.substring(0,5)}-${++currentIdCounter}`;
        const tNodeId = `t-${clientInst.id.substring(0,5)}-${++currentIdCounter}`;
        const yPos = 100 + linkIndex * (M_NODE_FOR_LINK_HEIGHT + 60); // M node height + vertical gap

        const uNodePosition = { x: 50, y: yPos + (M_NODE_FOR_LINK_HEIGHT - CARD_NODE_HEIGHT) / 2 };
        const mNodePosition = { x: 50 + CARD_NODE_WIDTH + 60, y: yPos };
        const tNodePositionBaseX = 50 + CARD_NODE_WIDTH + 60 + M_NODE_FOR_LINK_WIDTH + 60;
        
        newRenderedNodes.push({
          id: uNodeId, type: 'cardNode', position: uNodePosition,
          data: { label: '用户', role: 'U', icon: User },
          width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
        });

        const isSingleEnded = parsedClientUrl.tunnelAddress && isWildcardHostname(extractHostname(parsedClientUrl.tunnelAddress));

        if (isSingleEnded) {
          newRenderedNodes.push({
            id: mNodeId, type: 'masterNode', position: mNodePosition,
            data: {
              label: `主控: ${masterConfig.name} (入口: ${clientInst.id.substring(0,5)}...)`, role: 'M',
              masterId: masterConfig.id, masterName: masterConfig.name, apiUrl: masterConfig.apiUrl,
              masterSubRole: 'single-client-link', isContainer: false,
              originalInstanceId: clientInst.id, originalInstanceUrl: clientInst.url,
            },
            style: { ...nodeStyles.m.base, width: M_NODE_FOR_LINK_WIDTH, height: M_NODE_FOR_LINK_HEIGHT },
            width: M_NODE_FOR_LINK_WIDTH, height: M_NODE_FOR_LINK_HEIGHT,
          });
          newRenderedNodes.push({
            id: tNodeId, type: 'cardNode', position: { x: tNodePositionBaseX, y: yPos + (M_NODE_FOR_LINK_HEIGHT - CARD_NODE_HEIGHT) / 2 },
            data: { label: `落地: ${parsedClientUrl.targetAddress?.substring(0,15) || 'N/A'}...`, role: 'T', icon: Globe, targetAddress: parsedClientUrl.targetAddress || "" },
            width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
          });
          newRenderedEdges.push({ id: `e-${uNodeId}-${mNodeId}`, source: uNodeId, target: mNodeId, type: 'smoothstep', targetHandle: 'm-left', markerEnd: { type: MarkerType.ArrowClosed } });
          newRenderedEdges.push({ id: `e-${mNodeId}-${tNodeId}`, source: mNodeId, target: tNodeId, type: 'smoothstep', sourceHandle: 'm-right', markerEnd: { type: MarkerType.ArrowClosed } });
          linkIndex++;
        } else {
          const serverMatch = serverInstances.find(sInst => {
            const parsedServerUrl = parseNodePassUrl(sInst.url);
            if (!parsedServerUrl.tunnelAddress) return false;
            let serverEffectiveListenAddress = parsedServerUrl.tunnelAddress;
            const serverListenHost = extractHostname(parsedServerUrl.tunnelAddress);
            if (serverListenHost && isWildcardHostname(serverListenHost)) {
                const masterApiHost = extractHostname(masterConfig.apiUrl);
                const serverPort = extractPort(parsedServerUrl.tunnelAddress);
                if (masterApiHost && serverPort) serverEffectiveListenAddress = `${formatHostForUrl(masterApiHost)}:${serverPort}`;
            }
            return parsedClientUrl.tunnelAddress?.toLowerCase() === serverEffectiveListenAddress?.toLowerCase();
          });

          if (serverMatch) {
            pairedServerInstanceIds.add(serverMatch.id);
            newRenderedNodes.push({
              id: mNodeId, type: 'masterNode', position: mNodePosition,
              data: {
                label: `主控: ${masterConfig.name} (隧道 C-${clientInst.id.substring(0,3)} <> S-${serverMatch.id.substring(0,3)})`, role: 'M',
                masterId: masterConfig.id, masterName: masterConfig.name, apiUrl: masterConfig.apiUrl,
                masterSubRole: 'intra-master-tunnel', isContainer: false,
                originalInstanceId: `${clientInst.id},${serverMatch.id}`, originalInstanceUrl: `${clientInst.url} | ${serverMatch.url}`,
              },
              style: { ...nodeStyles.m.base, width: M_NODE_FOR_LINK_WIDTH, height: M_NODE_FOR_LINK_HEIGHT },
              width: M_NODE_FOR_LINK_WIDTH, height: M_NODE_FOR_LINK_HEIGHT,
            });
            const serverTargetAddress = parseNodePassUrl(serverMatch.url).targetAddress;
            newRenderedNodes.push({
              id: tNodeId, type: 'cardNode', position: { x: tNodePositionBaseX, y: yPos + (M_NODE_FOR_LINK_HEIGHT - CARD_NODE_HEIGHT) / 2 },
              data: { label: `落地: ${serverTargetAddress?.substring(0,15) || 'N/A'}...`, role: 'T', icon: Globe, targetAddress: serverTargetAddress || "" },
              width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
            });
            newRenderedEdges.push({ id: `e-${uNodeId}-${mNodeId}`, source: uNodeId, target: mNodeId, type: 'smoothstep', targetHandle: 'm-left', markerEnd: { type: MarkerType.ArrowClosed } });
            newRenderedEdges.push({ id: `e-${mNodeId}-${tNodeId}`, source: mNodeId, target: tNodeId, type: 'smoothstep', sourceHandle: 'm-right', markerEnd: { type: MarkerType.ArrowClosed } });
            linkIndex++;
          } else { // Client connects to an external server
             newRenderedNodes.push({
              id: mNodeId, type: 'masterNode', position: mNodePosition,
              data: {
                label: `主控: ${masterConfig.name} (出口连接 C-${clientInst.id.substring(0,3)}...)`, role: 'M',
                masterId: masterConfig.id, masterName: masterConfig.name, apiUrl: masterConfig.apiUrl,
                masterSubRole: 'external-client-link', isContainer: false,
                originalInstanceId: clientInst.id, originalInstanceUrl: clientInst.url,
              },
              style: { ...nodeStyles.m.base, width: M_NODE_FOR_LINK_WIDTH, height: M_NODE_FOR_LINK_HEIGHT },
              width: M_NODE_FOR_LINK_WIDTH, height: M_NODE_FOR_LINK_HEIGHT,
            });
            newRenderedNodes.push({
              id: tNodeId, type: 'cardNode', position: { x: tNodePositionBaseX, y: yPos + (M_NODE_FOR_LINK_HEIGHT - CARD_NODE_HEIGHT) / 2 },
              data: { label: `远程出口(s): ${parsedClientUrl.tunnelAddress?.substring(0,15) || 'N/A'}...`, role: 'T', icon: Globe, targetAddress: parsedClientUrl.tunnelAddress || "" },
              width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
            });
            newRenderedEdges.push({ id: `e-${uNodeId}-${mNodeId}`, source: uNodeId, target: mNodeId, type: 'smoothstep', targetHandle: 'm-left', markerEnd: { type: MarkerType.ArrowClosed } });
            newRenderedEdges.push({ id: `e-${mNodeId}-${tNodeId}`, source: mNodeId, target: tNodeId, type: 'smoothstep', sourceHandle: 'm-right', markerEnd: { type: MarkerType.ArrowClosed } });
            linkIndex++;
          }
        }
      }

      // Process standalone server instances
      for (const serverInst of serverInstances) {
        if (pairedServerInstanceIds.has(serverInst.id)) continue;

        const uNodeId = `u-${serverInst.id.substring(0,5)}-${++currentIdCounter}`;
        const mNodeId = `m-${serverInst.id.substring(0,5)}-${++currentIdCounter}`;
        const tNodeId = `t-${serverInst.id.substring(0,5)}-${++currentIdCounter}`;
        const yPos = 100 + linkIndex * (M_NODE_FOR_LINK_HEIGHT + 60);
        
        const uNodePosition = { x: 50, y: yPos + (M_NODE_FOR_LINK_HEIGHT - CARD_NODE_HEIGHT) / 2 };
        const mNodePosition = { x: 50 + CARD_NODE_WIDTH + 60, y: yPos };
        const tNodePositionBaseX = 50 + CARD_NODE_WIDTH + 60 + M_NODE_FOR_LINK_WIDTH + 60;

        newRenderedNodes.push({
          id: uNodeId, type: 'cardNode', position: uNodePosition,
          data: { label: '外部用户/服务', role: 'U', icon: User },
          width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
        });
        newRenderedNodes.push({
          id: mNodeId, type: 'masterNode', position: mNodePosition,
          data: {
            label: `主控: ${masterConfig.name} (服务: S-${serverInst.id.substring(0,5)}...)`, role: 'M',
            masterId: masterConfig.id, masterName: masterConfig.name, apiUrl: masterConfig.apiUrl,
            masterSubRole: 'server-service-link', isContainer: false,
            originalInstanceId: serverInst.id, originalInstanceUrl: serverInst.url,
          },
          style: { ...nodeStyles.m.base, width: M_NODE_FOR_LINK_WIDTH, height: M_NODE_FOR_LINK_HEIGHT },
          width: M_NODE_FOR_LINK_WIDTH, height: M_NODE_FOR_LINK_HEIGHT,
        });
        const serverTargetAddress = parseNodePassUrl(serverInst.url).targetAddress;
        newRenderedNodes.push({
          id: tNodeId, type: 'cardNode', position: { x: tNodePositionBaseX, y: yPos + (M_NODE_FOR_LINK_HEIGHT - CARD_NODE_HEIGHT) / 2 },
          data: { label: `落地: ${serverTargetAddress?.substring(0,15) || 'N/A'}...`, role: 'T', icon: Globe, targetAddress: serverTargetAddress || "" },
          width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
        });
        newRenderedEdges.push({ id: `e-${uNodeId}-${mNodeId}`, source: uNodeId, target: mNodeId, type: 'smoothstep', targetHandle: 'm-left', markerEnd: { type: MarkerType.ArrowClosed } });
        newRenderedEdges.push({ id: `e-${mNodeId}-${tNodeId}`, source: mNodeId, target: tNodeId, type: 'smoothstep', sourceHandle: 'm-right', markerEnd: { type: MarkerType.ArrowClosed } });
        linkIndex++;
      }
      
      setNodesInternal(newRenderedNodes);
      setEdgesInternal(newRenderedEdges);
      setNodeIdCounter(currentIdCounter);

      setTimeout(() => {
        fitView({ duration: 400, padding: 0.1 }); 
      }, 100);

      toast({ title: `主控 ${masterConfig.name} 的实例已渲染。`, description: `共 ${validInstances.length} 个实例，形成 ${linkIndex} 条链路。`});

    } catch (error: any) {
      console.error(`渲染主控 ${masterConfig.name} 实例失败:`, error);
      toast({ title: `渲染主控 ${masterConfig.name} 实例失败`, description: error.message, variant: "destructive" });
      setNodesInternal([]);
      setEdgesInternal([]);
    }
  }, [getApiConfigById, getApiRootUrl, getToken, toast, setNodesInternal, setEdgesInternal, fitView, nodeIdCounter]);


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
              <p className="text-xs text-muted-foreground font-sans mb-2">拖拽主控到画布。</p>
              <ScrollArea className="flex-grow pr-1 max-h-60">
                <MastersPalette onRenderMasterInstances={handleRenderMasterInstancesOnCanvas} />
              </ScrollArea>
            </div>
            <Separator className="my-0" />
            <div className="flex flex-col p-3">
              <h2 className="text-sm font-semibold font-title mb-1 flex items-center">
                <Puzzle size={16} className="mr-2 text-primary" />
                组件 (U, C, S, T)
              </h2>
              <p className="text-xs text-muted-foreground font-sans mb-2">拖拽组件到画布或主控容器。</p>
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
                nodes={nodesInternal} edges={edgesInternal} onNodesChange={onNodesChangeInternal} onEdgesChange={onEdgesChangeInternal} onConnect={onConnect}
                onSelectionChange={onSelectionChange} reactFlowWrapperRef={reactFlowWrapperRef} onCenterView={handleCenterViewCallback}
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
          {contextMenu.type === 'node' && (contextMenu.data as Node).data.role !== 'U' && (contextMenu.data as Node).data.role !== 'T' && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleOpenEditNodeDialog(contextMenu.data as Node)}>修改属性</Button>
          )}
          {contextMenu.type === 'node' && (contextMenu.data as Node).data.role === 'T' && ( 
             <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleOpenEditNodeDialog(contextMenu.data as Node)}>修改标签</Button>
          )}
          {(contextMenu.data as Node).type === 'node' && (contextMenu.data as Node).data.role === 'S' && (contextMenu.data as Node).data.parentNode && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleChangeNodeRole((contextMenu.data as Node).id, 'C')}>更改为入口(c)</Button>
          )}
          {(contextMenu.data as Node).type === 'node' && (contextMenu.data as Node).data.role === 'C' && (contextMenu.data as Node).data.parentNode && !(contextMenu.data as Node).data.isDefaultClient && (
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
        onOpenChange={setIsSubmitConfirmOpen}
        instancesToCreate={instancesForConfirmation}
        onConfirm={executeActualSubmission}
        isSubmitting={isSubmitting}
      />
      <EditTopologyNodeDialog
        open={isEditNodeDialogOpen}
        onOpenChange={(isOpen) => {
            setIsEditNodeDialogOpen(isOpen);
            if (!isOpen) setEditingNodeContext(null);
        }}
        node={editingNodeContext?.node || null}
        hasServerNodesInParentContainer={editingNodeContext?.hasS || false}
        onSave={handleSaveNodeProperties}
      />
    </div>
  );
}

