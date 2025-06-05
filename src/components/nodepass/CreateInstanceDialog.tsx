
"use client";

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createInstanceFormSchema, type CreateInstanceFormValues, createInstanceApiSchema } from '@/zod-schemas/nodepass';
import type { CreateInstanceRequest, Instance } from '@/types/nodepass';
import { PlusCircle, Loader2, Info } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useApiConfig, type NamedApiConfig, type MasterLogLevel, type MasterTlsMode } from '@/hooks/use-api-key';
import type { AppLogEntry } from './EventLog';
import { extractHostname, extractPort } from '@/app/topology/lib/topology-utils';


interface CreateInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiId: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  apiName: string | null;
  activeApiConfig: NamedApiConfig | null;
  onLog?: (message: string, type: AppLogEntry['type']) => void;
}

function parseTunnelAddr(urlString: string): string | null {
  try {
    const url = new URL(urlString.includes('://') ? urlString : `http://${urlString}`);
    return url.host;
  } catch (e) {
    const schemeSeparator = "://";
    const schemeIndex = urlString.indexOf(schemeSeparator);
    let restOfString = urlString;

    if (schemeIndex !== -1) {
      restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
    }
    
    const pathSeparatorIndex = restOfString.indexOf('/');
    const querySeparatorIndex = restOfString.indexOf('?');
    let endOfTunnelAddr = -1;

    if (pathSeparatorIndex !== -1 && querySeparatorIndex !== -1) {
      endOfTunnelAddr = Math.min(pathSeparatorIndex, querySeparatorIndex);
    } else if (pathSeparatorIndex !== -1) {
      endOfTunnelAddr = pathSeparatorIndex;
    } else if (querySeparatorIndex !== -1) {
      endOfTunnelAddr = querySeparatorIndex;
    }
    
    const tunnelAddrCandidate = endOfTunnelAddr !== -1 ? restOfString.substring(0, endOfTunnelAddr) : restOfString;
    if (tunnelAddrCandidate.includes(':') || (!tunnelAddrCandidate.includes(':') && tunnelAddrCandidate.length > 0) ) {
        return tunnelAddrCandidate;
    }
    return null;
  }
}

const MASTER_TLS_MODE_DISPLAY_MAP: Record<MasterTlsMode | '2', string> = { 
  'master': '主控配置',
  '0': '0: 无TLS',
  '1': '1: 自签名',
  '2': '2: 自定义',
};

// This buildUrl is now more generic and expects the final targetAddress
function buildUrl(params: {
  instanceType: 'server' | 'client';
  tunnelAddress: string;
  targetAddress: string; // This should be the final, fully resolved targetAddress
  logLevel: MasterLogLevel;
  tlsMode?: MasterTlsMode | '2'; // tlsMode is optional, especially for clients
  certPath?: string;
  keyPath?: string;
}): string {
  let url = `${params.instanceType}://${params.tunnelAddress}/${params.targetAddress}`;
  const queryParams = new URLSearchParams();

  if (params.logLevel && params.logLevel !== "master") {
    queryParams.append('log', params.logLevel);
  }

  if (params.instanceType === 'server') {
    if (params.tlsMode && params.tlsMode !== "master") {
      queryParams.append('tls', params.tlsMode);
      if (params.tlsMode === '2') {
        if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
        if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
      }
    }
  }
  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}


export function CreateInstanceDialog({ open, onOpenChange, apiId, apiRoot, apiToken, apiName, activeApiConfig, onLog }: CreateInstanceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { apiConfigsList } = useApiConfig();
  const [externalApiSuggestion, setExternalApiSuggestion] = useState<string | null>(null);

  const form = useForm<CreateInstanceFormValues>({
    resolver: zodResolver(createInstanceFormSchema),
    defaultValues: {
      instanceType: 'server',
      tunnelAddress: '',
      targetAddress: '', // Will be empty for client if not auto-creating server
      logLevel: 'master',
      tlsMode: 'master', 
      certPath: '',
      keyPath: '',
      autoCreateServer: false,
    },
  });

  const instanceType = form.watch("instanceType");
  const tlsMode = form.watch("tlsMode"); 
  const autoCreateServer = form.watch("autoCreateServer");
  const tunnelAddressValue = form.watch("tunnelAddress");

  useEffect(() => {
    if (open) {
      form.reset({
        instanceType: 'server',
        tunnelAddress: '',
        targetAddress: '',
        logLevel: 'master',
        tlsMode: 'master', 
        certPath: '',
        keyPath: '',
        autoCreateServer: false,
      });
      setExternalApiSuggestion(null);
    }
  }, [open, form]);
  
  useEffect(() => {
    if (!form.formState.isDirty) {
      if (instanceType === "client") {
          form.setValue("tlsMode", "master"); // Client TLS can still apply to auto-server
          form.setValue("certPath", ''); 
          form.setValue("keyPath", '');
          if (!autoCreateServer) { // If pure client, clear targetAddress as it's auto-generated
            form.setValue("targetAddress", "");
          }
      } else if (instanceType === "server") {
          form.setValue("tlsMode", "master"); 
          form.setValue("autoCreateServer", false); 
      }
    }
  }, [instanceType, autoCreateServer, form]);

  useEffect(() => {
    if (instanceType === 'client' && tunnelAddressValue && !autoCreateServer) {
      const clientTunnelHost = extractHostname(tunnelAddressValue);
      if (!clientTunnelHost) {
        setExternalApiSuggestion(null);
        return;
      }

      const localHostnames = ['localhost', '127.0.0.1', '::', '::1', '']; 
      if (localHostnames.includes(clientTunnelHost.toLowerCase())) {
        setExternalApiSuggestion(null);
        return;
      }

      const isKnownHost = apiConfigsList.some(config => {
        const configuredApiHost = extractHostname(config.apiUrl);
        return configuredApiHost && configuredApiHost.toLowerCase() === clientTunnelHost.toLowerCase();
      });

      if (!isKnownHost) {
        setExternalApiSuggestion(`提示: 您似乎正在连接到一个外部主控 (${clientTunnelHost})。考虑将其添加为主控连接以便于管理。`);
      } else {
        setExternalApiSuggestion(null);
      }
    } else {
      setExternalApiSuggestion(null);
    }
  }, [tunnelAddressValue, instanceType, apiConfigsList, autoCreateServer]);


  const { data: serverInstancesForDropdown, isLoading: isLoadingServerInstances } = useQuery<Instance[], Error, {id: string, display: string, tunnelAddr: string}[]>({
    queryKey: ['instances', apiId, 'serversForTunnelSelection'],
    queryFn: async () => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整，无法获取服务端实例。");
      const instances = await nodePassApi.getInstances(apiRoot, apiToken);
      return instances.filter(inst => inst.type === 'server');
    },
    select: (data) => data
        .map(server => {
            const tunnelAddr = parseTunnelAddr(server.url);
            if (!tunnelAddr) return null;
            return {
                id: server.id,
                display: `ID: ${server.id.substring(0,8)}... (${tunnelAddr})`,
                tunnelAddr: tunnelAddr
            };
        })
        .filter(Boolean) as {id: string, display: string, tunnelAddr: string}[],
    enabled: !!(open && instanceType === 'client' && !autoCreateServer && apiId && apiRoot && apiToken),
  });


  const createInstanceMutation = useMutation({
    mutationFn: (data: CreateInstanceRequest) => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("没有活动的或有效的主控配置用于创建实例。");
      const validatedApiData = createInstanceApiSchema.parse(data);
      return nodePassApi.createInstance(validatedApiData, apiRoot, apiToken);
    },
    onSuccess: (data, variables) => {
      const shortUrl = variables.url.length > 40 ? variables.url.substring(0,37) + "..." : variables.url;
      toast({
        title: '实例已创建',
        description: `实例 (URL: ${shortUrl}) 已成功创建。`,
      });
      onLog?.(`实例创建成功: ${data.type} - ${data.id.substring(0,8)}... (URL: ${shortUrl})`, 'SUCCESS');
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTopologyPage']}); 
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']}); 
    },
    onError: (error: any, variables) => {
      const shortUrl = variables.url.length > 40 ? variables.url.substring(0,37) + "..." : variables.url;
      toast({
        title: '创建实例出错',
        description: `创建实例 (URL: ${shortUrl}) 失败: ${error.message || '未知错误。'}`,
        variant: 'destructive',
      });
      onLog?.(`实例创建失败: (URL: ${shortUrl}) - ${error.message || '未知错误'}`, 'ERROR');
    },
  });

  async function onSubmit(values: CreateInstanceFormValues) {
    if (!apiId || !apiRoot || !apiToken) {
        toast({ title: "操作失败", description: "未选择活动主控或主控配置无效。", variant: "destructive"});
        onLog?.('尝试创建实例失败: 未选择活动主控或主控配置无效。', 'ERROR');
        return;
    }

    let primaryInstanceUrl = '';
    let serverInstanceUrlForAutoCreate: string | null = null;

    if (values.instanceType === 'client') {
        const clientConnectsToServerTunnel = values.tunnelAddress; // e.g., your.server.com:4006 or [::]:4006
        const serverPortForClientToConnect = extractPort(clientConnectsToServerTunnel);

        if (!serverPortForClientToConnect) {
            toast({ title: "错误", description: "无法从客户端连接的隧道地址中提取端口。", variant: "destructive" });
            onLog?.('客户端隧道地址无效，无法提取端口。', 'ERROR');
            return;
        }

        const clientLocalForwardPort = (parseInt(serverPortForClientToConnect, 10) + 1).toString();
        const clientAutoGeneratedLocalTarget = `127.0.0.1:${clientLocalForwardPort}`;

        if (values.autoCreateServer) {
            // 1. Prepare Server URL (for auto-creation)
            const serverListenHostRaw = extractHostname(clientConnectsToServerTunnel) || '0.0.0.0'; // Host part from form's tunnelAddress
            const serverListenPort = extractPort(clientConnectsToServerTunnel) || '10001';         // Port part from form's tunnelAddress

            // If wildcard host was specified for server's tunnel, use 127.0.0.1 in the URL. Backend handles listening on [::] or 0.0.0.0.
            const serverEffectiveTunnelHostForUrl = (serverListenHostRaw === '0.0.0.0' || serverListenHostRaw === '::')
                ? '127.0.0.1'
                : serverListenHostRaw;
            const serverEffectiveTunnelForUrl = `${serverEffectiveTunnelHostForUrl}:${serverListenPort}`;
            
            // Server's forwarding target is from the form's targetAddress field (which is visible for server config)
            const serverForwardTargetFromForm = values.targetAddress; 
            if (!serverForwardTargetFromForm) {
                toast({ title: "错误", description: "自动创建服务端时，服务端转发目标地址是必需的。", variant: "destructive" });
                onLog?.('自动创建服务端失败: 缺少服务端转发目标地址。', 'ERROR');
                return;
            }

            serverInstanceUrlForAutoCreate = buildUrl({
                instanceType: 'server',
                tunnelAddress: serverEffectiveTunnelForUrl,
                targetAddress: serverForwardTargetFromForm,
                logLevel: values.logLevel,
                tlsMode: values.tlsMode, // This TLS mode and certs apply to the auto-created server
                certPath: values.tlsMode === '2' ? values.certPath : '',
                keyPath: values.tlsMode === '2' ? values.keyPath : '',
            });
            onLog?.(`准备自动创建服务端: ${serverInstanceUrlForAutoCreate}`, 'INFO');

            // 2. Prepare Client URL (to connect to the auto-created server)
            primaryInstanceUrl = buildUrl({
                instanceType: 'client',
                tunnelAddress: serverEffectiveTunnelForUrl,      // Client connects to where the server will listen
                targetAddress: clientAutoGeneratedLocalTarget,  // Client's local forwarding is auto-generated
                logLevel: values.logLevel,
                // For client's own URL, TLS params are not typically used.
                tlsMode: '0', certPath: '', keyPath: '',
            });
            onLog?.(`准备创建客户端实例 (连接到自动创建的服务端): ${primaryInstanceUrl}`, 'INFO');

        } else { // Client only, no auto-server
            primaryInstanceUrl = buildUrl({
                instanceType: 'client',
                tunnelAddress: clientConnectsToServerTunnel,      // Connect to specified server
                targetAddress: clientAutoGeneratedLocalTarget, // Client's local forwarding is auto-generated
                logLevel: values.logLevel,
                tlsMode: '0', certPath: '', keyPath: '',
            });
            onLog?.(`准备创建客户端实例: ${primaryInstanceUrl}`, 'INFO');
        }
    } else { // instanceType === 'server'
        // Server's targetAddress comes directly from the form
        const serverTargetAddressFromForm = values.targetAddress;
        if (!serverTargetAddressFromForm) {
             toast({ title: "错误", description: "创建服务端时，目标地址是必需的。", variant: "destructive" });
             onLog?.('创建服务端失败: 缺少目标地址。', 'ERROR');
             return;
        }
        primaryInstanceUrl = buildUrl({
            instanceType: 'server',
            tunnelAddress: values.tunnelAddress,
            targetAddress: serverTargetAddressFromForm,
            logLevel: values.logLevel,
            tlsMode: values.tlsMode,
            certPath: values.tlsMode === '2' ? values.certPath : '',
            keyPath: values.tlsMode === '2' ? values.keyPath : '',
        });
        onLog?.(`准备创建服务端实例: ${primaryInstanceUrl}`, 'INFO');
    }
    
    try {
      if (serverInstanceUrlForAutoCreate) {
        await createInstanceMutation.mutateAsync({ url: serverInstanceUrlForAutoCreate });
      }
      // Check if primaryInstanceUrl is valid before submitting
      if (primaryInstanceUrl) {
        await createInstanceMutation.mutateAsync({ url: primaryInstanceUrl }); 
      } else {
        // This case should ideally be caught earlier by validations
        throw new Error("主实例URL未能正确构建。");
      }
      
      // Only reset and close if all mutations (if any) were successful, or if the primary was.
      // createInstanceMutation.isError will reflect the status of the *last* mutation.
      // For a more robust success check, you'd need to track individual mutation statuses.
      // For now, if it reaches here without throwing, assume primary operation was initiated.
      if (!createInstanceMutation.isError || (createInstanceMutation.isSuccess && !serverInstanceUrlForAutoCreate) || (createInstanceMutation.isSuccess && serverInstanceUrlForAutoCreate && (await queryClient.getQueryState(['instances', apiId]))?.status !== 'error' )) {
        form.reset();
        onOpenChange(false); 
      }
    } catch (error: any) {
       console.error("创建实例序列中发生错误:", error);
       // Toast for this specific error might be redundant if individual mutations already toast.
    }
  }
  
  const masterLogLevelDisplay = activeApiConfig?.masterDefaultLogLevel && activeApiConfig.masterDefaultLogLevel !== 'master'
    ? activeApiConfig.masterDefaultLogLevel.toUpperCase()
    : '主控配置';
  
  const effectiveTlsModeDisplay = activeApiConfig?.masterDefaultTlsMode && activeApiConfig.masterDefaultTlsMode !== 'master'
    ? MASTER_TLS_MODE_DISPLAY_MAP[activeApiConfig.masterDefaultTlsMode as keyof typeof MASTER_TLS_MODE_DISPLAY_MAP] || '主控配置'
    : '主控配置';


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center font-title">
            <PlusCircle className="mr-2 h-6 w-6 text-primary" />
            创建新实例
          </DialogTitle>
          <DialogDescription className="font-sans">
            为当前主控 “{apiName || 'N/A'}” 配置新实例。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="instanceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">实例类型</FormLabel>
                  <Select onValueChange={(value) => {
                      field.onChange(value);
                  }} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="text-sm font-sans">
                        <SelectValue placeholder="选择实例类型" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="server" className="font-sans">服务端</SelectItem>
                      <SelectItem value="client" className="font-sans">客户端</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {instanceType === 'client' && (
              <FormField
                control={form.control}
                name="autoCreateServer"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 shadow-sm bg-muted/30">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        id="autoCreateServerCheckbox"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel htmlFor="autoCreateServerCheckbox" className="font-sans cursor-pointer text-sm">
                        自动创建匹配的服务端
                      </FormLabel>
                      <FormDescription className="font-sans text-xs">
                        在当前主控下基于此配置创建相应的服务端。客户端的本地转发端口将自动设置为服务端监听端口+1。
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="tunnelAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">
                    {instanceType === 'server' ? '服务端隧道监听地址 (控制通道)' : 
                     (autoCreateServer ? '服务端隧道监听地址 (控制通道)' : '连接的服务端隧道地址 (控制通道)')}
                  </FormLabel>
                  <FormControl>
                    <Input 
                      className="text-sm font-mono"
                      placeholder={
                        instanceType === "server" ? "例: 0.0.0.0:10101" : 
                        (autoCreateServer ? "例: [::]:8080 或 0.0.0.0:8080" : "例: your.server.com:10101")
                      } 
                      {...field}
                    />
                  </FormControl>
                   <FormDescription className="font-sans text-xs">
                    {instanceType === "server"
                      ? "服务端监听TCP控制连接的地址。"
                      : (autoCreateServer 
                          ? "自动创建的服务端将在此地址监听控制连接。"
                          : "客户端连接的服务端控制通道地址。")}
                  </FormDescription>
                  {externalApiSuggestion && (
                    <FormDescription className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-sans">
                      <Info size={14} className="inline-block mr-1.5 align-text-bottom" />
                      {externalApiSuggestion}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {instanceType === 'client' && !autoCreateServer && (
              <FormItem>
                <FormLabel className="font-sans">或从现有服务端选择隧道</FormLabel>
                <Select 
                  onValueChange={(selectedServerId) => { 
                    if (selectedServerId) {
                      const selectedServer = serverInstancesForDropdown?.find(s => s.id === selectedServerId);
                      if (selectedServer) {
                        form.setValue('tunnelAddress', selectedServer.tunnelAddr, { shouldValidate: true, shouldDirty: true });
                      }
                    }
                  }}
                  disabled={isLoadingServerInstances || !serverInstancesForDropdown || serverInstancesForDropdown.length === 0}
                >
                  <FormControl>
                    <SelectTrigger className="text-sm font-sans">
                      <SelectValue placeholder={
                        isLoadingServerInstances ? "加载服务端中..." : 
                        (!serverInstancesForDropdown || serverInstancesForDropdown.length === 0) ? "当前主控无服务端" : "选择服务端隧道"
                      } />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {isLoadingServerInstances && (
                        <div className="flex items-center justify-center p-2 font-sans">
                            <Loader2 className="h-4 w-4 animate-spin mr-2"/> 加载中...
                        </div>
                    )}
                    {serverInstancesForDropdown && serverInstancesForDropdown.map(server => (
                      <SelectItem key={server.id} value={server.id} className="font-sans">
                        {server.display}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {serverInstancesForDropdown && serverInstancesForDropdown.length === 0 && !isLoadingServerInstances && (
                    <FormDescription className="font-sans text-xs">当前活动主控下无服务端实例可供选择。</FormDescription>
                )}
              </FormItem>
            )}

            { (instanceType === 'server' || (instanceType === 'client' && autoCreateServer)) && (
              <FormField
                control={form.control}
                name="targetAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-sans">
                      {instanceType === 'server' ? '目标地址 (业务数据)' : '服务端转发目标地址 (业务数据)'}
                    </FormLabel>
                    <FormControl>
                      <Input 
                        className="text-sm font-mono"
                        placeholder={
                          instanceType === "server" ? "例: 0.0.0.0:8080 或 10.0.0.5:3000" : 
                          (autoCreateServer ? "例: 192.168.1.100:80 或 service.internal:5000" : "") 
                        } 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription className="font-sans text-xs">
                      {instanceType === "server"
                        ? "服务端业务数据的目标地址 (支持双向)。"
                        : (autoCreateServer 
                            ? "自动创建的服务端将业务流量转发到此实际目标。"
                            : "")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}


            <FormField
              control={form.control}
              name="logLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">日志级别</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="text-sm font-sans">
                        <SelectValue placeholder="选择日志级别" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                       <SelectItem value="master" className="font-sans">
                         默认 ({masterLogLevelDisplay})
                      </SelectItem>
                      <SelectItem value="debug" className="font-sans">Debug</SelectItem>
                      <SelectItem value="info" className="font-sans">Info</SelectItem>
                      <SelectItem value="warn" className="font-sans">Warn</SelectItem>
                      <SelectItem value="error" className="font-sans">Error</SelectItem>
                      <SelectItem value="fatal" className="font-sans">Fatal</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription className="font-sans text-xs">
                    实例的日志输出级别。
                    {autoCreateServer && instanceType === 'client' && " 此设置也将用于自动创建的服务端。"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="tlsMode" 
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">
                    {instanceType === 'server' ? "TLS 模式 (服务端数据通道)" : "TLS 模式"}
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "master"}>
                    <FormControl>
                      <SelectTrigger className="text-sm font-sans">
                        <SelectValue placeholder="选择 TLS 模式" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="master" className="font-sans">
                        默认 ({effectiveTlsModeDisplay})
                      </SelectItem>
                      <SelectItem value="0" className="font-sans">0: 无TLS (明文)</SelectItem>
                      <SelectItem value="1" className="font-sans">1: 自签名证书</SelectItem>
                      <SelectItem value="2" className="font-sans">2: 自定义证书</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription className="font-sans text-xs">
                    {instanceType === 'server' 
                      ? "服务端数据通道的TLS加密模式。" 
                      : (autoCreateServer 
                          ? "自动创建的服务端数据通道的TLS模式。" 
                          : "客户端连接目标服务端时采用的TLS行为。模式 '2' 表示客户端应信任自定义CA或特定证书。")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {(instanceType === 'server' || (instanceType === 'client' && autoCreateServer)) && tlsMode === '2' && (
              <>
                <FormField
                  control={form.control}
                  name="certPath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-sans">证书路径 (TLS 2)</FormLabel>
                      <FormControl>
                        <Input 
                          className="text-sm font-mono"
                          placeholder="例: /path/to/cert.pem" 
                          {...field} 
                          value={field.value || ""}
                        />
                      </FormControl>
                       <FormDescription className="font-sans text-xs">
                        {instanceType === 'client' && autoCreateServer ? "用于自动创建的服务端。" : ""}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="keyPath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-sans">密钥路径 (TLS 2)</FormLabel>
                      <FormControl>
                        <Input 
                          className="text-sm font-mono"
                          placeholder="例: /path/to/key.pem" 
                          {...field} 
                          value={field.value || ""}
                        />
                      </FormControl>
                       <FormDescription className="font-sans text-xs">
                       {instanceType === 'client' && autoCreateServer ? "用于自动创建的服务端。" : ""}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </form>
        </Form>
        <DialogFooter className="pt-4 font-sans">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createInstanceMutation.isPending}>
              取消
            </Button>
          </DialogClose>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={createInstanceMutation.isPending || !apiId}>
            {createInstanceMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                创建中...
              </>
            ) : (
              '创建实例'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
