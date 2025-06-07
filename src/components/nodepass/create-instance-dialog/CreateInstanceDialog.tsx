
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
import { useToast } from '@/hooks/use-toast';
import { createInstanceFormSchema, type CreateInstanceFormValues, createInstanceApiSchema } from '@/zod-schemas/nodepass';
import type { CreateInstanceRequest, Instance } from '@/types/nodepass';
import { PlusCircle, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import type { AppLogEntry } from '../EventLog';
import { extractHostname, extractPort, parseNodePassUrlForTopology } from '@/app/topology/lib/topology-utils';

import { CreateInstanceFormFields } from './CreateInstanceFormFields';
import { buildUrlFromFormValues, formatHostForUrl } from './utils';
// MASTER_TLS_MODE_DISPLAY_MAP removed as it's used in FormFields

// Helper to check for wildcard hostnames
const isWildcardHostname = (host: string | null | undefined): boolean => {
    if (!host) return true;
    const lowerHost = host.toLowerCase();
    return lowerHost === '0.0.0.0' || lowerHost === '[::]' || lowerHost === '::';
};

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

export function CreateInstanceDialog({ open, onOpenChange, apiId, apiRoot, apiToken, apiName, activeApiConfig, onLog }: CreateInstanceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { apiConfigsList, getApiConfigById, getApiRootUrl, getToken } = useApiConfig();
  const [externalApiSuggestion, setExternalApiSuggestion] = useState<string | null>(null);

  const form = useForm<CreateInstanceFormValues>({
    resolver: zodResolver(createInstanceFormSchema),
    defaultValues: {
      instanceType: '入口(c)',
      autoCreateServer: false,
      serverApiId: undefined, // Start with undefined, let autoCreateServer effect populate
      tunnelAddress: '',
      targetAddress: '',
      logLevel: 'master',
      tlsMode: 'master',
      certPath: '',
      keyPath: '',
    },
  });

  const instanceType = form.watch("instanceType");
  const tlsModeWatch = form.watch("tlsMode");
  const autoCreateServerWatched = form.watch("autoCreateServer"); // Watched state
  const tunnelAddressValue = form.watch("tunnelAddress");

  useEffect(() => {
    if (open) {
      form.reset({
        instanceType: '入口(c)',
        autoCreateServer: false,
        serverApiId: undefined,
        tunnelAddress: '',
        targetAddress: '',
        logLevel: 'master',
        tlsMode: 'master',
        certPath: '',
        keyPath: '',
      });
      setExternalApiSuggestion(null);
    }
  }, [open, form]);

 useEffect(() => {
    if (instanceType === "入口(c)") {
        if (!form.formState.dirtyFields.tlsMode) form.setValue("tlsMode", "master");
        if (!form.formState.dirtyFields.certPath) form.setValue("certPath", '');
        if (!form.formState.dirtyFields.keyPath) form.setValue("keyPath", '');
    } else if (instanceType === "出口(s)") {
        if (form.getValues("tlsMode") !== '2') {
            if (!form.formState.dirtyFields.certPath) form.setValue("certPath", '');
            if (!form.formState.dirtyFields.keyPath) form.setValue("keyPath", '');
        }
        if (!form.formState.dirtyFields.autoCreateServer) form.setValue("autoCreateServer", false);
    }
  }, [instanceType, form]);

  useEffect(() => {
    if (instanceType === "入口(c)" && autoCreateServerWatched) {
      const otherMasters = apiConfigsList.filter(c => c.id !== activeApiConfig?.id);
      if (otherMasters.length > 0) {
        const currentServerApiId = form.getValues("serverApiId");
        if (!currentServerApiId || !otherMasters.some(m => m.id === currentServerApiId)) {
          form.setValue("serverApiId", otherMasters[0].id, { shouldValidate: true, shouldDirty: true });
        }
      } else {
        form.setValue("serverApiId", undefined, { shouldValidate: true, shouldDirty: true });
      }
    } else if (instanceType === "入口(c)" && !autoCreateServerWatched) {
      // When autoCreateServer is unchecked, serverApiId is no longer directly relevant for selection
      // We can clear it or leave it; current form structure hides it.
      // To be safe, let's clear if it was previously set for an "other master".
      // form.setValue("serverApiId", undefined); // This could be too disruptive.
    }
  }, [instanceType, autoCreateServerWatched, apiConfigsList, activeApiConfig, form]);


  useEffect(() => {
    if (instanceType === '入口(c)' && tunnelAddressValue && !autoCreateServerWatched) {
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
        setExternalApiSuggestion(`提示: 连接到外部主控 (${clientTunnelHost})。可考虑将其添加为主控连接。`);
      } else {
        setExternalApiSuggestion(null);
      }
    } else {
      setExternalApiSuggestion(null);
    }
  }, [tunnelAddressValue, instanceType, apiConfigsList, autoCreateServerWatched]);

  const { data: serverInstancesForDropdown, isLoading: isLoadingServerInstances } = useQuery<
    Array<{id: string, display: string, tunnelAddr: string, masterName: string}>,
    Error
  >({
    queryKey: ['otherMastersServersForDropdown', apiConfigsList.map(c => c.id).join('-'), activeApiConfig?.id],
    queryFn: async () => {
      if (!activeApiConfig) return [];

      const otherMasters = apiConfigsList.filter(config => config.id !== activeApiConfig.id);
      if (otherMasters.length === 0) {
        onLog?.('无其他主控可供选择出口(s)隧道。', 'INFO');
        return [];
      }
      onLog?.(`为入口(c)获取其他主控 (${otherMasters.map(m=>m.name).join(', ')}) 的出口(s)列表...`, 'INFO');

      let combinedServers: Array<{id: string, display: string, tunnelAddr: string, masterName: string}> = [];

      for (const master of otherMasters) {
        const masterApiRoot = getApiRootUrl(master.id);
        const masterApiToken = getToken(master.id);
        if (!masterApiRoot || !masterApiToken) {
          console.warn(`跳过主控 ${master.name} (出口(s)下拉列表): API信息不完整。`);
          onLog?.(`跳过主控 ${master.name} (出口(s)下拉列表): API信息不完整。`, 'WARN');
          continue;
        }
        try {
          const instances = await nodePassApi.getInstances(masterApiRoot, masterApiToken);
          const serversFromThisMaster = instances
            .filter(inst => inst.type === 'server')
            .map(serverInst => {
              const parsedUrl = parseNodePassUrlForTopology(serverInst.url);
              if (!parsedUrl.tunnelAddress) return null;
              return {
                id: serverInst.id,
                display: `主控: ${master.name} - ID: ${serverInst.id.substring(0,8)}... (${parsedUrl.tunnelAddress})`,
                tunnelAddr: parsedUrl.tunnelAddress,
                masterName: master.name,
              };
            })
            .filter(Boolean) as Array<{id: string, display: string, tunnelAddr: string, masterName: string}>;

          const clientInstancesOnThisOtherMaster = instances.filter(inst => inst.type === 'client');
          const usedServerTunnelAddressesOnThisOtherMaster = new Set<string>();
          clientInstancesOnThisOtherMaster.forEach(clientInst => {
            const parsedClientUrl = parseNodePassUrlForTopology(clientInst.url);
            if (parsedClientUrl.tunnelAddress) { usedServerTunnelAddressesOnThisOtherMaster.add(parsedClientUrl.tunnelAddress.toLowerCase()); }
          });

          const availableServers = serversFromThisMaster.filter(server =>
            !usedServerTunnelAddressesOnThisOtherMaster.has(server.tunnelAddr.toLowerCase())
          );
          combinedServers.push(...availableServers);

        } catch (error: any) {
          console.error(`从主控 ${master.name} 获取出口(s)失败:`, error.message);
          onLog?.(`从主控 ${master.name} 获取出口(s)失败: ${error.message}`, 'ERROR');
        }
      }
      onLog?.(`为入口(c)获取到 ${combinedServers.length} 个来自其他主控的可用出口(s)隧道。`, 'INFO');
      return combinedServers;
    },
    enabled: !!(open && instanceType === '入口(c)' && !autoCreateServerWatched && apiConfigsList.length > 0 && activeApiConfig),
  });


  const createInstanceMutation = useMutation({
    mutationFn: (params: { data: CreateInstanceRequest, useApiRoot?: string, useApiToken?: string }) => {
      const effectiveApiRoot = params.useApiRoot || apiRoot;
      const effectiveApiToken = params.useApiToken || apiToken;

      if (!effectiveApiRoot || !effectiveApiToken) throw new Error("API configuration is incomplete.");
      const validatedApiData = createInstanceApiSchema.parse(params.data);
      return nodePassApi.createInstance(validatedApiData, effectiveApiRoot, effectiveApiToken);
    },
    onSuccess: (createdInstance, variables) => {
      const shortUrl = variables.data.url.length > 40 ? variables.data.url.substring(0,37) + "..." : variables.data.url;
      const masterNameForToast = variables.useApiRoot === apiRoot ? apiName : apiConfigsList.find(c => getApiRootUrl(c.id) === variables.useApiRoot)?.name || 'a master';

      toast({
        title: `实例创建于 ${masterNameForToast}`,
        description: `实例 (URL: ${shortUrl}) -> ID: ${createdInstance.id.substring(0,8)}...`,
      });
      onLog?.(`实例创建成功于 ${masterNameForToast}: ${createdInstance.type === 'server' ? '出口(s)' : '入口(c)'} - ${createdInstance.id.substring(0,8)}... (URL: ${shortUrl})`, 'SUCCESS');

      queryClient.invalidateQueries({ queryKey: ['instances', variables.useApiRoot === apiRoot ? apiId : apiConfigsList.find(c => getApiRootUrl(c.id) === variables.useApiRoot)?.id] });
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTopologyPage']});
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']});
    },
    onError: (error: any, variables) => {
      const shortUrl = variables.data.url.length > 40 ? variables.data.url.substring(0,37) + "..." : variables.data.url;
      const masterNameForToast = variables.useApiRoot === apiRoot ? apiName : apiConfigsList.find(c => getApiRootUrl(c.id) === variables.useApiRoot)?.name || 'a master';
      toast({
        title: `创建实例失败于 ${masterNameForToast}`,
        description: `创建 (URL: ${shortUrl}) 失败: ${error.message || '未知错误。'}`,
        variant: 'destructive',
      });
      onLog?.(`创建实例失败于 ${masterNameForToast}: (URL: ${shortUrl}) - ${error.message || '未知错误'}`, 'ERROR');
    },
  });

 async function onSubmitHandler(values: CreateInstanceFormValues) {
    const clientMasterApiId = apiId;
    const clientMasterApiRoot = apiRoot;
    const clientMasterApiToken = apiToken;

    if (!clientMasterApiId || !clientMasterApiRoot || !clientMasterApiToken || !activeApiConfig) {
        toast({ title: "操作失败", description: "当前主控配置无效。", variant: "destructive"});
        onLog?.('尝试创建实例失败: 当前主控配置无效。', 'ERROR');
        return;
    }

    let clientInstanceUrl = '';
    let serverInstanceUrlForAutoCreate: string | null = null;

    const formTunnelInput = values.tunnelAddress; // For client+auto, this is server's port. For client direct, this is server's full addr. For server, this is server's full listen addr.
    const formTargetAddress = values.targetAddress; // For client+auto, this is server's target. For client direct, this is client's local target. For server, this is server's target.

    const portFromTunnelInput = extractPort(formTunnelInput);
    if (!portFromTunnelInput && values.instanceType === "入口(c)" && values.autoCreateServer) { // Only mandatory if it's just a port for auto-server
        toast({ title: "错误", description: "为自动创建的出口(s)指定隧道监听端口是必需的。", variant: "destructive" });
        onLog?.('创建实例失败: 未能从出口(s)隧道监听端口输入中提取有效端口。', 'ERROR');
        return;
    }
     if (!portFromTunnelInput && values.instanceType === "出口(s)") {
        toast({ title: "错误", description: "无法从出口(s)隧道监听地址中提取有效端口。", variant: "destructive" });
        onLog?.('创建实例失败: 无法从出口(s)隧道监听地址中提取有效端口。', 'ERROR');
        return;
    }


    if (values.instanceType === '入口(c)') {
        if (values.autoCreateServer) {
            // --- 1. 准备【出口(s)】参数 ---
            const serverListenHost_ForDefinition = '[::]'; 
            const serverListenPort_ForDefinition = portFromTunnelInput!; // Already validated above

            const serverActualTargetAddress = formTargetAddress; // This is the server's target address from the form
            if (!serverActualTargetAddress) {
                toast({ title: "错误", description: "自动创建出口(s)时，其转发目标地址是必需的。", variant: "destructive" }); return;
            }

            const serverTargetMasterId = values.serverApiId;
            if (!serverTargetMasterId) {
                toast({ title: "错误", description: "自动创建出口(s)时，必须选择一个目标主控。", variant: "destructive" });
                onLog?.('尝试创建实例失败: 自动创建出口(s)但未选择目标主控。', 'ERROR');
                return;
            }
            const serverMasterConfig = getApiConfigById(serverTargetMasterId);
            if (!serverMasterConfig) {
                toast({ title: "错误", description: `选择的出口(s)主控 (ID: ${serverTargetMasterId}) 未找到。`, variant: "destructive" }); return;
            }

            serverInstanceUrlForAutoCreate = buildUrlFromFormValues({
                instanceType: '出口(s)',
                tunnelAddress: `${serverListenHost_ForDefinition}:${serverListenPort_ForDefinition}`,
                targetAddress: serverActualTargetAddress,
                logLevel: values.logLevel,
                tlsMode: values.tlsMode,
                certPath: values.tlsMode === '2' ? values.certPath : '',
                keyPath: values.tlsMode === '2' ? values.keyPath : '',
            }, serverMasterConfig);
            onLog?.(`准备自动创建出口(s)于 "${serverMasterConfig.name}": ${serverInstanceUrlForAutoCreate}`, 'INFO');

            // --- 2. 准备【入口(c)】参数 ---
            const clientConnectToServerHost = extractHostname(serverMasterConfig.apiUrl); 
            if (!clientConnectToServerHost) {
                 toast({ title: "错误", description: `无法从出口(s)主控 "${serverMasterConfig.name}" API URL提取主机名。`, variant: "destructive" }); return;
            }
            const clientConnectToServerPort = serverListenPort_ForDefinition; 

            const clientConnectToFullTunnelAddr = `${formatHostForUrl(clientConnectToServerHost)}:${clientConnectToServerPort}`;
            // Client's local forward target uses [::]:port+1 if form field is empty
            const clientLocalForwardTargetAddress = values.targetAddress || `[::]:${(parseInt(clientConnectToServerPort, 10) + 1).toString()}`;


            clientInstanceUrl = buildUrlFromFormValues({
                instanceType: '入口(c)',
                tunnelAddress: clientConnectToFullTunnelAddr,
                targetAddress: clientLocalForwardTargetAddress,
                logLevel: values.logLevel,
            }, activeApiConfig); 
            onLog?.(`准备创建入口(c)实例于 "${activeApiConfig.name}": ${clientInstanceUrl}`, 'INFO');

        } else { // 入口(c) connecting to an existing server
            const clientRemoteFullAddress = formTunnelInput; 
            const clientRemotePort = extractPort(clientRemoteFullAddress);
            if (!clientRemotePort) {
                toast({ title: "错误", description: "无法从连接的出口(s)隧道地址提取端口。", variant: "destructive" }); return;
            }
            const clientLocalForwardPortCalculated = (parseInt(clientRemotePort, 10) + 1).toString();
            // Client's local forward target uses [::]:port+1 if form field is empty
            const clientLocalForwardTargetAddress = values.targetAddress || `[::]:${clientLocalForwardPortCalculated}`;

            clientInstanceUrl = buildUrlFromFormValues({
                instanceType: '入口(c)',
                tunnelAddress: clientRemoteFullAddress,
                targetAddress: clientLocalForwardTargetAddress,
                logLevel: values.logLevel,
            }, activeApiConfig);
            onLog?.(`准备创建入口(c)实例于 "${activeApiConfig.name}": ${clientInstanceUrl}`, 'INFO');
        }

    } else { // 出口(s) instance
        const serverListenHost_ForDefinition = extractHostname(formTunnelInput) || '0.0.0.0'; 
        const serverListenPort_ForDefinition = portFromTunnelInput!; // Already validated

        const serverActualTargetAddress = formTargetAddress;
        if (!serverActualTargetAddress) {
             toast({ title: "错误", description: "创建出口(s)时，目标地址 (业务数据) 是必需的。", variant: "destructive" }); return;
        }

        clientInstanceUrl = buildUrlFromFormValues({
            instanceType: '出口(s)',
            tunnelAddress: `${formatHostForUrl(serverListenHost_ForDefinition)}:${serverListenPort_ForDefinition}`,
            targetAddress: serverActualTargetAddress,
            logLevel: values.logLevel,
            tlsMode: values.tlsMode,
            certPath: values.tlsMode === '2' ? values.certPath : '',
            keyPath: values.tlsMode === '2' ? values.keyPath : '',
        }, activeApiConfig);
        onLog?.(`准备创建出口(s)实例于 "${activeApiConfig.name}": ${clientInstanceUrl}`, 'INFO');
    }

    try {
      let serverCreationOk = true;
      if (serverInstanceUrlForAutoCreate) {
        const serverTargetMasterId = values.serverApiId; 
        const serverTargetMasterConfig = getApiConfigById(serverTargetMasterId!);
        const serverTargetApiRoot = serverTargetMasterConfig ? getApiRootUrl(serverTargetMasterConfig.id) : null;
        const serverTargetApiToken = serverTargetMasterConfig ? getToken(serverTargetMasterConfig.id) : null;

        if (!serverTargetApiRoot || !serverTargetApiToken) {
          toast({title: "配置错误", description: `无法为出口(s)找到有效的API配置 (主控ID: ${serverTargetMasterId})`, variant: "destructive"});
          serverCreationOk = false;
        } else {
          try {
            await createInstanceMutation.mutateAsync({
              data: { url: serverInstanceUrlForAutoCreate },
              useApiRoot: serverTargetApiRoot,
              useApiToken: serverTargetApiToken,
            });
          } catch (e) {
            serverCreationOk = false;
          }
        }
      }

      if (clientInstanceUrl && serverCreationOk) {
        await createInstanceMutation.mutateAsync({
            data: { url: clientInstanceUrl },
            useApiRoot: clientMasterApiRoot,
            useApiToken: clientMasterApiToken,
         });
      } else if (!clientInstanceUrl) {
        onLog?.('主实例URL未能正确构建，创建中止。', 'ERROR');
        toast({ title: "内部错误", description: "主实例URL未能构建。", variant: "destructive" });
        return;
      }

      if (!createInstanceMutation.isError && serverCreationOk) {
         form.reset();
         onOpenChange(false);
      }
    } catch (error: any) {
       console.error("创建实例序列中发生意外错误:", error);
       onLog?.(`创建实例序列中发生意外错误: ${error.message}`, 'ERROR');
    }
  }

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

        <CreateInstanceFormFields
            form={form}
            instanceType={instanceType as "入口(c)" | "出口(s)"}
            tlsMode={tlsModeWatch}
            autoCreateServer={autoCreateServerWatched}
            activeApiConfig={activeApiConfig}
            apiConfigsList={apiConfigsList}
            serverInstancesForDropdown={serverInstancesForDropdown}
            isLoadingServerInstances={isLoadingServerInstances}
            externalApiSuggestion={externalApiSuggestion}
            onSubmitHandler={onSubmitHandler}
        />

        <DialogFooter className="pt-4 font-sans">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createInstanceMutation.isPending}>
              取消
            </Button>
          </DialogClose>
          <Button type="submit" form="create-instance-form" disabled={createInstanceMutation.isPending || !apiId}>
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
