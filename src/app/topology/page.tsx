
"use client";

import type { NextPage } from 'next';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type OnConnect,
  type Connection,
  MiniMap,
  MarkerType,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { AppLayout } from '@/components/layout/AppLayout';
import { useApiConfig, type NamedApiConfig, type MasterLogLevel, type MasterTlsMode } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, Edit3, Trash2, Unlink, Target, Users, Settings2, UploadCloud, Eraser, Network } from 'lucide-react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { AppLogEntry } from '@/components/nodepass/EventLog';
import { nodePassApi, type Instance } from '@/lib/api'; 
import type { CreateInstanceRequest } from '@/types/nodepass';
import { createInstanceApiSchema } from '@/zod-schemas/nodepass';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription as ShadAlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as ShadAlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle as ShadDialogTitleFromDialog, DialogDescription as ShadDialogDescriptionFromDialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from "@/lib/utils";

import NodePassFlowNode from './components/NodePassFlowNode';
import { TopologyControlBar } from './components/TopologyControlBar';
import { DraggablePanels } from './components/DraggablePanels';
import { PropertiesDisplayPanel } from './components/PropertiesDisplayPanel';
import { SubmitTopologyDialog } from './components/dialogs/SubmitTopologyDialog';
import { SelectManagingControllerDialog } from './components/dialogs/SelectManagingControllerDialog';
import { calculateElkLayout, calculateTieredLayout } from './lib/advanced-layout';

import type {
  TopologyNodeData, NodePassFlowNodeType, PendingOperations,
  ControllerNodeData, ServerNodeData, ClientNodeData, LandingNodeData, UserNodeData
} from './lib/topology-types';
import {
    initialViewport, NODE_DEFAULT_WIDTH, NODE_DEFAULT_HEIGHT,
    CONTROLLER_NODE_DEFAULT_WIDTH, CONTROLLER_NODE_DEFAULT_HEIGHT,
    CHAIN_HIGHLIGHT_COLOR, NODE_EXPANDED_DEFAULT_HEIGHT,
    INTER_CONTROLLER_CLIENT_DEFAULT_PORT, CONTROLLER_CLIENT_ROLE_DEFAULT_TARGET_PORT,
    CONTROLLER_CLIENT_ROLE_EXPANDED_HEIGHT, NODE_X_SPACING
} from './lib/topology-types';
import { getId, extractHostname, extractPort, buildNodePassUrlFromNode, parseNodePassUrlForTopology, isTunnelPortWildcard } from './lib/topology-utils';


const MAX_PORT_INCREMENT_ATTEMPTS = 20;

const initialNodes: NodePassFlowNodeType[] = [];
const initialEdges: Edge[] = [];

const nodeTypes = {
  custom: NodePassFlowNode,
};

interface PendingNodeDropDataType {
  type: 'server' | 'client';
  label: string;
  position: { x: number; y: number };
  rawEventPosition: { clientX: number, clientY: number };
}


const TopologyPageContent: NextPage = () => {
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiConfigById, getApiRootUrl, getToken } = useApiConfig();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNodes: rfGetNodes, getNode: rfGetNode, getEdges: rfGetEdges, setEdges: rfSetEdges, fitView, deleteElements, setNodes: rfSetNodes } = useReactFlow();
  const [appLogs, setAppLogs] = useState<AppLogEntry[]>([]);

  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const [selectedNodeForPropsPanel, setSelectedNodeForPropsPanel] = useState<NodePassFlowNodeType | null>(null);
  const [lastRefreshedUi, setLastRefreshedUi] = useState<Date | null>(null);
  const [isClearCanvasAlertOpen, setIsClearCanvasAlertOpen] = useState(false);

  const [nodeForContextMenu, setNodeForContextMenu] = useState<NodePassFlowNodeType | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const [isEditPropertiesDialogOpen, setIsEditPropertiesDialogOpen] = useState(false);
  const [editingNodeProperties, setEditingNodeProperties] = useState<TopologyNodeData | null>(null);
  const [currentEditingNodeId, setCurrentEditingNodeId] = useState<string | null>(null);


  const [nodeToDelete, setNodeToDelete] = useState<NodePassFlowNodeType | null>(null);
  const [isDeleteNodeDialogOpen, setIsDeleteNodeDialogOpen] = useState(false);

  const [edgeForContextMenu, setEdgeForContextMenu] = useState<Edge | null>(null);
  const [edgeContextMenuPosition, setEdgeContextMenuPosition] = useState<{ x: number, y: number } | null>(null);

  const [selectedChainElements, setSelectedChainElements] = useState<{ nodes: Set<string>, edges: Set<string> } | null>(null);

  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [pendingOperations, setPendingOperations] = useState<PendingOperations>({});
  const [isSubmittingTopology, setIsSubmittingTopology] = useState(false);
  const [isFormattingLayout, setIsFormattingLayout] = useState(false);

  const [isSelectControllerDialogOpen, setSelectControllerDialogOpen] = useState(false);
  const [pendingNodeDropData, setPendingNodeDropData] = useState<PendingNodeDropDataType | null>(null);


  const { data: instanceDataByApiId, isLoading: isLoadingGlobalInstances, error: fetchGlobalError, refetch: refetchAllInstances } = useQuery<
    Record<string, Instance[] | null>, 
    Error
  >({
    queryKey: ['allInstancesForTopologyPage', apiConfigsList.map(c => c.id).join(',')],
    queryFn: async () => {
      if (apiConfigsList.length === 0) {
        return {};
      }
      const results: Record<string, Instance[] | null> = {};
      await Promise.allSettled(
        apiConfigsList.map(async (config) => {
          const apiRootVal = getApiRootUrl(config.id);
          const tokenVal = getToken(config.id);
          if (!apiRootVal || !tokenVal) {
            console.warn(`TopologyPage: API config "${config.name}" (ID: ${config.id}) is invalid. Skipping.`);
            results[config.id] = null; 
            return;
          }
          try {
            const data = await nodePassApi.getInstances(apiRootVal, tokenVal);
            results[config.id] = data.filter(inst => inst.id !== '********'); 
          } catch (error: any) {
            console.error(`TopologyPage: Failed to load instances from API "${config.name}" (ID: ${config.id}). Error:`, error.message);
            results[config.id] = null; 
             toast({
              title: `加载 "${config.name}" 实例失败`,
              description: error.message.length > 100 ? error.message.substring(0,97) + "..." : error.message,
              variant: 'destructive',
            });
          }
        })
      );
      setLastRefreshedUi(new Date());
      return results;
    },
    enabled: !isLoadingApiConfig && apiConfigsList.length > 0,
    refetchOnMount: false, 
    refetchOnWindowFocus: false,
  });


  const onAppLog = useCallback((message: string, type: AppLogEntry['type'], details?: Record<string, any> | string) => {
    setAppLogs(prevLogs => [
      { timestamp: new Date().toISOString(), message, type, details },
      ...prevLogs
    ].slice(0, 100));
  }, []);


  const getNextAvailableTunnelPortOnCanvas = useCallback((
    initialPort: number,
    host: string | null,
    allCanvasNodes: NodePassFlowNodeType[],
    excludeNodeId?: string
  ): number => {
    let currentPort = initialPort;
    for (let i = 0; i < MAX_PORT_INCREMENT_ATTEMPTS; i++) {
      const portInUse = allCanvasNodes.some(node => {
        if (node.id === excludeNodeId) return false;
        if (!node.data) return false;

        let nodeTunnelAddress: string | undefined;
        if (node.data.type === 'server') {
          nodeTunnelAddress = (node.data as ServerNodeData).tunnelAddress;
        } else if (node.data.type === 'controller' && (node.data as ControllerNodeData).role === 'client') {
          nodeTunnelAddress = (node.data as ControllerNodeData).tunnelAddress;
        } else {
          return false; 
        }

        if (!nodeTunnelAddress) return false;

        const nodeHost = extractHostname(nodeTunnelAddress);
        const nodePortStr = extractPort(nodeTunnelAddress);
        if (!nodePortStr) return false;
        const nodePort = parseInt(nodePortStr, 10);

        if (nodePort === currentPort) {
          if (host === nodeHost) return true; 
          if (isTunnelPortWildcard(host) && isTunnelPortWildcard(nodeHost)) return true; 
        }
        return false;
      });

      if (!portInUse) {
        return currentPort;
      }
      currentPort++; 
    }
    if (currentPort !== initialPort) {
        onAppLog?.(`无法在画布上为 ${host}:${initialPort} 找到唯一端口，尝试 ${MAX_PORT_INCREMENT_ATTEMPTS} 次后仍冲突。将使用 ${currentPort -1 }，可能导致API提交失败。`, 'WARNING');
    }
    return currentPort -1; 
  }, [onAppLog]);


  const isValidConnection = useCallback(
    (params: Connection): boolean => {
      const currentEdges = rfGetEdges();
      const sourceNode = rfGetNode(params.source!) as NodePassFlowNodeType | undefined;
      const targetNode = rfGetNode(params.target!) as NodePassFlowNodeType | undefined;
      const sourceHandleId = params.sourceHandle;
      const targetHandleId = params.targetHandle;

      if (!sourceNode?.data || !targetNode?.data) {
        console.warn('isValidConnection: Source or target node not found or no data.');
        return false;
      }
      const sourceType = sourceNode.data.type;
      const targetType = targetNode.data.type;
      const sourceNodeData = sourceNode.data as TopologyNodeData;
      const targetNodeData = targetNode.data as TopologyNodeData;

      let baseRulePassed = false;
      if (sourceType === 'controller') { 
        const sourceControllerData = sourceNodeData as ControllerNodeData;
        if (sourceHandleId === 'output') { 
            if ((targetType === 'server' || targetType === 'client') && targetHandleId === 'input') baseRulePassed = true;
            else if (targetType === 'controller' && (targetNodeData as ControllerNodeData).role === 'client' && targetHandleId === 'input') baseRulePassed = true;
            else if (targetType === 'landing' && sourceControllerData.role === 'client' && targetHandleId === 'input') baseRulePassed = true;
        }
      } else if (sourceType === 'user' && sourceHandleId === 'output') {
        if (targetType === 'client' && targetHandleId === 'input') baseRulePassed = true;
        else if (targetType === 'controller' && (targetNodeData as ControllerNodeData).role === 'client' && targetHandleId === 'input') baseRulePassed = true;
      } else if ((sourceType === 'client' || sourceType === 'server') && sourceHandleId === 'output') { 
        if ((targetType === 'server' || targetType === 'client' || targetType === 'landing') && targetHandleId === 'input') baseRulePassed = true;
      }


      if (!baseRulePassed) {
        onAppLog?.(`无效连接尝试(类型/句柄不匹配): "${sourceNode.data.label}" (${sourceType}/${sourceHandleId}) -> "${targetNode.data.label}" (${targetType}/${targetHandleId})`, 'WARNING');
        return false;
      }

      if (targetHandleId === 'input' &&
          (targetType === 'server' || targetType === 'client' || targetType === 'landing' ||
           (targetType === 'controller' && (targetNodeData as ControllerNodeData).role === 'client'))) {
        const existingIncomingEdge = currentEdges.find(edge => edge.target === targetNode.id && edge.targetHandle === 'input');
        if (existingIncomingEdge) {
          toast({ title: "连接限制", description: `节点 "${targetNode.data.label}" (${targetType}) 只能有一个上游连接。`, variant: "destructive" });
          onAppLog?.(`连接被阻止: 节点 "${targetNode.data.label}" (${targetType}) 已有上游连接。`, 'WARNING');
          return false;
        }
      }
      
      if (sourceHandleId === 'output' && (sourceType === 'controller' || sourceType === 'user' || sourceType === 'server' || sourceType === 'client')) {
          const existingOutgoingEdgeForSourceNode = currentEdges.find(edge => edge.source === sourceNode.id && edge.sourceHandle === 'output');
          if (existingOutgoingEdgeForSourceNode) {
            toast({ title: "连接限制", description: `节点 "${sourceNode.data.label}" (${sourceType}) 只能有一个下游连接。`, variant: "destructive" });
            onAppLog?.(`连接被阻止: 节点 "${sourceNode.data.label}" (${sourceType}) 已有下游连接。`, 'WARNING');
            return false;
          }
      }
      return true;
    },
    [rfGetNode, rfGetEdges, toast, onAppLog]
  );


  const getEdgeStyle = useCallback((sourceType: TopologyNodeData['type'] | undefined, targetType: TopologyNodeData['type'] | undefined, sourceRole?: ControllerNodeData['role']): { stroke: string; markerColor: string } => {
    let strokeColor = 'hsl(var(--muted-foreground))';
    if (sourceType === 'controller') {
      if (sourceRole === 'client') { 
        if (targetType === 'server' || targetType === 'client') strokeColor = 'hsl(var(--chart-2))';
        else if (targetType === 'landing') strokeColor = 'hsl(var(--chart-5))';
      } else { 
        if (targetType === 'server') strokeColor = 'hsl(var(--primary))';
        else if (targetType === 'client') strokeColor = 'hsl(var(--accent))';
        else if (targetType === 'controller') strokeColor = 'hsl(var(--chart-3))'; 
      }
    } else if (sourceType === 'user') {
      if (targetType === 'client') strokeColor = 'hsl(var(--chart-1))';
      else if (targetType === 'controller') strokeColor = 'hsl(var(--chart-1))'; 
    } else if (sourceType === 'server') {
      if (targetType === 'client') strokeColor = 'hsl(var(--chart-2))';
      else if (targetType === 'landing') strokeColor = 'hsl(var(--chart-4))';
    } else if (sourceType === 'client') {
      if (targetType === 'server' || targetType === 'client') strokeColor = 'hsl(var(--chart-2))';
      else if (targetType === 'landing') strokeColor = 'hsl(var(--chart-5))';
    }
    return { stroke: strokeColor, markerColor: strokeColor };
  }, []);

  const onConnect: OnConnect = useCallback(
    (params) => {
      if (isValidConnection(params)) {
        const sourceNode = rfGetNode(params.source!) as NodePassFlowNodeType | undefined;
        const targetNode = rfGetNode(params.target!) as NodePassFlowNodeType | undefined;

        if (sourceNode && targetNode && sourceNode.data && targetNode.data) {
          const sourceControllerData = sourceNode.data.type === 'controller' ? sourceNode.data as ControllerNodeData : null;
          const edgeColors = getEdgeStyle(sourceNode.data.type, targetNode.data.type, sourceControllerData?.role);

          setEdges((eds) => addEdge({
            ...params, type: 'smoothstep', animated: false,
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: edgeColors.markerColor },
            style: { strokeWidth: 1.5, stroke: edgeColors.stroke }
          }, eds));
          toast({ title: "连接已创建", description: `节点 "${sourceNode.data.label}" 已连接到 "${targetNode.data.label}"。` });
          onAppLog?.(`连接创建: "${sourceNode.data.label}" (${sourceNode.id.substring(0,8)}) -> "${targetNode.data.label}" (${targetNode.id.substring(0,8)})`, 'INFO');

          const sourceData = sourceNode.data;
          const targetData = targetNode.data;
          let updatedSourceData = { ...sourceData };
          let updatedTargetData = { ...targetData };
          let sourceNodeChanged = false;
          let targetNodeChanged = false;


          let newManagingApiId: string | undefined = undefined;
          let newManagingApiName: string | undefined = undefined;
          let managingControllerConfig: NamedApiConfig | null = null;


          if (sourceData.type === 'controller' && sourceData.role !== 'client') { 
            const sCtrl = sourceData as ControllerNodeData;
            if (targetData.type === 'server' || targetData.type === 'client' || (targetData.type === 'controller' && (targetData as ControllerNodeData).role === 'client')) {
              newManagingApiId = sCtrl.apiId;
              newManagingApiName = sCtrl.apiName;
              managingControllerConfig = getApiConfigById(sCtrl.apiId);
            }
          } else if (sourceData.type === 'client' || (sourceData.type === 'controller' && (sourceData as ControllerNodeData).role === 'client')) { 
            const clientLikeSource = sourceData as ClientNodeData | ControllerNodeData;
            if (targetData.type === 'landing' || targetData.type === 'server' || targetData.type === 'client') {
              newManagingApiId = clientLikeSource.managingApiId || (clientLikeSource.type === 'controller' ? clientLikeSource.apiId : undefined);
              newManagingApiName = clientLikeSource.managingApiName || (clientLikeSource.type === 'controller' ? clientLikeSource.apiName : undefined);
              if (newManagingApiId) managingControllerConfig = getApiConfigById(newManagingApiId);

              if (!newManagingApiId) {
                onAppLog?.(`无法为节点 "${targetData.label}" 设置主控信息，因为其父节点 "${sourceData.label}" 没有关联主控信息。`, 'WARNING');
              }
            }
          } else if (sourceData.type === 'server') { 
            const serverSource = sourceData as ServerNodeData;
            if (targetData.type === 'client' || targetData.type === 'landing') {
              newManagingApiId = serverSource.managingApiId;
              newManagingApiName = serverSource.managingApiName;
               if (newManagingApiId) managingControllerConfig = getApiConfigById(newManagingApiId);
              if (!newManagingApiId) {
                 onAppLog?.(`无法为节点 "${targetData.label}" 设置主控信息，因为其父服务端 "${sourceData.label}" 没有关联主控信息。`, 'WARNING');
              }
            }
          }

          if (newManagingApiId && newManagingApiName &&
              (targetData.type === 'server' || targetData.type === 'client' || targetData.type === 'landing' || (targetData.type === 'controller' && (targetData as ControllerNodeData).role === 'client' ))) {
            
            const targetCurrentData = targetData as ServerNodeData | ClientNodeData | LandingNodeData | ControllerNodeData;
            let updatedTargetWithControllerDefaults = { 
                ...updatedTargetData, 
                managingApiId: newManagingApiId, 
                managingApiName: newManagingApiName 
            };

            if (targetCurrentData.type === 'server' || targetCurrentData.type === 'client' || (targetCurrentData.type === 'controller' && targetCurrentData.role === 'client')) {
                if (managingControllerConfig) {
                     const controllerLogLevel = managingControllerConfig.masterDefaultLogLevel;
                     updatedTargetWithControllerDefaults.logLevel = (controllerLogLevel && controllerLogLevel !== 'master') ? controllerLogLevel : 'info';
                     onAppLog?.(`节点 "${targetData.label}" 日志级别已根据主控 "${newManagingApiName}" 设置为: ${updatedTargetWithControllerDefaults.logLevel}`, 'INFO');

                     if (targetCurrentData.type === 'server') {
                        const controllerTlsMode = managingControllerConfig.masterDefaultTlsMode;
                        (updatedTargetWithControllerDefaults as ServerNodeData).tlsMode = (controllerTlsMode && controllerTlsMode !== 'master') ? controllerTlsMode : '0';
                        onAppLog?.(`服务端节点 "${targetData.label}" TLS模式已根据主控 "${newManagingApiName}" 设置为: ${(updatedTargetWithControllerDefaults as ServerNodeData).tlsMode}`, 'INFO');
                     }
                } else {
                    updatedTargetWithControllerDefaults.logLevel = 'info';
                     if (targetCurrentData.type === 'server') (updatedTargetWithControllerDefaults as ServerNodeData).tlsMode = '0';
                     onAppLog?.(`节点 "${targetData.label}" 未找到关联主控配置，日志级别设为 "info"${targetCurrentData.type === 'server' ? ', TLS模式设为 "0"' : ''}。`, 'WARNING');
                }
            }
            updatedTargetData = updatedTargetWithControllerDefaults;
            targetNodeChanged = true;
            onAppLog?.(`节点 "${targetData.label}" 已自动关联到主控 "${newManagingApiName}"。`, 'INFO');
          }

          if (sourceData.type === 'controller' && sourceData.role !== 'client' &&
              (targetData.type === 'server' || (targetData.type === 'controller' && (targetData as ControllerNodeData).role === 'client'))) {

            const sCtrlData = sourceData as ControllerNodeData;
            const targetInstanceData = targetData as ServerNodeData | ControllerNodeData;
            const initialTargetTunnelPortStr = extractPort(targetInstanceData.tunnelAddress || '');
            const initialTargetTunnelHost = extractHostname(targetInstanceData.tunnelAddress || '');
            const defaultTunnelPortStr = targetData.type === 'server' ? '10001' : INTER_CONTROLLER_CLIENT_DEFAULT_PORT;
            const initialTunnelPort = parseInt(initialTargetTunnelPortStr || defaultTunnelPortStr, 10);

            if (isTunnelPortWildcard(initialTargetTunnelHost) || !initialTargetTunnelHost || initialTargetTunnelHost.toLowerCase() === 'localhost' || initialTargetTunnelHost === 'upstream-controller-host') {
              const controllerConfig = getApiConfigById(sCtrlData.apiId);
              if (controllerConfig?.apiUrl) {
                let controllerApiHost = extractHostname(controllerConfig.apiUrl);
                if (controllerApiHost) {
                  const availablePort = getNextAvailableTunnelPortOnCanvas(initialTunnelPort, controllerApiHost, rfGetNodes(), targetNode.id);
                  if (availablePort !== initialTunnelPort) {
                    toast({ title: "隧道端口已调整", description: `节点 "${targetInstanceData.label}" 端口从 ${initialTunnelPort} 调整为 ${availablePort} 以避免画布冲突。`});
                    onAppLog?.(`节点 "${targetInstanceData.label}" 隧道端口自动从 ${initialTunnelPort} 调整为 ${availablePort} 以避免画布冲突。`, 'INFO');
                  }

                  if (controllerApiHost.includes(':') && !controllerApiHost.startsWith('[')) { controllerApiHost = `[${controllerApiHost}]`; }
                  const newTunnelAddress = `${controllerApiHost}:${availablePort}`;
                  if (targetInstanceData.tunnelAddress !== newTunnelAddress) {
                    updatedTargetData = { ...updatedTargetData, tunnelAddress: newTunnelAddress };
                    targetNodeChanged = true;
                    toast({ title: "隧道地址已自动更新", description: `节点 "${targetInstanceData.label}" 隧道地址更新为 "${newTunnelAddress}".` });
                    onAppLog?.(`节点 "${targetInstanceData.label}" 隧道地址自动设置为 "${newTunnelAddress}".`, 'INFO');
                  }
                  if (targetData.type === 'controller' && (targetData as ControllerNodeData).role === 'client' && !(targetData as ControllerNodeData).targetAddress) {
                    const defaultClientTargetAddress = `127.0.0.1:${CONTROLLER_CLIENT_ROLE_DEFAULT_TARGET_PORT}`;
                    updatedTargetData = { ...updatedTargetData, targetAddress: defaultClientTargetAddress };
                    targetNodeChanged = true;
                     onAppLog?.(`Controller (client role) "${targetData.label}" 目标地址自动设置为 "${defaultClientTargetAddress}".`, 'INFO');
                  }
                } else onAppLog?.(`无法从主控 "${sCtrlData.apiName}" 的 API URL (${controllerConfig.apiUrl}) 提取主机名。`, 'WARNING');
              } else onAppLog?.(`找不到主控 "${sCtrlData.apiName}" (${sCtrlData.apiId}) 的配置。`, 'WARNING');
            }
          } else if ((sourceData.type === 'server' || (sourceData.type === 'controller' && (sourceData as ControllerNodeData).role === 'client')) &&
                     targetData.type === 'client') {
            const serverLikeSourceData = sourceData as ServerNodeData | ControllerNodeData;
            const clientTargetData = targetData as ClientNodeData;
            const serverTunnelPortStr = extractPort(serverLikeSourceData.tunnelAddress || '');

            if (serverTunnelPortStr) {
              const serverTunnelPort = parseInt(serverTunnelPortStr, 10);
              let serverActualHost = extractHostname(serverLikeSourceData.tunnelAddress || '');

              if (isTunnelPortWildcard(serverActualHost) || !serverActualHost) {
                const managingCtrlId = serverLikeSourceData.managingApiId || (serverLikeSourceData.type === 'controller' ? serverLikeSourceData.apiId : undefined);
                if (managingCtrlId) {
                  const controllerConfigForSource = getApiConfigById(managingCtrlId);
                  if (controllerConfigForSource?.apiUrl) {
                    const controllerApiHost = extractHostname(controllerConfigForSource.apiUrl);
                    if (controllerApiHost) serverActualHost = controllerApiHost;
                    else onAppLog?.(`无法从管理主控 "${serverLikeSourceData.managingApiName || serverLikeSourceData.apiName}" 的 API URL (${controllerConfigForSource.apiUrl}) 提取主机名。`, 'WARNING');
                  } else onAppLog?.(`找不到管理主控 "${serverLikeSourceData.managingApiName || serverLikeSourceData.apiName}" (${managingCtrlId}) 的配置。`, 'WARNING');
                } else onAppLog?.(`源节点 "${serverLikeSourceData.label}" 监听于通配地址且未关联主控，无法确定客户端连接主机。`, 'WARNING');
              }

              if (serverActualHost) {
                if (serverActualHost.includes(':') && !serverActualHost.startsWith('[')) { serverActualHost = `[${serverActualHost}]`; }
                const newClientTunnelAddress = `${serverActualHost}:${serverTunnelPort}`;
                if (clientTargetData.tunnelAddress !== newClientTunnelAddress) {
                  updatedTargetData = { ...updatedTargetData, tunnelAddress: newClientTunnelAddress };
                  targetNodeChanged = true;
                  toast({ title: "客户端隧道已自动更新", description: `客户端 "${clientTargetData.label}" 的隧道地址更新为 "${newClientTunnelAddress}".` });
                  onAppLog?.(`客户端 "${clientTargetData.label}" 隧道地址自动设置为 "${newClientTunnelAddress}".`, 'INFO');
                }
              } else {
                 onAppLog?.(`无法确定源节点 "${serverLikeSourceData.label}" 的有效连接主机，客户端 (${clientTargetData.label}) 隧道地址未自动填充。`, 'WARNING');
              }
            } else {
              onAppLog?.(`无法从源节点 "${serverLikeSourceData.label}" 的隧道地址 (${serverLikeSourceData.tunnelAddress}) 提取端口。客户端 (${clientTargetData.label}) 隧道地址未自动填充。`, 'WARNING');
            }
          }

          const isSourceClientLikeOrServer = sourceData.type === 'client' || (sourceData.type === 'controller' && (sourceData as ControllerNodeData).role === 'client') || sourceData.type === 'server';
          if (isSourceClientLikeOrServer && targetData.type === 'landing') {
            const sNode = sourceData as ClientNodeData | ControllerNodeData | ServerNodeData;
            const tNode = targetData as LandingNodeData;
            let sNodeTargetAddress = sNode.targetAddress;

            if (tNode.landingIp && tNode.landingPort) {
                const newSourceTargetAddress = `${tNode.landingIp.includes(':') && !tNode.landingIp.startsWith('[') ? `[${tNode.landingIp}]` : tNode.landingIp}:${tNode.landingPort}`;
                if (sNodeTargetAddress !== newSourceTargetAddress) {
                    updatedSourceData = { ...updatedSourceData, targetAddress: newSourceTargetAddress };
                    sourceNodeChanged = true;
                    toast({ title: "源节点目标地址已更新", description: `节点 "${sNode.label}" 的目标地址已从落地节点 "${tNode.label}" 同步。`});
                    onAppLog?.(`节点 "${sNode.label}" 的目标地址已从落地 "${tNode.label}" (${newSourceTargetAddress}) 同步。`, "INFO");
                }
            } else if (sNodeTargetAddress) {
                const host = extractHostname(sNodeTargetAddress);
                const port = extractPort(sNodeTargetAddress);
                if (host && port) {
                    if (tNode.landingIp !== host || tNode.landingPort !== port) {
                        updatedTargetData = { ...updatedTargetData, landingIp: host, landingPort: port };
                        targetNodeChanged = true;
                        toast({ title: "落地节点 IP/端口已更新", description: `落地节点 "${tNode.label}" 的 IP/端口已从源节点 "${sNode.label}" 同步。`});
                        onAppLog?.(`落地节点 "${tNode.label}" 的 IP/端口已从源 "${sNode.label}" (${host}:${port}) 同步。`, "INFO");
                    }
                }
            }
          }


          if (sourceNodeChanged || targetNodeChanged) {
             setNodes((nds) =>
              nds.map((n) => {
                if (n.id === sourceNode.id && sourceNodeChanged) return { ...n, data: updatedSourceData };
                if (n.id === targetNode.id && targetNodeChanged) return { ...n, data: updatedTargetData };
                return n;
              })
            );
          }
        } else {
          console.warn("onConnect: Source or target node not found after successful isValidConnection.");
        }
      }
    },
    [setEdges, rfGetNode, rfGetEdges, isValidConnection, toast, getEdgeStyle, setNodes, onAppLog, getApiConfigById, getNextAvailableTunnelPortOnCanvas]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;

      const draggedNodeTypeFromPanel = event.dataTransfer.getData('application/reactflow-nodetype') as TopologyNodeData['type'];
      let initialLabel = event.dataTransfer.getData('application/reactflow-label');
      const draggedApiId = event.dataTransfer.getData('application/reactflow-apiid');
      const draggedApiName = event.dataTransfer.getData('application/reactflow-apiname');

      if (typeof draggedNodeTypeFromPanel === 'undefined' || !draggedNodeTypeFromPanel || draggedNodeTypeFromPanel === 'user') {
          if (draggedNodeTypeFromPanel === 'user') {
              toast({ title: "操作无效", description: "用户源节点 (暂未启用) 不能拖拽到画布。" });
          }
          return;
      }

      const currentNodesOnCanvas = rfGetNodes();
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      if (draggedNodeTypeFromPanel === 'controller' && draggedApiId && draggedApiName) {
        const nodeWidth = CONTROLLER_NODE_DEFAULT_WIDTH;
        const nodeHeight = CONTROLLER_NODE_DEFAULT_HEIGHT; 
        const allControllerNodesOnCanvas = currentNodesOnCanvas.filter(n => n.data?.type === 'controller');
        const newRole = allControllerNodesOnCanvas.length === 0 ? 'server' : 'client';
        
        const controllerBaseData: Partial<ControllerNodeData> = {
          label: draggedApiName, type: 'controller', apiId: draggedApiId, apiName: draggedApiName, role: newRole,
          statusInfo: '', isExpanded: false,
        };
        
        const draggedControllerConfig = getApiConfigById(draggedApiId);

        let newNodeData: ControllerNodeData;
        if (newRole === 'client') {
            const controllerApiHostRaw = extractHostname(draggedControllerConfig?.apiUrl || 'upstream-controller-host');
            const safeApiHost = (controllerApiHostRaw && controllerApiHostRaw.includes(':') && !controllerApiHostRaw.startsWith('[')) ? `[${controllerApiHostRaw}]` : controllerApiHostRaw || 'upstream-controller-host';
            const initialPort = parseInt(INTER_CONTROLLER_CLIENT_DEFAULT_PORT, 10);
            const availablePort = getNextAvailableTunnelPortOnCanvas(initialPort, safeApiHost, currentNodesOnCanvas);
             if (availablePort !== initialPort) {
                 toast({ title: "隧道端口已调整", description: `新主控(客户焦点) "${draggedApiName}" 端口从 ${initialPort} 调整为 ${availablePort} 以避免画布冲突。`});
                 onAppLog?.(`新主控(客户焦点) "${draggedApiName}" 隧道端口自动从 ${initialPort} 调整为 ${availablePort} 以避免画布冲突。`, 'INFO');
            }
            const defaultClientLogLevel = (draggedControllerConfig?.masterDefaultLogLevel && draggedControllerConfig.masterDefaultLogLevel !== 'master') ? draggedControllerConfig.masterDefaultLogLevel : 'info';
            newNodeData = {
                ...controllerBaseData,
                tunnelAddress: `${safeApiHost}:${availablePort}`,
                targetAddress: `127.0.0.1:${CONTROLLER_CLIENT_ROLE_DEFAULT_TARGET_PORT}`,
                logLevel: defaultClientLogLevel,
            } as ControllerNodeData;
        } else { 
            newNodeData = controllerBaseData as ControllerNodeData;
            if (draggedControllerConfig) {
                newNodeData.masterDefaultLogLevel = draggedControllerConfig.masterDefaultLogLevel;
                newNodeData.masterDefaultTlsMode = draggedControllerConfig.masterDefaultTlsMode;
            }
        }
        onAppLog?.(`添加主控 "${draggedApiName}"，角色默认设为: ${newRole === 'server' ? '服务焦点' : '客户焦点'}。`, 'INFO');
        
        const centeredPosition = { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 };
        const newNode: NodePassFlowNodeType = {
          id: getId('controller_'), type: 'custom', position: centeredPosition, data: newNodeData, 
          width: nodeWidth, height: nodeHeight, selectable: true,
        };
        setNodes((nds) => nds.concat(newNode));
        toast({title: "节点已添加", description: `节点 "${newNode.data.label}" 已添加到画布。`})
        onAppLog?.(`节点 "${newNode.data.label}" (${newNode.id.substring(0,8)}) 已添加到画布。类型: ${newNode.data.type}, 角色: ${newNode.data.role}`, 'INFO');

      } else if (draggedNodeTypeFromPanel === 'server' || draggedNodeTypeFromPanel === 'client') {
        const serverRoleControllers = currentNodesOnCanvas.filter(n => n.data?.type === 'controller' && (n.data as ControllerNodeData).role !== 'client');
        
        if (serverRoleControllers.length === 0) {
          if (apiConfigsList.length === 0) {
            toast({ title: "操作无效", description: `无法添加 "${initialLabel}": 画布上无主控，且无已配置的主控可选。请先添加一个主控。`, variant: "destructive" });
            onAppLog?.(`无法添加 "${initialLabel}": 画布上无主控，且无已配置的主控可选。`, 'WARNING');
            return;
          }
          setPendingNodeDropData({
            type: draggedNodeTypeFromPanel,
            label: initialLabel,
            position: position,
            rawEventPosition: { clientX: event.clientX, clientY: event.clientY }
          });
          setSelectControllerDialogOpen(true);
          onAppLog?.(`画布上无合适主控，为 "${initialLabel}" 打开选择主控对话框。`, 'INFO');
          return;
        } else {
          let newNodeData: ServerNodeData | ClientNodeData;
          const defaultLogLevel = 'info'; 
          const defaultTlsMode = '0'; 

          if (draggedNodeTypeFromPanel === 'server') {
             const initialTunnelAddress = '0.0.0.0:10001'; 
             const serverHost = extractHostname(initialTunnelAddress);
             const serverInitialPort = parseInt(extractPort(initialTunnelAddress) || '10001', 10);
             const serverAvailablePort = getNextAvailableTunnelPortOnCanvas(serverInitialPort, serverHost, currentNodesOnCanvas);
             newNodeData = { 
                label: initialLabel || '服务端', type: 'server', instanceType: 'server', 
                tunnelAddress: `${serverHost}:${serverAvailablePort}`, targetAddress: '0.0.0.0:8080', 
                logLevel: defaultLogLevel, tlsMode: defaultTlsMode, 
                statusInfo: '', isExpanded: false 
            } as ServerNodeData;
          } else { // client
             newNodeData = { 
                label: initialLabel || '客户端', type: 'client', instanceType: 'client', 
                tunnelAddress: 'server.host:10001', targetAddress: '127.0.0.1:8000', 
                logLevel: defaultLogLevel, 
                statusInfo: '', isExpanded: false 
            } as ClientNodeData;
          }
          const nodeWidth = NODE_DEFAULT_WIDTH;
          const nodeHeight = NODE_DEFAULT_HEIGHT;
          const centeredPosition = { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 };
          const newNode: NodePassFlowNodeType = {
            id: getId(draggedNodeTypeFromPanel + '_'), type: 'custom', position: centeredPosition, data: newNodeData,
            width: nodeWidth, height: nodeHeight, selectable: true,
          };
          setNodes((nds) => nds.concat(newNode));
          toast({title: "节点已添加", description: `节点 "${newNode.data.label}" 已添加到画布。请手动连接到主控。`})
          onAppLog?.(`节点 "${newNode.data.label}" (${newNode.id.substring(0,8)}) 已添加到画布。类型: ${newNode.data.type}. 等待手动连接。`, 'INFO');
        }
      } else if (draggedNodeTypeFromPanel === 'landing') {
        const nodeWidth = NODE_DEFAULT_WIDTH;
        const nodeHeight = NODE_DEFAULT_HEIGHT;
        const newNodeData: LandingNodeData = {
          label: initialLabel || '落地节点',
          type: 'landing',
          landingIp: '1.2.3.4', 
          landingPort: '80',    
          statusInfo: '',
          isExpanded: false,
        };
        const centeredPosition = { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 };
        const newNode: NodePassFlowNodeType = {
          id: getId('landing_'),
          type: 'custom', 
          position: centeredPosition,
          data: newNodeData,
          width: nodeWidth,
          height: nodeHeight,
          selectable: true,
        };
        setNodes((nds) => nds.concat(newNode));
        toast({ title: "节点已添加", description: `节点 "${newNode.data.label}" 已添加到画布。` });
        onAppLog?.(`节点 "${newNode.data.label}" (${newNode.id.substring(0, 8)}) 已添加到画布。类型: ${newNode.data.type}`, 'INFO');
      }
    },
    [screenToFlowPosition, setNodes, toast, rfGetNodes, onAppLog, getApiConfigById, getNextAvailableTunnelPortOnCanvas, apiConfigsList]
  );

  const handleControllerSelectedForNodeDrop = useCallback((selectedApiConfig: NamedApiConfig) => {
    if (!pendingNodeDropData) return;

    const { type: droppedNodeType, label: droppedNodeLabel, position: droppedNodePosition } = pendingNodeDropData;
    let currentNodesOnCanvas = rfGetNodes();
    let currentEdgesOnCanvas = rfGetEdges();

    let controllerNode = currentNodesOnCanvas.find(n => n.data?.type === 'controller' && (n.data as ControllerNodeData).apiId === selectedApiConfig.id && (n.data as ControllerNodeData).role !== 'client') as Node<ControllerNodeData> | undefined;

    if (!controllerNode) {
      const controllerNodeData: ControllerNodeData = {
        label: selectedApiConfig.name, type: 'controller', apiId: selectedApiConfig.id, apiName: selectedApiConfig.name,
        role: 'server', statusInfo: '', isExpanded: false,
        masterDefaultLogLevel: selectedApiConfig.masterDefaultLogLevel,
        masterDefaultTlsMode: selectedApiConfig.masterDefaultTlsMode,
      };
      const controllerNodeRfId = getId('controller_');
      const controllerNodeRf: NodePassFlowNodeType = {
        id: controllerNodeRfId, type: 'custom',
        position: { x: droppedNodePosition.x - NODE_X_SPACING, y: droppedNodePosition.y }, 
        data: controllerNodeData,
        width: CONTROLLER_NODE_DEFAULT_WIDTH, height: CONTROLLER_NODE_DEFAULT_HEIGHT,
      };
      
      setNodes((nds) => nds.concat(controllerNodeRf));
      controllerNode = controllerNodeRf; 
      currentNodesOnCanvas = rfGetNodes(); 
      toast({ title: "主控已添加", description: `主控 "${selectedApiConfig.name}" 已添加到画布。` });
      onAppLog?.(`主控 "${selectedApiConfig.name}" 已自动添加到画布。`, 'INFO');
    }

    let newScNodeData: ServerNodeData | ClientNodeData;
    const controllerApiHostRaw = extractHostname(selectedApiConfig.apiUrl || '');
    
    const nodeLogLevel = (selectedApiConfig.masterDefaultLogLevel && selectedApiConfig.masterDefaultLogLevel !== 'master') 
                        ? selectedApiConfig.masterDefaultLogLevel : 'info';

    if (droppedNodeType === 'server') {
      const rawServerHost = isTunnelPortWildcard(controllerApiHostRaw) || !controllerApiHostRaw ? '0.0.0.0' : controllerApiHostRaw;
      const serverHost = (rawServerHost && rawServerHost.includes(':') && !rawServerHost.startsWith('[')) ? `[${rawServerHost}]` : rawServerHost;
      const serverInitialPort = parseInt(extractPort(selectedApiConfig.apiUrl || '') || '10001', 10);
      const serverAvailablePort = getNextAvailableTunnelPortOnCanvas(serverInitialPort, serverHost, currentNodesOnCanvas);
      const nodeTlsMode = (selectedApiConfig.masterDefaultTlsMode && selectedApiConfig.masterDefaultTlsMode !== 'master')
                        ? selectedApiConfig.masterDefaultTlsMode : '0';
      newScNodeData = {
        label: droppedNodeLabel || '服务端', type: 'server', instanceType: 'server',
        tunnelAddress: `${serverHost}:${serverAvailablePort}`, targetAddress: '0.0.0.0:8080',
        logLevel: nodeLogLevel, tlsMode: nodeTlsMode,
        managingApiId: controllerNode.data.apiId, managingApiName: controllerNode.data.apiName,
        statusInfo: '', isExpanded: false,
      } as ServerNodeData;
    } else { // client
      const safeControllerApiHost = (controllerApiHostRaw && controllerApiHostRaw.includes(':') && !controllerApiHostRaw.startsWith('[')) ? `[${controllerApiHostRaw}]` : controllerApiHostRaw;
      const serverTunnelForClient = `${safeControllerApiHost || 'server.host'}:${extractPort(selectedApiConfig.apiUrl || '') || '10001'}`;
      newScNodeData = {
        label: droppedNodeLabel || '客户端', type: 'client', instanceType: 'client',
        tunnelAddress: serverTunnelForClient, targetAddress: '127.0.0.1:8000',
        logLevel: nodeLogLevel,
        managingApiId: controllerNode.data.apiId, managingApiName: controllerNode.data.apiName,
        statusInfo: '', isExpanded: false,
      } as ClientNodeData;
    }
    
    const newScRfNodeId = getId(droppedNodeType + '_');
    const newScRfNode: NodePassFlowNodeType = {
      id: newScRfNodeId, type: 'custom', position: droppedNodePosition, data: newScNodeData,
      width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT,
    };
    setNodes((nds) => nds.concat(newScRfNode));
    toast({title: "节点已添加", description: `节点 "${newScNodeData.label}" 已添加。`});
    onAppLog?.(`节点 "${newScNodeData.label}" (${newScRfNodeId.substring(0,8)}) 已添加，由主控 "${controllerNode.data.apiName}" 管理。日志: ${newScNodeData.logLevel}${droppedNodeType === 'server' ? ', TLS: '+(newScNodeData as ServerNodeData).tlsMode : ''}`, 'INFO');
    
    currentNodesOnCanvas = rfGetNodes();

    const edgeColors = getEdgeStyle(controllerNode.data.type, newScRfNode.data!.type, (controllerNode.data as ControllerNodeData).role);
    const newEdge: Edge = {
      id: `edge-${controllerNode.id}-to-${newScRfNode.id}`, source: controllerNode.id, target: newScRfNode.id,
      sourceHandle: 'output', targetHandle: 'input', type: 'smoothstep', animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: edgeColors.markerColor },
      style: { strokeWidth: 1.5, stroke: edgeColors.stroke },
    };
    setEdges((eds) => addEdge(newEdge, eds));
    onAppLog?.(`已自动连接主控 "${controllerNode.data.apiName}" 到新节点 "${newScRfNode.data!.label}"。`, 'INFO');

    setSelectControllerDialogOpen(false);
    setPendingNodeDropData(null);
  }, [pendingNodeDropData, rfGetNodes, setNodes, setEdges, addEdge, toast, onAppLog, getNextAvailableTunnelPortOnCanvas, getEdgeStyle, getApiConfigById]);


  const updateSelectedChain = useCallback((startNodeId: string | null) => {
    if (!startNodeId) {
      setSelectedChainElements(null); return;
    }
    const chainNodes = new Set<string>(); const chainEdges = new Set<string>();
    const currentNodes = rfGetNodes(); const currentEdges = rfGetEdges();
    const traverse = (nodeId: string, direction: 'up' | 'down') => {
      const queue: string[] = [nodeId]; const visitedNodesThisTraversal = new Set<string>();
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visitedNodesThisTraversal.has(currentId)) continue;
        visitedNodesThisTraversal.add(currentId); chainNodes.add(currentId);
        const connectedEdgesToProcess = direction === 'down' ? currentEdges.filter(edge => edge.source === currentId) : currentEdges.filter(edge => edge.target === currentId);
        for (const edge of connectedEdgesToProcess) {
          chainEdges.add(edge.id); const nextNodeId = direction === 'down' ? edge.target : edge.source;
          const nextNode = currentNodes.find(n => n.id === nextNodeId);
          if (nextNode?.data) {
            let continueTraversal = true;
            if (direction === 'down' && nextNode.data.type === 'landing') continueTraversal = false;
            else if (direction === 'up' && (nextNode.data.type === 'controller' || nextNode.data.type === 'user')) continueTraversal = false;
            if (continueTraversal && !visitedNodesThisTraversal.has(nextNodeId)) queue.push(nextNodeId);
            else if (!continueTraversal) chainNodes.add(nextNodeId);
          }
        }
      }
    };
    traverse(startNodeId, 'down'); traverse(startNodeId, 'up');
    setSelectedChainElements({ nodes: chainNodes, edges: chainEdges });
  }, [rfGetNodes, rfGetEdges]);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: NodePassFlowNodeType) => {
    if (node.data?.type === 'user') { 
        setSelectedNodeForPropsPanel(null); 
        updateSelectedChain(null);
        return;
    }
    setSelectedNodeForPropsPanel(node); updateSelectedChain(node.id);
    setNodeForContextMenu(null); setEdgeForContextMenu(null);

    if (node.data) { 
      setNodes((nds) => nds.map(n => {
        if (n.id === node.id && n.data) {
          const newExpandedState = !n.data.isExpanded;
          let newHeight = n.height || NODE_DEFAULT_HEIGHT; 
          if (n.data.type === 'controller' && (n.data as ControllerNodeData).role === 'client') {
            newHeight = newExpandedState ? CONTROLLER_CLIENT_ROLE_EXPANDED_HEIGHT : CONTROLLER_NODE_DEFAULT_HEIGHT;
          } else if (n.data.type !== 'user') { 
             newHeight = newExpandedState ? NODE_EXPANDED_DEFAULT_HEIGHT : NODE_DEFAULT_HEIGHT;
          }
          return {
            ...n,
            data: { ...n.data, isExpanded: newExpandedState },
            height: newHeight,
          };
        }
        return n;
      }));
    }
  }, [updateSelectedChain, setNodes]);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeForPropsPanel(null); updateSelectedChain(null);
    setNodeForContextMenu(null); setEdgeForContextMenu(null);
  }, [updateSelectedChain]);

  const clearCanvas = () => {
    setNodes([]); setEdges([]); setSelectedNodeForPropsPanel(null); updateSelectedChain(null);
    setNodeForContextMenu(null); setEdgeForContextMenu(null);
    toast({ title: "画布已清空", description: "所有节点和连接已移除。" });
    onAppLog?.('画布已清空。', 'INFO'); setIsClearCanvasAlertOpen(false);
  };

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: NodePassFlowNodeType) => {
    event.preventDefault(); 
    if (node.data?.type === 'user' || node.selectable === false) { 
      setNodeForContextMenu(null);
      return;
    }
    setSelectedNodeForPropsPanel(node);
    setNodeForContextMenu(node); setContextMenuPosition({ x: event.clientX, y: event.clientY });
    setEdgeForContextMenu(null);
  }, []);

  const deleteEdgeDirectly = () => {
    if (edgeForContextMenu) {
      const edgeLabel = `从 ${rfGetNode(edgeForContextMenu.source)?.data?.label || '未知源'} 到 ${rfGetNode(edgeForContextMenu.target)?.data?.label || '未知目标'} (ID: ${edgeForContextMenu.id.substring(0,8)}...)`;
      setEdges((eds) => eds.filter((e) => e.id !== edgeForContextMenu.id));
      toast({ title: "链路已删除", description: `链路 "${edgeLabel}" 已被删除。` });
      onAppLog?.(`链路 "${edgeLabel}" 已删除。`, 'SUCCESS');
      if (selectedChainElements?.edges.has(edgeForContextMenu.id)) updateSelectedChain(null);
    }
    setEdgeForContextMenu(null);
  };

  const handleEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault(); setEdgeForContextMenu(edge);
    setEdgeContextMenuPosition({ x: event.clientX, y: event.clientY });
    setNodeForContextMenu(null); setSelectedNodeForPropsPanel(null); updateSelectedChain(null);
  }, [updateSelectedChain]);

  const openEditPropertiesDialog = () => {
    if (nodeForContextMenu?.data) {
      setEditingNodeProperties({ ...nodeForContextMenu.data });
      setCurrentEditingNodeId(nodeForContextMenu.id);
      setIsEditPropertiesDialogOpen(true);
    }
    setNodeForContextMenu(null); setContextMenuPosition(null);
  };

  const handleSaveNodeProperties = () => {
     if (currentEditingNodeId && editingNodeProperties) {
      const originalNode = rfGetNode(currentEditingNodeId);
      if (!originalNode) {
        toast({title: "错误", description: "找不到要更新的节点。", variant: "destructive"});
        onAppLog?.(`无法更新节点属性: 节点 ${currentEditingNodeId} 未找到。`, 'ERROR');
        setIsEditPropertiesDialogOpen(false); setEditingNodeProperties(null); setCurrentEditingNodeId(null);
        return;
      }

      let finalNodeProperties = { ...editingNodeProperties };

      if (editingNodeProperties.type === 'server' || (editingNodeProperties.type === 'controller' && (editingNodeProperties as ControllerNodeData).role === 'client')) {
        const nodeDataWithTunnel = editingNodeProperties as ServerNodeData | ControllerNodeData;
        if (nodeDataWithTunnel.tunnelAddress) {
            const initialHost = extractHostname(nodeDataWithTunnel.tunnelAddress);
            const initialPortStr = extractPort(nodeDataWithTunnel.tunnelAddress);
            if (initialHost && initialPortStr) {
                const initialPort = parseInt(initialPortStr, 10);
                const availablePort = getNextAvailableTunnelPortOnCanvas(initialPort, initialHost, rfGetNodes(), currentEditingNodeId);
                if (availablePort !== initialPort) {
                    toast({ title: "隧道端口已调整", description: `节点 "${editingNodeProperties.label}" 端口从 ${initialPort} 调整为 ${availablePort} 以避免画布冲突。`});
                    onAppLog?.(`编辑节点 "${editingNodeProperties.label}" 时，隧道端口自动从 ${initialPort} 调整为 ${availablePort} 以避免画布冲突。`, 'INFO');
                    const safeHost = (initialHost.includes(':') && !initialHost.startsWith('[')) ? `[${initialHost}]` : initialHost;
                    finalNodeProperties = { ...finalNodeProperties, tunnelAddress: `${safeHost}:${availablePort}` };
                }
            }
        }
      }


      const newLabel = finalNodeProperties.label;
      let newHeight = originalNode.height || NODE_DEFAULT_HEIGHT;

      if (finalNodeProperties.type === 'controller' && (finalNodeProperties as ControllerNodeData).role === 'client') {
         newHeight = finalNodeProperties.isExpanded ? CONTROLLER_CLIENT_ROLE_EXPANDED_HEIGHT : CONTROLLER_NODE_DEFAULT_HEIGHT;
      } else if (finalNodeProperties.type !== 'user') {
         newHeight = finalNodeProperties.isExpanded ? NODE_EXPANDED_DEFAULT_HEIGHT : NODE_DEFAULT_HEIGHT;
      }


      let nodesToUpdateAfterSave = rfGetNodes().map(n => {
        if (n.id === currentEditingNodeId) {
            return {
                ...n,
                data: {
                    ...(originalNode.data || {}),
                    ...finalNodeProperties,
                    isChainHighlighted: n.data?.isChainHighlighted,
                    statusInfo: n.data?.statusInfo,
                } as TopologyNodeData,
                height: newHeight
            };
        }
        return n;
      });

      const editedNodeData = finalNodeProperties;
      const currentEdgesInner = rfGetEdges();

      if (editedNodeData.type === 'client' || (editedNodeData.type === 'controller' && (editedNodeData as ControllerNodeData).role === 'client') || editedNodeData.type === 'server') {
        const sourceNode = editedNodeData as ClientNodeData | ControllerNodeData | ServerNodeData;
        const downstreamLandingEdge = currentEdgesInner.find(edge => edge.source === currentEditingNodeId && (rfGetNode(edge.target)?.data?.type === 'landing'));
        if (downstreamLandingEdge) {
          const landingNode = rfGetNode(downstreamLandingEdge.target) as Node<LandingNodeData> | undefined;
          if (landingNode && landingNode.data && sourceNode.targetAddress) {
            const newLandingHost = extractHostname(sourceNode.targetAddress);
            const newLandingPort = extractPort(sourceNode.targetAddress);
            if (newLandingHost && newLandingPort && (landingNode.data.landingIp !== newLandingHost || landingNode.data.landingPort !== newLandingPort)) {
              const updatedLandingData = { ...landingNode.data, landingIp: newLandingHost, landingPort: newLandingPort };
              nodesToUpdateAfterSave = nodesToUpdateAfterSave.map(n => n.id === landingNode.id ? { ...n, data: updatedLandingData } : n);
              toast({ title: "落地节点 IP/端口已同步", description: `落地节点 "${landingNode.data.label}" 已从 "${sourceNode.label}" 的目标地址更新。`});
              onAppLog?.(`落地节点 "${landingNode.data.label}" IP/端口已从 "${sourceNode.label}" 的新目标地址 (${newLandingHost}:${newLandingPort}) 同步。`, 'INFO');
            }
          }
        }
      } else if (editedNodeData.type === 'landing') {
        const landingNodeData = editedNodeData as LandingNodeData;
        const upstreamEdge = currentEdgesInner.find(edge => edge.target === currentEditingNodeId && (rfGetNode(edge.source)?.data?.type === 'client' || rfGetNode(edge.source)?.data?.type === 'controller' || rfGetNode(edge.source)?.data?.type === 'server'));
        if (upstreamEdge) {
          const sourceNode = rfGetNode(upstreamEdge.source) as Node<ClientNodeData | ControllerNodeData | ServerNodeData> | undefined;
          if (sourceNode && sourceNode.data && landingNodeData.landingIp && landingNodeData.landingPort) {
            const newSourceTargetAddress = `${landingNodeData.landingIp.includes(':') && !landingNodeData.landingIp.startsWith('[') ? `[${landingNodeData.landingIp}]` : landingNodeData.landingIp}:${landingNodeData.landingPort}`;
            if (sourceNode.data.targetAddress !== newSourceTargetAddress) {
              const updatedSourceData = { ...sourceNode.data, targetAddress: newSourceTargetAddress };
              nodesToUpdateAfterSave = nodesToUpdateAfterSave.map(n => n.id === sourceNode.id ? { ...n, data: updatedSourceData } : n);
              toast({ title: "源节点目标地址已同步", description: `节点 "${sourceNode.data.label}" 的目标地址已从落地 "${landingNodeData.label}" 更新。`});
              onAppLog?.(`节点 "${sourceNode.data.label}" 的目标地址已从落地 "${landingNodeData.label}" 的新 IP/端口 (${newSourceTargetAddress}) 同步。`, 'INFO');
            }
          }
        }
      }
      setNodes(nodesToUpdateAfterSave);

      toast({ title: "属性已更新", description: `节点 "${newLabel}" 的属性已更改。` });
      onAppLog?.(`节点 "${newLabel}" (${currentEditingNodeId.substring(0,8)}) 属性已更新。`, 'INFO');
    }
    setIsEditPropertiesDialogOpen(false); setEditingNodeProperties(null); setCurrentEditingNodeId(null);
  };


  const handleChangeControllerRole = (nodeId: string, role: ControllerNodeData['role']) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId && n.data?.type === 'controller') {
          const currentData = n.data as ControllerNodeData;
          let newHeight = n.height || CONTROLLER_NODE_DEFAULT_HEIGHT;
          let newIsExpanded = currentData.isExpanded; 
          let newTunnelAddress = currentData.tunnelAddress;
          let newTargetAddress = currentData.targetAddress;
          let newLogLevel = currentData.logLevel;
          
          const controllerConfig = getApiConfigById(currentData.apiId);

          if (role === 'client') {
            newHeight = newIsExpanded ? CONTROLLER_CLIENT_ROLE_EXPANDED_HEIGHT : CONTROLLER_NODE_DEFAULT_HEIGHT;
            if (!newTunnelAddress) {
                const controllerApiHostRaw = extractHostname(controllerConfig?.apiUrl || 'upstream-controller-host');
                const safeApiHost = (controllerApiHostRaw && controllerApiHostRaw.includes(':') && !controllerApiHostRaw.startsWith('[')) ? `[${controllerApiHostRaw}]` : controllerApiHostRaw || 'upstream-controller-host';
                const initialPort = parseInt(INTER_CONTROLLER_CLIENT_DEFAULT_PORT, 10);
                const availablePort = getNextAvailableTunnelPortOnCanvas(initialPort, safeApiHost, rfGetNodes(), n.id);
                 if (availablePort !== initialPort) {
                    toast({ title: "隧道端口已调整", description: `主控 "${currentData.label}" (客户焦点) 端口从 ${initialPort} 调整为 ${availablePort} 以避免画布冲突。`});
                    onAppLog?.(`主控 "${currentData.label}" 角色更改为客户焦点时，隧道端口自动从 ${initialPort} 调整为 ${availablePort} 以避免画布冲突。`, 'INFO');
                 }
                newTunnelAddress = `${safeApiHost}:${availablePort}`;
            }
            if (!newTargetAddress) newTargetAddress = `127.0.0.1:${CONTROLLER_CLIENT_ROLE_DEFAULT_TARGET_PORT}`;
            if (!newLogLevel) {
                newLogLevel = (controllerConfig?.masterDefaultLogLevel && controllerConfig.masterDefaultLogLevel !== 'master') ? controllerConfig.masterDefaultLogLevel : 'info';
            }
          } else { // server or general
            newHeight = newIsExpanded ? NODE_EXPANDED_DEFAULT_HEIGHT : CONTROLLER_NODE_DEFAULT_HEIGHT;
            newTunnelAddress = undefined;
            newTargetAddress = undefined;
            newLogLevel = undefined; // Reset to master defaults which are implicitly handled by the controller data itself
          }
          return {
            ...n,
            data: {
              ...currentData,
              role,
              isExpanded: newIsExpanded,
              tunnelAddress: newTunnelAddress,
              targetAddress: newTargetAddress,
              logLevel: newLogLevel
            },
            height: newHeight
          };
        }
        return n;
      })
    );
    const roleText = role === 'server' ? '服务焦点' : role === 'client' ? '客户焦点' : '通用';
    const node = rfGetNode(nodeId);
    toast({ title: "主控角色已更改", description: `主控 "${node?.data?.label}" 已设为 ${roleText}。` });
    onAppLog?.(`主控 "${node?.data?.label}" 角色已更改为 ${roleText}。`, 'INFO');
    setNodeForContextMenu(null);
  };

  const openDeleteNodeDialog = () => {
    if (nodeForContextMenu) { setNodeToDelete(nodeForContextMenu); setIsDeleteNodeDialogOpen(true); }
    setNodeForContextMenu(null); setContextMenuPosition(null);
  };

  const confirmDeleteNode = () => {
    if (nodeToDelete) {
      const deletedNodeLabel = nodeToDelete.data?.label || '未知节点';
      const deletedNodeId = nodeToDelete.id;
      deleteElements({nodes: [{id: deletedNodeId}], edges: rfGetEdges().filter(e => e.source === deletedNodeId || e.target === deletedNodeId)});
      toast({ title: "节点已删除", description: `节点 "${deletedNodeLabel}" 已被删除。`, variant: "destructive" });
      onAppLog?.(`节点 "${deletedNodeLabel}" (${deletedNodeId.substring(0,8)}) 已删除。`, 'SUCCESS');
      if (selectedNodeForPropsPanel?.id === deletedNodeId) setSelectedNodeForPropsPanel(null);
      if (selectedChainElements?.nodes.has(deletedNodeId)) updateSelectedChain(null);
    }
    setIsDeleteNodeDialogOpen(false); setNodeToDelete(null);
  };

  const formatLayout = useCallback(async (nodesToLayout?: NodePassFlowNodeType[], edgesToLayout?: Edge[]) => {
    setIsFormattingLayout(true);
    const currentNodes = nodesToLayout || rfGetNodes();
    const currentEdges = edgesToLayout || rfGetEdges();

    if (currentNodes.length === 0) {
      toast({ title: "画布为空", description: "没有可格式化的节点。" });
      setIsFormattingLayout(false);
      return;
    }

    onAppLog?.('开始ELK布局计算...', 'INFO');
    try {
      await calculateElkLayout(currentNodes, currentEdges, rfSetNodes, rfSetEdges);

      setTimeout(() => { fitView({ padding: 0.2, duration: 600 }); }, 100);
      toast({ title: "布局已使用ELK格式化", description: "节点已通过ELK重新排列。" });
      onAppLog?.('ELK布局计算完成，画布节点已格式化。', 'INFO');
    } catch (error) {
        console.error("ELK布局失败，回退到分层布局:", error);
        onAppLog?.('ELK布局失败，回退到默认分层布局。', 'ERROR', error instanceof Error ? error.message : String(error));
        const tieredNodes = calculateTieredLayout(currentNodes);
        setNodes(tieredNodes); 
        setTimeout(() => { fitView({ padding: 0.2, duration: 600 }); }, 100);
        toast({ title: "ELK布局失败", description: "已回退到默认分层布局。" , variant: "destructive"});
    } finally {
        setIsFormattingLayout(false);
    }
  }, [rfGetNodes, rfGetEdges, rfSetNodes, rfSetEdges, fitView, toast, onAppLog, setNodes]); 

  const processedNodes = useMemo(() => {
    return nodes.map(node => {
      let sanitizedNode = { ...node };
      if (!sanitizedNode.position || typeof sanitizedNode.position.x !== 'number' || isNaN(sanitizedNode.position.x) || typeof sanitizedNode.position.y !== 'number' || isNaN(sanitizedNode.position.y)) {
        console.warn(`Node ${sanitizedNode.id} has invalid position. Resetting to {0,0}. Original:`, sanitizedNode.position);
        sanitizedNode.position = { x: 0, y: 0 };
      }
      const defaultWidth = sanitizedNode.data?.type === 'controller' ? CONTROLLER_NODE_DEFAULT_WIDTH : NODE_DEFAULT_WIDTH;
      const defaultHeight = sanitizedNode.data?.type === 'controller' ? CONTROLLER_NODE_DEFAULT_HEIGHT : NODE_DEFAULT_HEIGHT;
      if (typeof sanitizedNode.width !== 'number' || isNaN(sanitizedNode.width) || sanitizedNode.width <=0) {
        sanitizedNode.width = defaultWidth;
      }
      if (typeof sanitizedNode.height !== 'number' || isNaN(sanitizedNode.height) || sanitizedNode.height <=0) {
        sanitizedNode.height = defaultHeight;
      }
      return { ...sanitizedNode, data: { ...sanitizedNode.data, isChainHighlighted: selectedChainElements?.nodes.has(sanitizedNode.id) || false } };
    });
  }, [nodes, selectedChainElements]);

  const processedEdges = useMemo(() => {
    return edges.map(edge => {
      const isHighlighted = selectedChainElements?.edges.has(edge.id);
      const sourceNode = rfGetNode(edge.source) as NodePassFlowNodeType | undefined;
      const targetNode = rfGetNode(edge.target) as NodePassFlowNodeType | undefined;
      const sourceCtrlData = sourceNode?.data?.type === 'controller' ? sourceNode.data as ControllerNodeData : null;
      const defaultColors = getEdgeStyle(sourceNode?.data?.type, targetNode?.data?.type, sourceCtrlData?.role);

      if (isHighlighted) {
        return {
            ...edge,
            style: { ...edge.style, stroke: CHAIN_HIGHLIGHT_COLOR, strokeWidth: 2.5 },
            markerEnd: { ...(edge.markerEnd as object), color: CHAIN_HIGHLIGHT_COLOR },
            animated: true,
            zIndex: 1000
        };
      } else {
        return {
            ...edge,
            style: { ...edge.style, stroke: defaultColors.stroke, strokeWidth: 1.5 },
            markerEnd: { ...(edge.markerEnd as object), color: defaultColors.markerColor },
            animated: false,
            zIndex: 1
        };
      }
    });
  }, [edges, selectedChainElements, rfGetNode, getEdgeStyle]);

  const onDragStartPanelItem = (event: React.DragEvent<HTMLDivElement>, nodeType: TopologyNodeData['type'], label?: string, apiId?: string, apiName?: string) => {
    event.dataTransfer.setData('application/reactflow-nodetype', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label || `${nodeType} 节点`);
    if (apiId) event.dataTransfer.setData('application/reactflow-apiid', apiId);
    if (apiName) event.dataTransfer.setData('application/reactflow-apiname', apiName);
    event.dataTransfer.effectAllowed = 'copy';
  };

 const handleSubmitTopology = () => {
    const currentAllNodes = rfGetNodes();
    const currentAllEdges = rfGetEdges();
    const ops: PendingOperations = {};
    apiConfigsList.forEach(conf => { ops[conf.id] = { apiConfig: conf, urlsToCreate: [] }; });

    const processedNodeIds = new Set<string>();
    const generatedServerUrlsForControllers = new Set<string>();

    const nodesToClearStatusIds = currentAllNodes
        .filter(node => (node.data?.type === 'server' || node.data?.type === 'client' || (node.data?.type === 'controller' && (node.data as ControllerNodeData).role === 'client')) && node.data?.statusInfo)
        .map(node => node.id);
    if (nodesToClearStatusIds.length > 0) {
        setNodes(nds => nds.map(n => nodesToClearStatusIds.includes(n.id) ? { ...n, data: { ...n.data, statusInfo: '' } } : n));
    }

    currentAllNodes.forEach(node => {
        const nodeData = node.data;
        if (!nodeData || nodeData.type !== 'controller' || (nodeData as ControllerNodeData).role !== 'client') return;

        const clientControllerNode = node as Node<ControllerNodeData>;
        const clientControllerData = clientControllerNode.data;
        
        const upstreamEdge = currentAllEdges.find(edge =>
            edge.target === clientControllerNode.id &&
            edge.targetHandle === 'input' &&
            rfGetNode(edge.source)?.data?.type === 'controller' &&
            (rfGetNode(edge.source)?.data as ControllerNodeData).role !== 'client'
        );

        if (upstreamEdge) { 
            const serverControllerNode = rfGetNode(upstreamEdge.source) as Node<ControllerNodeData>;
            if (!serverControllerNode || !serverControllerNode.data) {
                onAppLog?.(`主控 "${clientControllerData.label}" 的上游服务主控未找到，跳过成对实例创建。`, 'WARNING');
                processedNodeIds.add(clientControllerNode.id); 
                return;
            }
            const serverControllerData = serverControllerNode.data;

            if (clientControllerData.tunnelAddress && clientControllerData.targetAddress) {
                const clientApiId = clientControllerData.apiId; 
                let clientEffectiveTargetAddress = clientControllerData.targetAddress;

                const landingEdge = currentAllEdges.find(edge =>
                    edge.source === clientControllerNode.id &&
                    edge.sourceHandle === 'output' &&
                    rfGetNode(edge.target)?.data?.type === 'landing'
                );
                if (landingEdge) {
                    const landingNode = rfGetNode(landingEdge.target) as Node<LandingNodeData> | undefined;
                    if (landingNode?.data.landingIp && landingNode.data.landingPort) {
                        let lHost = landingNode.data.landingIp;
                        if (lHost.includes(':') && !lHost.startsWith('[')) lHost = `[${lHost}]`;
                        clientEffectiveTargetAddress = `${lHost}:${landingNode.data.landingPort}`;
                    }
                }

                const clientUrlParams = new URLSearchParams();
                if (clientControllerData.logLevel && clientControllerData.logLevel !== 'master') {
                    clientUrlParams.append('log', clientControllerData.logLevel);
                }
                const clientQueryString = clientUrlParams.toString();
                const clientUrl = `client://${clientControllerData.tunnelAddress}/${clientEffectiveTargetAddress}${clientQueryString ? '?' + clientQueryString : ''}`;

                if (ops[clientApiId]) {
                    const clientInstanceOriginalNodeId = clientControllerNode.id + "_client_role_instance";
                    if (!ops[clientApiId].urlsToCreate.some(op => op.originalNodeId === clientInstanceOriginalNodeId)) {
                        ops[clientApiId].urlsToCreate.push({ originalNodeId: clientInstanceOriginalNodeId, url: clientUrl });
                        onAppLog?.(`画布节点 ${clientControllerData.label}(客户焦点) 准备在其主控 "${ops[clientApiId].apiConfig.name}" 下创建客户端实例。URL: ${clientUrl}`, 'INFO');
                    }
                } else {
                    onAppLog?.(`无法找到画布节点 "${clientControllerData.label}" (ID: ${clientApiId}) 的 API 配置，跳过客户端实例创建。`, 'ERROR');
                }

                const serverApiId = serverControllerData.apiId; 
                
                const clientTunnelHostRaw = extractHostname(clientControllerData.tunnelAddress);
                const clientTunnelHost = (clientTunnelHostRaw && clientTunnelHostRaw.includes(':') && !clientTunnelHostRaw.startsWith('[')) ? `[${clientTunnelHostRaw}]` : clientTunnelHostRaw;
                
                const serverTunnelHostForDefinition = isTunnelPortWildcard(clientTunnelHost) || (clientTunnelHost?.includes(':') && !clientTunnelHost.startsWith('[')) ? "[::]" : "0.0.0.0";

                const serverTunnelPort = extractPort(clientControllerData.tunnelAddress) || INTER_CONTROLLER_CLIENT_DEFAULT_PORT;
                const serverTargetPort = extractPort(clientControllerData.targetAddress) || CONTROLLER_CLIENT_ROLE_DEFAULT_TARGET_PORT;


                const serverUrlParams = new URLSearchParams();
                const serverLogLevel = clientControllerData.logLevel || serverControllerData.masterDefaultLogLevel || 'info';
                if (serverLogLevel && serverLogLevel !== 'master') {
                    serverUrlParams.append('log', serverLogLevel);
                }

                const serverTlsMode = serverControllerData.masterDefaultTlsMode && serverControllerData.masterDefaultTlsMode !== 'master'
                                      ? serverControllerData.masterDefaultTlsMode : '1'; 
                serverUrlParams.append('tls', serverTlsMode);

                if (serverTlsMode === '2' && serverControllerData.masterDefaultCrtPath && serverControllerData.masterDefaultKeyPath) {
                    serverUrlParams.append('crt', serverControllerData.masterDefaultCrtPath);
                    serverUrlParams.append('key', serverControllerData.masterDefaultKeyPath);
                }

                const serverQueryString = serverUrlParams.toString();
                const serverUrl = `server://${serverTunnelHostForDefinition}:${serverTunnelPort}/0.0.0.0:${serverTargetPort}${serverQueryString ? '?' + serverQueryString : ''}`;

                if (ops[serverApiId]) {
                    if (!generatedServerUrlsForControllers.has(serverUrl)) { 
                        const serverInstanceOriginalNodeId = serverControllerNode.id + `_server_for_${clientControllerNode.id}`;
                        ops[serverApiId].urlsToCreate.push({ originalNodeId: serverInstanceOriginalNodeId, url: serverUrl });
                        generatedServerUrlsForControllers.add(serverUrl);
                        onAppLog?.(`画布节点 ${serverControllerData.label}(服务焦点) 准备在其主控 "${ops[serverApiId].apiConfig.name}" 下创建服务端实例以服务于 "${clientControllerData.label}"。URL: ${serverUrl}`, 'INFO');
                    }
                } else {
                    onAppLog?.(`无法找到画布节点 "${serverControllerData.label}" (ID: ${serverApiId}) 的 API 配置，跳过服务端实例创建。`, 'ERROR');
                }
                processedNodeIds.add(clientControllerNode.id); 
            } else {
                onAppLog?.(`主控 "${clientControllerData.label}" (客户焦点) 缺少隧道或目标地址信息，无法创建成对实例。`, 'WARNING');
                processedNodeIds.add(clientControllerNode.id);
            }
        } else { 
             if (clientControllerData.tunnelAddress && clientControllerData.targetAddress && clientControllerData.apiId) {
                const clientApiId = clientControllerData.apiId;
                let clientEffectiveTargetAddress = clientControllerData.targetAddress;

                const landingEdge = currentAllEdges.find(edge =>
                    edge.source === clientControllerNode.id &&
                    edge.sourceHandle === 'output' &&
                    rfGetNode(edge.target)?.data?.type === 'landing'
                );
                if (landingEdge) {
                    const landingNode = rfGetNode(landingEdge.target) as Node<LandingNodeData> | undefined;
                    if (landingNode?.data.landingIp && landingNode.data.landingPort) {
                        let lHost = landingNode.data.landingIp;
                        if (lHost.includes(':') && !lHost.startsWith('[')) lHost = `[${lHost}]`;
                        clientEffectiveTargetAddress = `${lHost}:${landingNode.data.landingPort}`;
                    }
                }

                const clientUrlParams = new URLSearchParams();
                if (clientControllerData.logLevel && clientControllerData.logLevel !== 'master') {
                    clientUrlParams.append('log', clientControllerData.logLevel);
                }
                const clientQueryString = clientUrlParams.toString();
                const clientUrl = `client://${clientControllerData.tunnelAddress}/${clientEffectiveTargetAddress}${clientQueryString ? '?' + clientQueryString : ''}`;

                if (ops[clientApiId]) {
                    const clientInstanceOriginalNodeId = clientControllerNode.id + "_standalone_client_instance";
                     if (!ops[clientApiId].urlsToCreate.some(op => op.originalNodeId === clientInstanceOriginalNodeId)) {
                        ops[clientApiId].urlsToCreate.push({ originalNodeId: clientInstanceOriginalNodeId, url: clientUrl });
                        onAppLog?.(`独立主控 "${clientControllerData.label}" (客户焦点) 准备在其自身主控 "${ops[clientApiId].apiConfig.name}" 下创建客户端实例。URL: ${clientUrl}`, 'INFO');
                     }
                } else {
                    onAppLog?.(`无法找到独立主控 "${clientControllerData.label}" (ID: ${clientApiId}) 的 API 配置，跳过客户端实例创建。`, 'ERROR');
                }
                processedNodeIds.add(clientControllerNode.id);
            } else {
                 onAppLog?.(`主控 "${clientControllerData.label}" (客户焦点) 未连接到上游服务焦点主控，且自身配置不足以创建独立客户端实例。`, 'INFO');
                 processedNodeIds.add(clientControllerNode.id);
            }
        }
    });


    currentAllNodes.forEach(node => {
        const nodeData = node.data;
        if (!nodeData || processedNodeIds.has(node.id)) return;

        if (nodeData.type === 'server' || nodeData.type === 'client') {
            const instanceNodeData = nodeData as ServerNodeData | ClientNodeData;
            let managingControllerId = instanceNodeData.managingApiId || null;

            if (!managingControllerId) {
                const controllerEdge = currentAllEdges.find(edge =>
                    edge.target === node.id && edge.targetHandle === 'input' &&
                    rfGetNode(edge.source)?.data?.type === 'controller' &&
                    (rfGetNode(edge.source)?.data as ControllerNodeData).role !== 'client'
                );
                if (controllerEdge) {
                    const controllerNode = rfGetNode(controllerEdge.source) as Node<ControllerNodeData> | undefined;
                    if (controllerNode?.data?.apiId) {
                        managingControllerId = controllerNode.data.apiId;
                    }
                }
            }

            if (!managingControllerId) {
                onAppLog?.(`节点 "${instanceNodeData.label}" (${node.id.substring(0,8)}) 未被任何合适的主控管理，跳过。`, 'WARNING');
                return;
            }

            const url = buildNodePassUrlFromNode(node as Node<ServerNodeData | ClientNodeData>, currentAllNodes, currentAllEdges);

            if (ops[managingControllerId] && url) {
                const instanceTypeFromUrl = url.split("://")[0] || "unknown";
                if (!ops[managingControllerId].urlsToCreate.some(op => op.originalNodeId === node.id)) {
                  ops[managingControllerId].urlsToCreate.push({ originalNodeId: node.id, url });
                  onAppLog?.(`画布节点 "${instanceNodeData.label}" 准备在主控 "${ops[managingControllerId].apiConfig.name}" 下创建 ${instanceTypeFromUrl} 实例。URL: ${url}`, 'INFO');
                  processedNodeIds.add(node.id);
                }
            } else if (url && !ops[managingControllerId]) {
                 onAppLog?.(`无法找到管理主控 (ID: ${managingControllerId}) 的 API 配置，用于节点 "${instanceNodeData.label}"，跳过。`, 'ERROR');
            } else if (!url){
                 onAppLog?.(`无法为节点 "${instanceNodeData.label}" 构建 URL，跳过。`, 'WARNING');
            }
        }
    });


    const finalOps: PendingOperations = {};
    for (const apiIdKey in ops) { if (ops[apiIdKey].urlsToCreate.length > 0) finalOps[apiIdKey] = ops[apiIdKey]; }
    const totalUrls = Object.values(finalOps).reduce((sum, group) => sum + group.urlsToCreate.length, 0);
    if (totalUrls === 0) {
      toast({ title: "无需提交", description: "未在画布中检测到可创建的实例链路。" });
      onAppLog?.('尝试提交拓扑: 无可创建的实例。', 'INFO'); return;
    }
    setPendingOperations(finalOps); setIsSubmitModalOpen(true);
    onAppLog?.(`准备提交拓扑: ${totalUrls} 个实例待创建。`, 'INFO', finalOps);
  };

  const createInstanceMutation = useMutation({
    mutationFn: (params: { data: CreateInstanceRequest, apiRoot: string, token: string, originalNodeId: string, apiName: string }) => {
      const validatedApiData = createInstanceApiSchema.parse(params.data);
      return nodePassApi.createInstance(validatedApiData, params.apiRoot, params.token);
    },
    onSuccess: (createdInstance, variables) => {
      const shortUrl = variables.data.url.length > 40 ? variables.data.url.substring(0,37) + "..." : variables.data.url;
      toast({ title: `实例已创建 (${variables.apiName})`, description: `画布节点 ${variables.originalNodeId.substring(0,8)}... (URL: ${shortUrl}) -> API实例ID: ${createdInstance.id.substring(0,8)}...` });
      onAppLog?.(`画布实例 ${variables.originalNodeId.substring(0,8)}... 创建成功 (主控: ${variables.apiName}) -> ${createdInstance.type} ${createdInstance.id.substring(0,8)}... (URL: ${shortUrl})`, 'SUCCESS');
      setNodes((nds) => nds.map((n) => {
        const baseNodeId = variables.originalNodeId.split('_server_for_')[0].split('_client_role_instance')[0].split('_standalone_client_instance')[0];
        if (n.id === baseNodeId || n.id === variables.originalNodeId) {
          return { ...n, data: { ...n.data, statusInfo: `已提交 (ID: ${createdInstance.id.substring(0,8)}...)` } };
        }
        return n;
      }));
    },
    onError: (error: any, variables) => {
      const shortUrl = variables.data.url.length > 40 ? variables.data.url.substring(0,37) + "..." : variables.data.url;
      toast({ title: `创建实例 ${variables.originalNodeId.substring(0,8)}... 出错 (${variables.apiName})`, description: `创建 (URL: ${shortUrl}) 失败: ${error.message || '未知错误。'}`, variant: 'destructive' });
      onAppLog?.(`画布实例 ${variables.originalNodeId.substring(0,8)}... 创建失败 (主控: ${variables.apiName}, URL: ${shortUrl}) - ${error.message || '未知错误'}`, 'ERROR');
      setNodes((nds) => nds.map((n) => {
        const baseNodeId = variables.originalNodeId.split('_server_for_')[0].split('_client_role_instance')[0].split('_standalone_client_instance')[0];
        if (n.id === baseNodeId || n.id === variables.originalNodeId) {
          return { ...n, data: { ...n.data, statusInfo: `提交失败` } };
        }
        return n;
      }));
    },
  });

  const handleConfirmSubmitTopology = async () => {
    setIsSubmittingTopology(true); const allSubmissionPromises: Promise<any>[] = [];
    let successCount = 0; let errorCount = 0;
    const nodesToUpdateStatusForSubmission = Object.values(pendingOperations)
      .flatMap(group => group.urlsToCreate)
      .map(({ originalNodeId }) => {
        return originalNodeId.split('_server_for_')[0].split('_client_role_instance')[0].split('_standalone_client_instance')[0];
      });

    const uniqueNodesToUpdate = [...new Set(nodesToUpdateStatusForSubmission)];

    if (uniqueNodesToUpdate.length > 0) {
      setNodes(nds => nds.map(n => uniqueNodesToUpdate.includes(n.id) ? { ...n, data: { ...n.data, statusInfo: '处理中...' } } : n ));
    }

    for (const apiIdKey in pendingOperations) {
      const opGroup = pendingOperations[apiIdKey]; const { apiConfig, urlsToCreate } = opGroup;
      const currentApiRoot = getApiRootUrl(apiConfig.id); const currentToken = getToken(apiConfig.id);
      if (!currentApiRoot || !currentToken) {
        toast({ title: "错误", description: `主控 "${apiConfig.name}" 配置无效，跳过此主控的所有操作。`, variant: "destructive" });
        onAppLog?.(`提交拓扑时主控 "${apiConfig.name}" 配置无效，跳过。`, 'ERROR'); errorCount += urlsToCreate.length;
        urlsToCreate.forEach(({ originalNodeId }) => {
            const baseNodeId = originalNodeId.split('_server_for_')[0].split('_client_role_instance')[0].split('_standalone_client_instance')[0];
            setNodes((nds) => nds.map((n) => (n.id === baseNodeId || n.id === originalNodeId) ? { ...n, data: { ...n.data, statusInfo: '主控配置错误' } } : n ));
        });
        continue;
      }
      for (const { originalNodeId, url } of urlsToCreate) {
        const promise = createInstanceMutation.mutateAsync({ data: { url }, apiRoot: currentApiRoot, token: currentToken, originalNodeId, apiName: apiConfig.name })
          .then(() => { successCount++; }).catch(() => { errorCount++; });
        allSubmissionPromises.push(promise);
      }
    }
    await Promise.allSettled(allSubmissionPromises);
    setIsSubmittingTopology(false); setPendingOperations({}); setIsSubmitModalOpen(false);
    toast({ title: "拓扑提交处理完成", description: `${successCount} 个实例创建成功, ${errorCount} 个实例创建失败或被跳过。`, variant: errorCount > 0 ? "destructive" : "default", duration: errorCount > 0 ? 8000 : 5000 });
    onAppLog?.(`拓扑提交处理完成: ${successCount} 成功, ${errorCount} 失败/跳过。`, errorCount > 0 ? 'ERROR' : 'SUCCESS');
    queryClient.invalidateQueries({ queryKey: ['instances'] }); 
    queryClient.invalidateQueries({ queryKey: ['allInstancesForTopologyPage'] }); 
    queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic'] }); 
  };

  const generateFullMasterTopology = useCallback((apiId: string) => {
    setNodes([]); setEdges([]); 
    const masterConfig = getApiConfigById(apiId);
    const instancesForThisMaster = instanceDataByApiId?.[apiId];

    if (!masterConfig) {
      toast({ title: "错误", description: `找不到主控 ${apiId} 的配置。`, variant: "destructive" });
      return;
    }
    onAppLog?.(`为 "${masterConfig.name}" 渲染完整拓扑...`, 'INFO');

    if (!instancesForThisMaster || instancesForThisMaster.length === 0) {
      toast({ title: "无实例", description: `主控 "${masterConfig.name}" 下无实例可渲染。`, variant: "default" });
      const masterNodeToAdd: NodePassFlowNodeType = {
        id: masterConfig.id,
        type: 'custom',
        position: { x: 250, y: 50 },
        data: {
          type: 'controller',
          label: masterConfig.name,
          apiId: masterConfig.id,
          apiName: masterConfig.name,
          role: 'server', 
          isExpanded: false,
          masterDefaultLogLevel: masterConfig.masterDefaultLogLevel,
          masterDefaultTlsMode: masterConfig.masterDefaultTlsMode,
        },
        width: CONTROLLER_NODE_DEFAULT_WIDTH,
        height: CONTROLLER_NODE_DEFAULT_HEIGHT,
      };
      setNodes([masterNodeToAdd]);
      return;
    }

    const newNodes: NodePassFlowNodeType[] = [];
    const newEdges: Edge[] = [];
    
    const masterNode: NodePassFlowNodeType = {
      id: masterConfig.id, type: 'custom', position: { x: 0, y: 0 },
      data: {
        type: 'controller', label: masterConfig.name, apiId: masterConfig.id, apiName: masterConfig.name,
        role: 'server', isExpanded: false,
        masterDefaultLogLevel: masterConfig.masterDefaultLogLevel,
        masterDefaultTlsMode: masterConfig.masterDefaultTlsMode,
      },
      width: CONTROLLER_NODE_DEFAULT_WIDTH, height: CONTROLLER_NODE_DEFAULT_HEIGHT,
    };
    newNodes.push(masterNode);

    const localServerNodes: NodePassFlowNodeType[] = [];
    instancesForThisMaster.filter(inst => inst.type === 'server').forEach(serverInst => {
      const parsedUrl = parseNodePassUrlForTopology(serverInst.url);
      const serverNode: NodePassFlowNodeType = {
        id: serverInst.id, type: 'custom', position: { x: 0, y: 0 },
        data: {
          type: 'server', label: `服务端 ${serverInst.id.substring(0, 6)}`, instanceType: 'server',
          tunnelAddress: parsedUrl.tunnelAddress || '', targetAddress: parsedUrl.targetAddress || '',
          logLevel: parsedUrl.logLevel || 'master', tlsMode: parsedUrl.tlsMode || 'master',
          crtPath: parsedUrl.certPath || '', keyPath: parsedUrl.keyPath || '',
          managingApiId: masterConfig.id, managingApiName: masterConfig.name, isExpanded: false,
        },
        width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT,
      };
      newNodes.push(serverNode);
      localServerNodes.push(serverNode);
      newEdges.push({
        id: `edge-${masterConfig.id}-to-${serverInst.id}`, source: masterConfig.id, target: serverInst.id,
        sourceHandle: 'output', targetHandle: 'input', type: 'smoothstep', animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: getEdgeStyle('controller', 'server', 'server').markerColor },
        style: { strokeWidth: 1.5, stroke: getEdgeStyle('controller', 'server', 'server').stroke },
      });
    });

    instancesForThisMaster.filter(inst => inst.type === 'client').forEach(clientInst => {
      const clientParsedUrl = parseNodePassUrlForTopology(clientInst.url);
      const clientNode: NodePassFlowNodeType = {
        id: clientInst.id, type: 'custom', position: { x: 0, y: 0 },
        data: {
          type: 'client', label: `客户端 ${clientInst.id.substring(0, 6)}`, instanceType: 'client',
          tunnelAddress: clientParsedUrl.tunnelAddress || '', targetAddress: clientParsedUrl.targetAddress || '',
          logLevel: clientParsedUrl.logLevel || 'master',
          managingApiId: masterConfig.id, managingApiName: masterConfig.name, isExpanded: false,
        },
        width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT,
      };
      newNodes.push(clientNode);

      let connectedToServerNodeId: string | null = null;
      if (clientParsedUrl.tunnelAddress) {
        const clientTargetHost = extractHostname(clientParsedUrl.tunnelAddress);
        const clientTargetPort = extractPort(clientParsedUrl.tunnelAddress);

        if (clientTargetPort) {
          for (const serverNode of localServerNodes) {
            const serverData = serverNode.data as ServerNodeData;
            if (serverData.tunnelAddress) {
              const serverListenHost = extractHostname(serverData.tunnelAddress);
              const serverListenPort = extractPort(serverData.tunnelAddress);
              if (serverListenPort === clientTargetPort && (serverListenHost === clientTargetHost || isTunnelPortWildcard(serverListenHost))) {
                connectedToServerNodeId = serverNode.id;
                break;
              }
            }
          }
        }
      }

      if (connectedToServerNodeId) {
        newEdges.push({
          id: `edge-${connectedToServerNodeId}-to-${clientInst.id}`, source: connectedToServerNodeId, target: clientInst.id,
          sourceHandle: 'output', targetHandle: 'input', type: 'smoothstep', animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: getEdgeStyle('server', 'client').markerColor },
          style: { strokeWidth: 1.5, stroke: getEdgeStyle('server', 'client').stroke },
        });
      } else { 
         newEdges.push({
          id: `edge-${masterConfig.id}-to-${clientInst.id}`, source: masterConfig.id, target: clientInst.id,
          sourceHandle: 'output', targetHandle: 'input', type: 'smoothstep', animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: getEdgeStyle('controller', 'client', 'server').markerColor },
          style: { strokeWidth: 1.5, stroke: getEdgeStyle('controller', 'client', 'server').stroke, strokeDasharray: '5 5' },
        });
      }

      const clientTargetHostForLanding = extractHostname(clientParsedUrl.targetAddress || '');
      if (clientTargetHostForLanding && !isTunnelPortWildcard(clientTargetHostForLanding) && clientTargetHostForLanding !== 'localhost' && clientTargetHostForLanding !== '127.0.0.1') {
        const landingNodeId = `landing-${clientInst.id}`;
        const landingNode: NodePassFlowNodeType = {
          id: landingNodeId, type: 'custom', position: { x: 0, y: 0 },
          data: {
            type: 'landing', label: `落地 (${clientTargetHostForLanding})`,
            landingIp: clientTargetHostForLanding, landingPort: extractPort(clientParsedUrl.targetAddress || '') || '',
            managingApiId: masterConfig.id, managingApiName: masterConfig.name, isExpanded: false,
          },
          width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT,
        };
        if(!newNodes.find(n => n.id === landingNodeId)) newNodes.push(landingNode);
        newEdges.push({
          id: `edge-${clientInst.id}-to-${landingNodeId}`, source: clientInst.id, target: landingNodeId,
          sourceHandle: 'output', targetHandle: 'input', type: 'smoothstep', animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: getEdgeStyle('client', 'landing').markerColor },
          style: { strokeWidth: 1.5, stroke: getEdgeStyle('client', 'landing').stroke },
        });
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
    formatLayout(newNodes, newEdges); 
  }, [getApiConfigById, instanceDataByApiId, setNodes, setEdges, toast, onAppLog, formatLayout, getEdgeStyle]);


  const handleSelectInstanceForTopologyRender = useCallback((selectedInstance: Instance, managingApiId: string) => {
    setNodes([]); setEdges([]); 
    const allKnownInstancesFlat = Object.values(instanceDataByApiId || {}).flat().filter(Boolean) as Instance[];
    const managingMasterConfig = getApiConfigById(managingApiId);

    if (!managingMasterConfig) {
        toast({ title: "错误", description: `无法找到实例 "${selectedInstance.id}" 的管理主控配置。`, variant: "destructive"});
        return;
    }
    onAppLog?.(`为实例 "${selectedInstance.id.substring(0,8)}" (主控: ${managingMasterConfig.name}) 渲染拓扑...`, 'INFO');

    const newNodes: NodePassFlowNodeType[] = [];
    const newEdges: Edge[] = [];
    const addedNodeIds = new Set<string>();

    function addNodeIfNotExists(node: NodePassFlowNodeType) {
        if (!addedNodeIds.has(node.id)) {
            newNodes.push(node);
            addedNodeIds.add(node.id);
        }
    }

    const selectedInstParsedUrl = parseNodePassUrlForTopology(selectedInstance.url);
    const selectedInstanceNode: NodePassFlowNodeType = {
        id: selectedInstance.id, type: 'custom', position: {x:0,y:0},
        data: {
            type: selectedInstance.type,
            label: `${selectedInstance.type === 'server' ? '服务端' : '客户端'} ${selectedInstance.id.substring(0,6)}`,
            apiId: managingApiId, apiName: managingMasterConfig.name,
            isExpanded: false,
            ...(selectedInstance.type === 'server' ? {
                instanceType: 'server',
                tunnelAddress: selectedInstParsedUrl.tunnelAddress, targetAddress: selectedInstParsedUrl.targetAddress,
                logLevel: selectedInstParsedUrl.logLevel, tlsMode: selectedInstParsedUrl.tlsMode,
                crtPath: selectedInstParsedUrl.certPath, keyPath: selectedInstParsedUrl.keyPath,
            } : {
                instanceType: 'client',
                tunnelAddress: selectedInstParsedUrl.tunnelAddress, targetAddress: selectedInstParsedUrl.targetAddress,
                logLevel: selectedInstParsedUrl.logLevel,
            }),
            managingApiId: managingApiId,
            managingApiName: managingMasterConfig.name
        },
        width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT,
    };
    addNodeIfNotExists(selectedInstanceNode);

    const managingMasterNode: NodePassFlowNodeType = {
        id: managingApiId, type: 'custom', position: {x:0,y:0},
        data: {
            type: 'controller', label: managingMasterConfig.name, apiId: managingApiId, apiName: managingMasterConfig.name,
            role: 'server', isExpanded: false, 
            masterDefaultLogLevel: managingMasterConfig.masterDefaultLogLevel,
            masterDefaultTlsMode: managingMasterConfig.masterDefaultTlsMode,
        },
        width: CONTROLLER_NODE_DEFAULT_WIDTH, height: CONTROLLER_NODE_DEFAULT_HEIGHT,
    };
    addNodeIfNotExists(managingMasterNode);
    newEdges.push({
        id: `edge-${managingApiId}-to-${selectedInstance.id}`, source: managingApiId, target: selectedInstance.id,
        sourceHandle: 'output', targetHandle: 'input', type: 'smoothstep', animated:false,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: getEdgeStyle('controller', selectedInstance.type as any, 'server').markerColor },
        style: { strokeWidth: 1.5, stroke: getEdgeStyle('controller', selectedInstance.type as any, 'server').stroke },
    });

    if (selectedInstance.type === 'client') {
        if (selectedInstParsedUrl.tunnelAddress) {
            allKnownInstancesFlat.filter(inst => inst?.type === 'server').forEach(potentialServer => {
                if (!potentialServer) return;
                const serverParsedUrl = parseNodePassUrlForTopology(potentialServer.url);
                const clientTargetHost = extractHostname(selectedInstParsedUrl.tunnelAddress || '');
                const clientTargetPort = extractPort(selectedInstParsedUrl.tunnelAddress || '');
                const serverListenHost = extractHostname(serverParsedUrl.tunnelAddress || '');
                const serverListenPort = extractPort(serverParsedUrl.tunnelAddress || '');

                if (clientTargetPort && serverListenPort === clientTargetPort && (serverListenHost === clientTargetHost || isTunnelPortWildcard(serverListenHost))) {
                    const serverMasterConfig = getApiConfigById(potentialServer.apiId);
                    if (serverMasterConfig) {
                        const serverNode: NodePassFlowNodeType = {
                            id: potentialServer.id, type: 'custom', position: {x:0,y:0}, data: {
                                type: 'server', label: `服务端 ${potentialServer.id.substring(0,6)}`,
                                instanceType: 'server', tunnelAddress: serverParsedUrl.tunnelAddress, targetAddress: serverParsedUrl.targetAddress,
                                logLevel: serverParsedUrl.logLevel, tlsMode: serverParsedUrl.tlsMode,
                                crtPath: serverParsedUrl.certPath, keyPath: serverParsedUrl.keyPath,
                                managingApiId: serverMasterConfig.id, managingApiName: serverMasterConfig.name, isExpanded: false,
                            }, width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT,
                        };
                        addNodeIfNotExists(serverNode);
                        const serverMasterNode: NodePassFlowNodeType = {
                            id: serverMasterConfig.id, type: 'custom', position: {x:0,y:0}, data: {
                                type: 'controller', label: serverMasterConfig.name, apiId: serverMasterConfig.id, apiName: serverMasterConfig.name,
                                role: 'server', isExpanded: false,
                                masterDefaultLogLevel: serverMasterConfig.masterDefaultLogLevel,
                                masterDefaultTlsMode: serverMasterConfig.masterDefaultTlsMode,
                            }, width: CONTROLLER_NODE_DEFAULT_WIDTH, height: CONTROLLER_NODE_DEFAULT_HEIGHT,
                        };
                        addNodeIfNotExists(serverMasterNode);
                        newEdges.push({
                            id: `edge-${serverMasterConfig.id}-to-${potentialServer.id}`, source: serverMasterConfig.id, target: potentialServer.id,
                            sourceHandle: 'output', targetHandle: 'input', type: 'smoothstep', animated:false,
                            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: getEdgeStyle('controller', 'server', 'server').markerColor },
                            style: { strokeWidth: 1.5, stroke: getEdgeStyle('controller', 'server', 'server').stroke },
                        });
                        newEdges.push({
                            id: `edge-${potentialServer.id}-to-${selectedInstance.id}`, source: potentialServer.id, target: selectedInstance.id,
                            sourceHandle: 'output', targetHandle: 'input', type: 'smoothstep', animated:false,
                            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: getEdgeStyle('server', 'client').markerColor },
                            style: { strokeWidth: 1.5, stroke: getEdgeStyle('server', 'client').stroke },
                        });
                    }
                }
            });
        }
        const clientTargetHostForLanding = extractHostname(selectedInstParsedUrl.targetAddress);
        if (clientTargetHostForLanding && !isTunnelPortWildcard(clientTargetHostForLanding) && clientTargetHostForLanding !== 'localhost' && clientTargetHostForLanding !== '127.0.0.1') {
            const isTargetAnotherServer = allKnownInstancesFlat.some(inst => inst?.type === 'server' && parseNodePassUrlForTopology(inst.url).tunnelAddress === selectedInstParsedUrl.targetAddress);
            if (!isTargetAnotherServer) {
                const landingNodeId = `landing-for-${selectedInstance.id}`;
                const landingNode: NodePassFlowNodeType = {
                    id: landingNodeId, type: 'custom', position: {x:0,y:0}, data: {
                        type: 'landing', label: `落地 (${clientTargetHostForLanding})`,
                        landingIp: clientTargetHostForLanding, landingPort: extractPort(selectedInstParsedUrl.targetAddress) || '',
                        managingApiId: managingApiId, managingApiName: managingMasterConfig.name, isExpanded: false,
                    }, width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT,
                };
                addNodeIfNotExists(landingNode);
                newEdges.push({
                    id: `edge-${selectedInstance.id}-to-${landingNodeId}`, source: selectedInstance.id, target: landingNodeId,
                    sourceHandle: 'output', targetHandle: 'input', type: 'smoothstep', animated:false,
                     markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: getEdgeStyle('client', 'landing').markerColor },
                     style: { strokeWidth: 1.5, stroke: getEdgeStyle('client', 'landing').stroke },
                });
            }
        }
    } else if (selectedInstance.type === 'server') {
        allKnownInstancesFlat.filter(inst => inst?.type === 'client').forEach(potentialClient => {
            if (!potentialClient) return;
            const clientParsedUrl = parseNodePassUrlForTopology(potentialClient.url);
            const clientTargetHost = extractHostname(clientParsedUrl.tunnelAddress || '');
            const clientTargetPort = extractPort(clientParsedUrl.tunnelAddress || '');
            const serverListenHost = extractHostname(selectedInstParsedUrl.tunnelAddress || '');
            const serverListenPort = extractPort(selectedInstParsedUrl.tunnelAddress || '');

            if (serverListenPort && clientTargetPort === serverListenPort && (clientTargetHost === serverListenHost || isTunnelPortWildcard(serverListenHost))) {
                const clientMasterConfig = getApiConfigById(potentialClient.apiId);
                if (clientMasterConfig) {
                     const clientNode: NodePassFlowNodeType = {
                        id: potentialClient.id, type: 'custom', position: {x:0,y:0}, data: {
                            type: 'client', label: `客户端 ${potentialClient.id.substring(0,6)}`,
                            instanceType: 'client', tunnelAddress: clientParsedUrl.tunnelAddress, targetAddress: clientParsedUrl.targetAddress,
                            logLevel: clientParsedUrl.logLevel,
                            managingApiId: clientMasterConfig.id, managingApiName: clientMasterConfig.name, isExpanded: false,
                        }, width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT,
                    };
                    addNodeIfNotExists(clientNode);
                    const clientMasterNode: NodePassFlowNodeType = {
                        id: clientMasterConfig.id, type: 'custom', position: {x:0,y:0}, data: {
                            type: 'controller', label: clientMasterConfig.name, apiId: clientMasterConfig.id, apiName: clientMasterConfig.name,
                            role: 'server', isExpanded: false,
                            masterDefaultLogLevel: clientMasterConfig.masterDefaultLogLevel,
                            masterDefaultTlsMode: clientMasterConfig.masterDefaultTlsMode,
                        }, width: CONTROLLER_NODE_DEFAULT_WIDTH, height: CONTROLLER_NODE_DEFAULT_HEIGHT,
                    };
                    addNodeIfNotExists(clientMasterNode);
                     newEdges.push({
                        id: `edge-${clientMasterConfig.id}-to-${potentialClient.id}`, source: clientMasterConfig.id, target: potentialClient.id,
                        sourceHandle: 'output', targetHandle: 'input', type: 'smoothstep', animated:false,
                         markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: getEdgeStyle('controller', 'client', 'server').markerColor },
                         style: { strokeWidth: 1.5, stroke: getEdgeStyle('controller', 'client', 'server').stroke },
                    });
                    newEdges.push({
                        id: `edge-${selectedInstance.id}-to-${potentialClient.id}`, source: selectedInstance.id, target: potentialClient.id,
                        sourceHandle: 'output', targetHandle: 'input', type: 'smoothstep', animated:false,
                        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: getEdgeStyle('server', 'client').markerColor },
                        style: { strokeWidth: 1.5, stroke: getEdgeStyle('server', 'client').stroke },
                    });
                    
                    const clientDownstreamTargetHost = extractHostname(clientParsedUrl.targetAddress);
                    if (clientDownstreamTargetHost && !isTunnelPortWildcard(clientDownstreamTargetHost) && clientDownstreamTargetHost !== 'localhost' && clientDownstreamTargetHost !== '127.0.0.1') {
                        const isTargetAnotherServer = allKnownInstancesFlat.some(inst => inst?.type === 'server' && parseNodePassUrlForTopology(inst.url).tunnelAddress === clientParsedUrl.targetAddress);
                        if (!isTargetAnotherServer) {
                            const landingNodeId = `landing-for-${potentialClient.id}`;
                            const landingNode: NodePassFlowNodeType = {
                                id: landingNodeId, type: 'custom', position: {x:0,y:0}, data: {
                                    type: 'landing', label: `落地 (${clientDownstreamTargetHost})`,
                                    landingIp: clientDownstreamTargetHost, landingPort: extractPort(clientParsedUrl.targetAddress) || '',
                                    managingApiId: clientMasterConfig.id, managingApiName: clientMasterConfig.name, isExpanded: false,
                                }, width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT,
                            };
                            addNodeIfNotExists(landingNode);
                            newEdges.push({
                                id: `edge-${potentialClient.id}-to-${landingNodeId}`, source: potentialClient.id, target: landingNodeId,
                                sourceHandle: 'output', targetHandle: 'input', type: 'smoothstep', animated:false,
                                markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: getEdgeStyle('client', 'landing').markerColor },
                                style: { strokeWidth: 1.5, stroke: getEdgeStyle('client', 'landing').stroke },
                            });
                        }
                    }
                }
            }
        });
    }

    setNodes(newNodes);
    setEdges(newEdges);
    formatLayout(newNodes, newEdges);
  }, [instanceDataByApiId, getApiConfigById, setNodes, setEdges, toast, onAppLog, formatLayout, getEdgeStyle]);


  if (isLoadingApiConfig) {
    return (
      <AppLayout onLog={onAppLog}>
        <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" /> <p className="ml-4 text-lg font-sans">加载主控配置...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout onLog={onAppLog}>
      <div className="flex-grow flex flex-col h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
        <TopologyControlBar
          onFitView={() => fitView({ duration: 600 })}
          onFormatLayout={() => formatLayout()} 
          onRefreshData={() => refetchAllInstances()}
          onSubmitTopology={handleSubmitTopology}
          onClearCanvas={() => setIsClearCanvasAlertOpen(true)}
          isLoadingData={isLoadingGlobalInstances || isFormattingLayout}
          lastRefreshed={lastRefreshedUi}
        />

        {fetchGlobalError && !isLoadingGlobalInstances && (
          <div className="mb-4 p-4 border border-destructive bg-destructive/10 rounded-md text-destructive text-sm font-sans flex items-center">
            <AlertTriangle size={18} className="mr-2" />
            {(apiConfigsList.length > 0 && Object.values(instanceDataByApiId || {}).every(val => val === null)) 
                ? `所有主控数据加载失败: ${fetchGlobalError.message}` 
                : `部分主控数据加载失败。请检查控制台日志或单个主控状态。`}
          </div>
        )}


        <div className="flex-grow flex flex-row gap-4 overflow-hidden"> 
          <div className="w-60 flex-shrink-0 flex flex-col gap-4">
             <DraggablePanels
              apiConfigsList={apiConfigsList}
              onDragStartPanelItem={onDragStartPanelItem}
              instanceDataByApiId={instanceDataByApiId || {}}
              isLoadingGlobalInstances={isLoadingGlobalInstances}
              onSelectInstanceForTopologyRender={handleSelectInstanceForTopologyRender}
              onSelectMasterForFullTopologyRender={generateFullMasterTopology}
            />
            <PropertiesDisplayPanel selectedNode={selectedNodeForPropsPanel} />
          </div>

          <div ref={reactFlowWrapper} className="flex-grow flex flex-col border rounded-lg shadow-md bg-background/80 backdrop-blur-sm relative" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={processedNodes}
              edges={processedEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              onNodeContextMenu={handleNodeContextMenu}
              onEdgeContextMenu={handleEdgeContextMenu}
              fitView
              fitViewOptions={{
                padding: 0.2,
                minZoom: 0.2,
                maxZoom: 1.2, 
              }}
              defaultViewport={initialViewport}
              proOptions={{ hideAttribution: true }}
              className="flex-grow bg-card" 
              nodeTypes={nodeTypes}
              nodesDraggable={true}
              nodesConnectable={true}
              zoomOnScroll={true}
              panOnScroll={false}
              panOnDrag={true}
              preventScrolling={true}
            >
              <Background gap={16} />
              <MiniMap
                style={{
                  backgroundColor: 'hsl(var(--background))',
                  maskImage: 'none',
                  WebkitMaskImage: 'none',
                }}
                nodeColor={(n: NodePassFlowNodeType) => {
                  if (!n.data) return 'hsl(var(--muted))';
                  if (n.data.isChainHighlighted) return CHAIN_HIGHLIGHT_COLOR;
                  switch (n.data.type) {
                    case 'controller': return 'hsl(var(--yellow-500))'; 
                    case 'server': return 'hsl(var(--primary))';
                    case 'client': return 'hsl(var(--accent))';
                    case 'landing': return 'hsl(var(--purple-500))'; 
                    case 'user': return 'hsl(var(--green-500))'; 
                    default: return 'hsl(var(--muted))';
                  }
                }}
                nodeStrokeWidth={3}
                nodeBorderRadius={2}
              />
              {isFormattingLayout && (
                <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-20">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="ml-3 text-sm font-sans">格式化布局中...</p>
                </div>
              )}
            </ReactFlow>
          </div>
        </div>

        {nodeForContextMenu && contextMenuPosition && (
          <DropdownMenu open={!!nodeForContextMenu} onOpenChange={(isOpen) => !isOpen && setNodeForContextMenu(null)}>
            <DropdownMenuTrigger style={{ position: 'fixed', left: contextMenuPosition.x, top: contextMenuPosition.y }} />
            <DropdownMenuContent align="start" className="w-48 font-sans">
              <DropdownMenuItem onClick={openEditPropertiesDialog}><Edit3 className="mr-2 h-4 w-4" />编辑属性</DropdownMenuItem>
              {nodeForContextMenu.data?.type === 'controller' && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><Settings2 className="mr-2 h-4 w-4" />更改角色</DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => handleChangeControllerRole(nodeForContextMenu.id, 'server')}><Target className="mr-2 h-4 w-4" />服务焦点</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleChangeControllerRole(nodeForContextMenu.id, 'client')}><Users className="mr-2 h-4 w-4" />客户焦点</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleChangeControllerRole(nodeForContextMenu.id, 'general')}><Settings2 className="mr-2 h-4 w-4" />通用</DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
              <DropdownMenuItem onClick={openDeleteNodeDialog} className="text-destructive hover:!text-destructive focus:!text-destructive focus:!bg-destructive/10"><Trash2 className="mr-2 h-4 w-4" />删除节点</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {edgeForContextMenu && edgeContextMenuPosition && (
          <DropdownMenu open={!!edgeForContextMenu} onOpenChange={(isOpen) => !isOpen && setEdgeForContextMenu(null)}>
            <DropdownMenuTrigger style={{ position: 'fixed', left: edgeContextMenuPosition.x, top: edgeContextMenuPosition.y }} />
            <DropdownMenuContent align="start" className="w-48 font-sans">
              <DropdownMenuItem onClick={deleteEdgeDirectly} className="text-destructive hover:!text-destructive focus:!text-destructive focus:!bg-destructive/10"><Unlink className="mr-2 h-4 w-4" />删除链路</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Dialog open={isEditPropertiesDialogOpen} onOpenChange={setIsEditPropertiesDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <ShadDialogTitleFromDialog className="font-title">编辑节点 {editingNodeProperties?.type === 'controller' ? ` "${(editingNodeProperties as ControllerNodeData).apiName}" 基础名称` : `属性: ${editingNodeProperties?.label}`}</ShadDialogTitleFromDialog>
              {editingNodeProperties?.type === 'landing' && <ShadDialogDescriptionFromDialog className="font-sans text-xs">对于“落地”节点, “标签 (名称)”字段将作为其标识名称。</ShadDialogDescriptionFromDialog>}
              {editingNodeProperties?.type === 'controller' && <ShadDialogDescriptionFromDialog className="font-sans text-xs">修改主控的基础名称。角色通过右键菜单更改。客户焦点角色额外属性在此配置。</ShadDialogDescriptionFromDialog>}
            </DialogHeader>
            {editingNodeProperties && (
            <div className="py-2 space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              <div className="space-y-1">
                <Label htmlFor="node-label-input" className="font-sans">{editingNodeProperties.type === 'controller' ? '基础名称 (标签)' : '标签 (名称)'}</Label>
                <Input id="node-label-input" value={editingNodeProperties.label || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, label: e.target.value }) : null)} className="font-sans" autoFocus />
              </div>
              {editingNodeProperties.type === 'controller' && (editingNodeProperties as ControllerNodeData).role === 'client' && (
                 <>
                  <div className="space-y-1"><Label htmlFor="ctrl-client-tunnel" className="font-sans">隧道地址 (客户焦点)</Label><Input id="ctrl-client-tunnel" value={(editingNodeProperties as ControllerNodeData).tunnelAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, tunnelAddress: e.target.value }) as ControllerNodeData : null)} className="font-mono text-sm" placeholder="upstream.server.com:10002"/></div>
                  <div className="space-y-1"><Label htmlFor="ctrl-client-target" className="font-sans">转发地址 (客户焦点)</Label><Input id="ctrl-client-target" value={(editingNodeProperties as ControllerNodeData).targetAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, targetAddress: e.target.value }) as ControllerNodeData : null)} className="font-mono text-sm" placeholder="127.0.0.1:8001"/></div>
                  <div className="space-y-1"><Label htmlFor="ctrl-client-log" className="font-sans">日志级别 (客户焦点)</Label><Select value={(editingNodeProperties as ControllerNodeData).logLevel || 'info'} onValueChange={(v) => setEditingNodeProperties(prev => prev ? ({ ...prev, logLevel: v as MasterLogLevel }) as ControllerNodeData : null)}><SelectTrigger className="font-sans text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="fatal">Fatal</SelectItem></SelectContent></Select></div>
                </>
              )}
              {editingNodeProperties.type === 'server' && (
                <>
                  <div className="space-y-1"><Label htmlFor="server-tunnel" className="font-sans">隧道监听地址</Label><Input id="server-tunnel" value={(editingNodeProperties as ServerNodeData).tunnelAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, tunnelAddress: e.target.value }) as ServerNodeData : null)} className="font-mono text-sm" placeholder="0.0.0.0:10001"/></div>
                  <div className="space-y-1"><Label htmlFor="server-target" className="font-sans">流量转发地址</Label><Input id="server-target" value={(editingNodeProperties as ServerNodeData).targetAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, targetAddress: e.target.value }) as ServerNodeData : null)} className="font-mono text-sm" placeholder="0.0.0.0:8080"/></div>
                  <div className="space-y-1"><Label htmlFor="server-log" className="font-sans">日志级别</Label><Select value={(editingNodeProperties as ServerNodeData).logLevel || 'info'} onValueChange={(v) => setEditingNodeProperties(prev => prev ? ({ ...prev, logLevel: v as ServerNodeData['logLevel'] }) as ServerNodeData : null)}><SelectTrigger className="font-sans text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="fatal">Fatal</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1"><Label htmlFor="server-tls" className="font-sans">TLS 模式</Label><Select value={(editingNodeProperties as ServerNodeData).tlsMode || '1'} onValueChange={(v) => setEditingNodeProperties(prev => prev ? ({ ...prev, tlsMode: v as ServerNodeData['tlsMode'] }) as ServerNodeData : null)}><SelectTrigger className="font-sans text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="0">0: 无TLS</SelectItem><SelectItem value="1">1: 自签名</SelectItem><SelectItem value="2">2: 自定义</SelectItem></SelectContent></Select></div>
                  {(editingNodeProperties as ServerNodeData).tlsMode === '2' && (<>
                    <div className="space-y-1"><Label htmlFor="server-crt" className="font-sans">证书路径 (crt)</Label><Input id="server-crt" value={(editingNodeProperties as ServerNodeData).crtPath || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, crtPath: e.target.value }) as ServerNodeData : null)} className="font-mono text-sm" placeholder="/path/to/cert.pem"/></div>
                    <div className="space-y-1"><Label htmlFor="server-key" className="font-sans">密钥路径 (key)</Label><Input id="server-key" value={(editingNodeProperties as ServerNodeData).keyPath || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, keyPath: e.target.value }) as ServerNodeData : null)} className="font-mono text-sm" placeholder="/path/to/key.pem"/></div>
                  </>)}
                </>
              )}
              {editingNodeProperties.type === 'client' && (
                 <>
                  <div className="space-y-1"><Label htmlFor="client-tunnel" className="font-sans">服务端隧道地址</Label><Input id="client-tunnel" value={(editingNodeProperties as ClientNodeData).tunnelAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, tunnelAddress: e.target.value }) as ClientNodeData : null)} className="font-mono text-sm" placeholder="your.server.com:10001"/></div>
                  <div className="space-y-1"><Label htmlFor="client-target" className="font-sans">本地转发地址</Label><Input id="client-target" value={(editingNodeProperties as ClientNodeData).targetAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, targetAddress: e.target.value }) as ClientNodeData : null)} className="font-mono text-sm" placeholder="127.0.0.1:8000"/></div>
                  <div className="space-y-1"><Label htmlFor="client-log" className="font-sans">日志级别</Label><Select value={(editingNodeProperties as ClientNodeData).logLevel || 'info'} onValueChange={(v) => setEditingNodeProperties(prev => prev ? ({ ...prev, logLevel: v as ClientNodeData['logLevel'] }) as ClientNodeData : null)}><SelectTrigger className="font-sans text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="fatal">Fatal</SelectItem></SelectContent></Select></div>
                  {(editingNodeProperties as ClientNodeData).managingApiName && <div className="text-xs text-muted-foreground pt-2">此客户端由主控 "{(editingNodeProperties as ClientNodeData).managingApiName}" 管理。</div>}
                </>
              )}
              {editingNodeProperties.type === 'landing' && (
                 <>
                  <div className="space-y-1"><Label htmlFor="landing-ip" className="font-sans">IP 地址</Label><Input id="landing-ip" value={(editingNodeProperties as LandingNodeData).landingIp || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, landingIp: e.target.value }) as LandingNodeData : null)} className="font-mono text-sm" placeholder="192.168.1.100"/></div>
                  <div className="space-y-1"><Label htmlFor="landing-port" className="font-sans">端口</Label><Input id="landing-port" value={(editingNodeProperties as LandingNodeData).landingPort || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, landingPort: e.target.value }) as LandingNodeData : null)} className="font-mono text-sm" placeholder="80"/></div>
                </>
              )}
              {editingNodeProperties.type === 'user' && <div className="space-y-1"><Label htmlFor="user-desc" className="font-sans">描述</Label><Input id="user-desc" value={(editingNodeProperties as UserNodeData).description || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, description: e.target.value }) as UserNodeData : null)} className="font-sans text-sm" placeholder="用户流量描述"/></div>}
            </div>
            )}
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline" className="font-sans" onClick={() => {setIsEditPropertiesDialogOpen(false); setEditingNodeProperties(null); setCurrentEditingNodeId(null);}}>取消</Button></DialogClose>
              <Button onClick={handleSaveNodeProperties} className="font-sans" disabled={!editingNodeProperties}>保存更改</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isDeleteNodeDialogOpen} onOpenChange={(isOpen) => { setIsDeleteNodeDialogOpen(isOpen); if (!isOpen) setNodeToDelete(null); }}>
            <AlertDialogContent>
                <AlertDialogHeader><ShadAlertDialogTitle className="font-title">确认删除节点</ShadAlertDialogTitle><ShadAlertDialogDescription className="font-sans">您确定要删除节点 “{nodeToDelete?.data?.label}” 及其所有连接吗？此操作无法撤销。</ShadAlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel onClick={() => { setIsDeleteNodeDialogOpen(false); setNodeToDelete(null);}} className="font-sans">取消</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteNode} className="bg-destructive hover:bg-destructive/90 font-sans text-destructive-foreground"><Trash2 className="mr-2 h-4 w-4"/> 删除节点</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={isClearCanvasAlertOpen} onOpenChange={setIsClearCanvasAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader><ShadAlertDialogTitle className="font-title">确认清空画布</ShadAlertDialogTitle><ShadAlertDialogDescription className="font-sans">您确定要删除画布上所有的节点和连接吗？此操作无法撤销。</ShadAlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel onClick={() => setIsClearCanvasAlertOpen(false)} className="font-sans">取消</AlertDialogCancel><AlertDialogAction onClick={clearCanvas} className="bg-destructive hover:bg-destructive/90 font-sans text-destructive-foreground"><Eraser className="mr-2 h-4 w-4"/> 清空画布</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <SubmitTopologyDialog
            isOpen={isSubmitModalOpen}
            onOpenChange={setIsSubmitModalOpen}
            pendingOperations={pendingOperations}
            isSubmitting={isSubmittingTopology}
            onConfirmSubmit={handleConfirmSubmitTopology}
        />
        <SelectManagingControllerDialog
          isOpen={isSelectControllerDialogOpen}
          onOpenChange={setSelectControllerDialogOpen}
          apiConfigsList={apiConfigsList}
          onControllerSelected={handleControllerSelectedForNodeDrop}
          droppedNodeType={pendingNodeDropData?.type || null}
          droppedNodeLabel={pendingNodeDropData?.label || null}
        />
      </div>
    </AppLayout>
  );
};

const TopologyEditorPageWrapper: NextPage = () => {
  return (
    <ReactFlowProvider>
      <TopologyPageContent />
    </ReactFlowProvider>
  );
};

export default TopologyEditorPageWrapper;

