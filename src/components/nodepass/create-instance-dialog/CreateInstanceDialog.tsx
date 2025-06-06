
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
import { extractHostname, extractPort } from '@/app/topology/lib/topology-utils';

import { CreateInstanceFormFields } from './CreateInstanceFormFields';
import { buildUrlFromFormValues, formatHostForUrl } from './utils';
import { MASTER_TLS_MODE_DISPLAY_MAP } from './constants';


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
  const { apiConfigsList } = useApiConfig();
  const [externalApiSuggestion, setExternalApiSuggestion] = useState<string | null>(null);

  const form = useForm<CreateInstanceFormValues>({
    resolver: zodResolver(createInstanceFormSchema),
    defaultValues: {
      instanceType: 'server',
      tunnelAddress: '',
      targetAddress: '', 
      logLevel: 'master',
      tlsMode: 'master', 
      certPath: '',
      keyPath: '',
      autoCreateServer: false,
    },
  });

  const instanceType = form.watch("instanceType");
  const tlsModeWatch = form.watch("tlsMode"); 
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
    if (instanceType === "client") {
        if (!form.formState.dirtyFields.tlsMode) form.setValue("tlsMode", "master");
        if (!form.formState.dirtyFields.certPath) form.setValue("certPath", '');
        if (!form.formState.dirtyFields.keyPath) form.setValue("keyPath", '');
    } else if (instanceType === "server") {
        if (form.getValues("tlsMode") !== '2') {
            if (!form.formState.dirtyFields.certPath) form.setValue("certPath", '');
            if (!form.formState.dirtyFields.keyPath) form.setValue("keyPath", '');
        }
        if (!form.formState.dirtyFields.autoCreateServer) form.setValue("autoCreateServer", false);
    }
  }, [instanceType, form]);


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
            const tunnelAddrParsed = extractHostname(server.url); 
            const tunnelPortParsed = extractPort(server.url);
            if (!tunnelAddrParsed || !tunnelPortParsed) return null;
            
            const displayTunnelAddr = `${formatHostForUrl(tunnelAddrParsed)}:${tunnelPortParsed}`;
            return {
                id: server.id,
                display: `ID: ${server.id.substring(0,8)}... (${displayTunnelAddr})`,
                tunnelAddr: displayTunnelAddr 
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

 async function onSubmitHandler(values: CreateInstanceFormValues) {
    if (!apiId || !apiRoot || !apiToken) {
        toast({ title: "操作失败", description: "未选择活动主控或主控配置无效。", variant: "destructive"});
        onLog?.('尝试创建实例失败: 未选择活动主控或主控配置无效。', 'ERROR');
        return;
    }

    let primaryInstanceUrl = '';
    let serverInstanceUrlForAutoCreate: string | null = null;
    const serverTunnelAddressFromForm = values.tunnelAddress; 
    const serverTunnelHostFromForm_Parsed = extractHostname(serverTunnelAddressFromForm);
    const serverTunnelPortFromForm_Parsed = extractPort(serverTunnelAddressFromForm);

    if (!serverTunnelPortFromForm_Parsed) {
        toast({ title: "错误", description: "无法从隧道监听地址中提取端口。", variant: "destructive" });
        onLog?.('隧道监听地址无效，无法提取端口。', 'ERROR');
        return;
    }
    const clientLocalListenHost_Formatted = formatHostForUrl(serverTunnelHostFromForm_Parsed);

    if (values.instanceType === 'client') {
        const clientLocalListenPort = (parseInt(serverTunnelPortFromForm_Parsed, 10) + 1).toString();
        const clientLocalListenTargetAddr = `${clientLocalListenHost_Formatted}:${clientLocalListenPort}`;

        if (values.autoCreateServer) {
            const serverForwardTargetFromForm = values.targetAddress; 
            if (!serverForwardTargetFromForm) {
                toast({ title: "错误", description: "自动创建服务端时，服务端转发目标地址是必需的。", variant: "destructive" });
                onLog?.('自动创建服务端失败: 缺少服务端转发目标地址。', 'ERROR');
                return;
            }
            serverInstanceUrlForAutoCreate = buildUrlFromFormValues({
                instanceType: 'server',
                tunnelAddress: serverTunnelAddressFromForm,
                targetAddress: serverForwardTargetFromForm,
                logLevel: values.logLevel,
                tlsMode: values.tlsMode,
                certPath: values.tlsMode === '2' ? values.certPath : '',
                keyPath: values.tlsMode === '2' ? values.keyPath : '',
            });
            onLog?.(`准备自动创建服务端: ${serverInstanceUrlForAutoCreate}`, 'INFO');
            const clientConnectToTunnelAddr = serverTunnelAddressFromForm;
            primaryInstanceUrl = buildUrlFromFormValues({
                instanceType: 'client',
                tunnelAddress: clientConnectToTunnelAddr,
                targetAddress: clientLocalListenTargetAddr,
                logLevel: values.logLevel,
                tlsMode: values.tlsMode,
            });
            onLog?.(`准备创建客户端实例 (连接到自动创建的服务端): ${primaryInstanceUrl}`, 'INFO');
        } else { 
            const clientConnectToTunnelAddr = serverTunnelAddressFromForm;
            primaryInstanceUrl = buildUrlFromFormValues({
                instanceType: 'client',
                tunnelAddress: clientConnectToTunnelAddr,
                targetAddress: clientLocalListenTargetAddr,
                logLevel: values.logLevel,
                tlsMode: values.tlsMode,
            });
            onLog?.(`准备创建客户端实例: ${primaryInstanceUrl}`, 'INFO');
        }
    } else { 
        const serverForwardTargetFromForm = values.targetAddress;
        if (!serverForwardTargetFromForm) {
             toast({ title: "错误", description: "创建服务端时，目标地址 (业务数据) 是必需的。", variant: "destructive" });
             onLog?.('创建服务端失败: 缺少目标地址。', 'ERROR');
             return;
        }
        primaryInstanceUrl = buildUrlFromFormValues({
            instanceType: 'server',
            tunnelAddress: serverTunnelAddressFromForm,
            targetAddress: serverForwardTargetFromForm,
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
      if (primaryInstanceUrl) {
        await createInstanceMutation.mutateAsync({ url: primaryInstanceUrl }); 
      } else {
        throw new Error("主实例URL未能正确构建。");
      }
      
      if (!createInstanceMutation.isError || (createInstanceMutation.isSuccess && !serverInstanceUrlForAutoCreate) || (createInstanceMutation.isSuccess && serverInstanceUrlForAutoCreate && (await queryClient.getQueryState(['instances', apiId]))?.status !== 'error' )) {
        form.reset();
        onOpenChange(false); 
      }
    } catch (error: any) {
       console.error("创建实例序列中发生错误:", error);
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
            instanceType={instanceType}
            tlsMode={tlsModeWatch}
            autoCreateServer={autoCreateServer}
            activeApiConfig={activeApiConfig}
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
