
"use client";

import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, Eye, Trash2, ServerIcon, SmartphoneIcon, Search, KeyRound } from 'lucide-react';
import type { Instance, UpdateInstanceRequest } from '@/types/nodepass';
import { InstanceStatusBadge } from './InstanceStatusBadge';
import { InstanceControls } from './InstanceControls';
import { DeleteInstanceDialog } from './DeleteInstanceDialog';
import { InstanceDetailsModal } from './InstanceDetailsModal';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import type { AppLogEntry } from './EventLog';
import { extractHostname, extractPort, parseNodePassUrlForTopology } from '@/app/topology/lib/topology-utils';
import { formatHostForUrl } from '@/components/nodepass/create-instance-dialog/utils';


function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

interface InstanceListProps {
  apiId: string | null;
  apiName: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  activeApiConfig: NamedApiConfig | null;
  onLog?: (message: string, type: AppLogEntry['type']) => void;
}

export function InstanceList({ apiId, apiName, apiRoot, apiToken, activeApiConfig, onLog }: InstanceListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedInstanceForDetails, setSelectedInstanceForDetails] = useState<Instance | null>(null);
  const [selectedInstanceForDelete, setSelectedInstanceForDelete] = useState<Instance | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: instances, isLoading: isLoadingInstances, error: instancesError } = useQuery<Instance[], Error>({
    queryKey: ['instances', apiId],
    queryFn: () => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整。");
      return nodePassApi.getInstances(apiRoot, apiToken);
    },
    enabled: !!apiId && !!apiRoot && !!apiToken,
    refetchInterval: 15000,
  });


  const updateInstanceMutation = useMutation({
    mutationFn: ({ instanceId, action }: { instanceId: string, action: UpdateInstanceRequest['action']}) => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整。");
      return nodePassApi.updateInstance(instanceId, { action }, apiRoot, apiToken);
    },
    onSuccess: (data, variables) => {
      const actionTextMap = { start: '启动', stop: '停止', restart: '重启' };
      const actionText = actionTextMap[variables.action] || variables.action;
      toast({
        title: `实例操作: ${actionText}`,
        description: `实例 ${data.id.substring(0,8)}... 状态已改为 ${data.status}。`,
      });
      onLog?.(`实例 ${data.id.substring(0,8)}... ${actionText}成功，状态: ${data.status}`, 'SUCCESS');
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
    },
    onError: (error: any, variables) => {
      const actionTextMap = { start: '启动', stop: '停止', restart: '重启' };
      const actionText = actionTextMap[variables.action] || variables.action;
      toast({
        title: '实例操作失败',
        description: `实例 ${variables.instanceId.substring(0,8)}... ${actionText}失败: ${error.message || '未知错误。'}`,
        variant: 'destructive',
      });
      onLog?.(`实例 ${variables.instanceId.substring(0,8)}... ${actionText}失败: ${error.message || '未知错误'}`, 'ERROR');
    },
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: (instanceId: string) => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整。");
      return nodePassApi.deleteInstance(instanceId, apiRoot, apiToken);
    },
    onSuccess: (_, instanceId) => {
      toast({
        title: '实例已删除',
        description: `实例 ${instanceId.substring(0,8)}... 已删除。`,
      });
      onLog?.(`实例 ${instanceId.substring(0,8)}... 已删除。`, 'SUCCESS');
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTopologyPage']});
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']});
      setSelectedInstanceForDelete(null);
    },
    onError: (error: any, instanceId) => {
      toast({
        title: '删除实例出错',
        description: `删除实例 ${instanceId.substring(0,8)}... 失败: ${error.message || '未知错误。'}`,
        variant: 'destructive',
      });
       onLog?.(`删除实例 ${instanceId.substring(0,8)}... 失败: ${error.message || '未知错误'}`, 'ERROR');
    },
  });

  const handleCopyToClipboard = async (textToCopy: string, entity: string) => {
    if (!navigator.clipboard) {
      toast({ title: '复制失败', description: '浏览器不支持剪贴板。', variant: 'destructive' });
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast({ title: '复制成功', description: `${entity} 已复制到剪贴板。` });
    } catch (err) {
      toast({ title: '复制失败', description: `无法复制 ${entity}。`, variant: 'destructive' });
      console.error('复制失败: ', err);
    }
  };


  const filteredInstances = instances?.filter(instance =>
    instance.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    instance.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (instance.id !== '********' && instance.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (instance.id === '********' && ('api key'.includes(searchTerm.toLowerCase()) || '密钥'.includes(searchTerm.toLowerCase()) || (apiName && apiName.toLowerCase().includes(searchTerm.toLowerCase())) ))
  );

  const apiKeyInstance = filteredInstances?.find(inst => inst.id === '********');
  const otherInstances = filteredInstances?.filter(inst => inst.id !== '********');

  const renderSkeletons = () => {
    return Array.from({ length: 3 }).map((_, i) => (
      <TableRow key={`skeleton-${i}`}>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
        <TableCell>
          <div className="text-left">
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        </TableCell>
        <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
      </TableRow>
    ));
  };

  const renderInstanceRow = (instance: Instance) => {
    const parsedUrl = instance.id !== '********' ? parseNodePassUrlForTopology(instance.url) : null;
    
    let displayTargetTunnel = "N/A";
    if (parsedUrl) {
      if (instance.type === 'server') {
        displayTargetTunnel = parsedUrl.targetAddress || "N/A";
      } else if (instance.type === 'client') {
        let clientLocalForwardPort: string | null = null;
        if (parsedUrl.targetAddress) {
            clientLocalForwardPort = extractPort(parsedUrl.targetAddress);
        }
        // Fallback if no port in targetAddress, or targetAddress is missing/malformed for port extraction
        if (!clientLocalForwardPort && parsedUrl.tunnelAddress) {
            const serverTunnelPort = extractPort(parsedUrl.tunnelAddress);
            if (serverTunnelPort && /^\d+$/.test(serverTunnelPort)) {
                clientLocalForwardPort = (parseInt(serverTunnelPort, 10) + 1).toString();
            }
        }

        let managingMasterHost: string | null = null;
        if (activeApiConfig?.apiUrl) {
            managingMasterHost = extractHostname(activeApiConfig.apiUrl);
        }

        if (managingMasterHost && clientLocalForwardPort) {
            displayTargetTunnel = `${formatHostForUrl(managingMasterHost)}:${clientLocalForwardPort}`;
        } else {
            displayTargetTunnel = "N/A (信息不完整)";
        }
      }
    }


    return (
      <TableRow
        key={instance.id}
        className="text-foreground/90 hover:text-foreground"
        onDoubleClick={() => setSelectedInstanceForDetails(instance)}
      >
        <TableCell className="font-medium font-mono text-xs max-w-[100px] truncate" title={instance.id}>{instance.id}</TableCell>
        <TableCell>
          {instance.id === '********' ? (
            <Badge variant="outline" className="border-yellow-500 text-yellow-600 items-center whitespace-nowrap text-xs py-0.5 px-1.5 font-sans">
              <KeyRound className="h-3 w-3 mr-1" />API 密钥
            </Badge>
          ) : (
            <Badge
              variant={instance.type === 'server' ? 'default' : 'accent'}
              className="items-center whitespace-nowrap text-xs font-sans"
            >
              {instance.type === 'server' ? <ServerIcon size={12} className="mr-1" /> : <SmartphoneIcon size={12} className="mr-1" />}
              {instance.type === 'server' ? '出口(s)' : '入口(c)'}
            </Badge>
          )}
        </TableCell>
        <TableCell>
          {instance.id === '********' ? (
            <Badge variant="outline" className="border-yellow-500 text-yellow-600 whitespace-nowrap font-sans text-xs py-0.5 px-1.5">
              <KeyRound className="mr-1 h-3.5 w-3.5" />
              监听中
            </Badge>
          ) : (
            <InstanceStatusBadge status={instance.status} />
          )}
        </TableCell>
        <TableCell 
          className="truncate max-w-[200px] text-xs font-mono" 
        >
          <span
            className="cursor-pointer hover:text-primary transition-colors duration-150"
             title={displayTargetTunnel !== "N/A" && displayTargetTunnel !== "N/A (信息不完整)" ? `点击复制: ${displayTargetTunnel}` : ""}
            onClick={(e) => {
              e.stopPropagation();
              if (displayTargetTunnel !== "N/A" && displayTargetTunnel !== "N/A (信息不完整)") {
                handleCopyToClipboard(displayTargetTunnel, "目标/隧道地址");
              }
            }}
          >
            {displayTargetTunnel}
          </span>
        </TableCell>
        <TableCell
          className="truncate max-w-[200px] text-xs font-mono"
        >
          <span
            className="cursor-pointer hover:text-primary transition-colors duration-150"
            title={instance.id === '********' && apiName ? `点击复制主控 "${apiName}" 的 API 密钥` : `点击复制: ${instance.url}`}
            onClick={(e) => {
              e.stopPropagation();
              handleCopyToClipboard(instance.url, instance.id === '********' ? 'API 密钥' : 'URL');
            }}
          >
            {instance.id === '********' ? (apiName ? `${apiName} (API 密钥)`: '主控 API 密钥') : instance.url}
          </span>
        </TableCell>
        <TableCell className="text-left">
          <div className="text-xs whitespace-nowrap font-mono">
            {instance.id === '********' ? (
              "N/A"
            ) : (
              <>
                <div>TCP: {formatBytes(instance.tcprx)} / {formatBytes(instance.tcptx)}</div>
                <div>UDP: {formatBytes(instance.udprx)} / {formatBytes(instance.udptx)}</div>
              </>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end items-center space-x-1">
            {instance.id !== '********' && (
              <InstanceControls
                  instance={instance}
                  onAction={(id, action) => updateInstanceMutation.mutate({ instanceId: id, action })}
                  isLoading={updateInstanceMutation.isPending && updateInstanceMutation.variables?.instanceId === instance.id}
              />
            )}
            <button
                className="p-2 rounded-md hover:bg-muted"
                onClick={() => setSelectedInstanceForDetails(instance)}
                aria-label="查看详情"
            >
                <Eye className="h-4 w-4" />
            </button>
            {instance.id !== '********' && (
              <button
                  className="p-2 rounded-md hover:bg-destructive/10 text-destructive"
                  onClick={() => setSelectedInstanceForDelete(instance)}
                  aria-label="删除"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  const getTableBodyContent = () => {
    if (isLoadingInstances) {
      return renderSkeletons();
    }
    
    const rowsToRender: React.ReactNode[] = [];
    if (filteredInstances && filteredInstances.length > 0) {
      if (apiKeyInstance) {
        rowsToRender.push(renderInstanceRow(apiKeyInstance));
      }
      if (otherInstances) {
        rowsToRender.push(...otherInstances.map(instance => renderInstanceRow(instance)));
      }
    }
    
    if (rowsToRender.length > 0) {
      return rowsToRender;
    }

    let message = "加载中或无可用实例数据。";
    if (activeApiConfig) {
        if (instances && instances.length === 0) {
            message = `主控 "${activeApiConfig.name}" 下无实例。`;
        } else if (searchTerm) {
            message = `在 "${activeApiConfig.name}" 中未找到与 "${searchTerm}" 匹配的实例。`;
        }
    } else {
        message = "请选择活动主控以查看实例。";
    }
    return (
      <TableRow>
        <TableCell colSpan={7} className="text-center h-24 font-sans">
          {message}
        </TableCell>
      </TableRow>
    );
  };


  return (
    <Card className="shadow-lg mt-6">
      <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <CardTitle className="font-title">实例概览 (主控: {apiName || 'N/A'})</CardTitle>
          <CardDescription className="font-sans">管理和监控 NodePass 实例。</CardDescription>
        </div>
        <div className="relative mt-4 sm:mt-0 w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索实例..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 w-full font-sans"
          />
        </div>
      </CardHeader>
      <CardContent>
        {!apiId && (
          <div className="text-center py-10 text-muted-foreground font-sans">
            请选择活动主控以查看实例。
          </div>
        )}
        {apiId && instancesError && (
          <div className="text-destructive-foreground bg-destructive p-4 rounded-md flex items-center font-sans">
            <AlertTriangle className="h-5 w-5 mr-2" />
            加载实例错误: {instancesError.message}
          </div>
        )}
        {apiId && !instancesError && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-sans">ID</TableHead>
                <TableHead className="font-sans">类型</TableHead>
                <TableHead className="font-sans">状态</TableHead>
                <TableHead className="font-sans">目标/隧道地址</TableHead>
                <TableHead className="font-sans">URL / 密钥</TableHead>
                <TableHead className="text-left whitespace-nowrap font-sans">流量 (TCP | UDP)</TableHead>
                <TableHead className="text-right font-sans">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {getTableBodyContent()}
            </TableBody>
          </Table>
        </div>
        )}
      </CardContent>

      <InstanceDetailsModal
        instance={selectedInstanceForDetails}
        open={!!selectedInstanceForDetails}
        onOpenChange={(open) => !open && setSelectedInstanceForDetails(null)}
        apiRoot={apiRoot}
        apiToken={apiToken}
      />
      <DeleteInstanceDialog
        instance={selectedInstanceForDelete}
        open={!!selectedInstanceForDelete}
        onOpenChange={(open) => !open && setSelectedInstanceForDelete(null)}
        onConfirmDelete={(id) => deleteInstanceMutation.mutate(id)}
        isLoading={deleteInstanceMutation.isPending}
      />
    </Card>
  );
}

    
