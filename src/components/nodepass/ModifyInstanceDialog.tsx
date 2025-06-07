
"use client";

import React, { useEffect } from 'react';
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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { modifyInstanceFormSchema, type ModifyInstanceFormValues, modifyInstanceConfigApiSchema } from '@/zod-schemas/nodepass';
import type { Instance, ModifyInstanceConfigRequest } from '@/types/nodepass';
import { Pencil, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import type { NamedApiConfig, MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';
import type { AppLogEntry } from './EventLog';


interface ModifyInstanceDialogProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiId: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  apiName: string | null;
  activeApiConfig: NamedApiConfig | null;
  onLog?: (message: string, type: AppLogEntry['type']) => void;
}

interface ParsedNodePassUrl {
  instanceType: 'server' | 'client' | null; // API still uses server/client
  tunnelAddress: string | null;
  targetAddress: string | null;
  logLevel: MasterLogLevel;
  tlsMode: MasterTlsMode | null; 
  certPath: string | null;
  keyPath: string | null;
}

function parseNodePassUrl(url: string): ParsedNodePassUrl {
  const result: ParsedNodePassUrl = {
    instanceType: null,
    tunnelAddress: '',
    targetAddress: '',
    logLevel: 'master',
    tlsMode: null, 
    certPath: '',
    keyPath: '',
  };

  if (!url) return result;

  try {
    const schemeMatch = url.match(/^([a-zA-Z]+):\/\//);
    if (schemeMatch && (schemeMatch[1] === 'server' || schemeMatch[1] === 'client')) {
      result.instanceType = schemeMatch[1] as 'server' | 'client';
    } else {
      console.warn("无法从 URL 解析实例类型:", url);
      if (url.includes("?tls=") || url.includes("&tls=")) result.instanceType = "server";
      else result.instanceType = "client"; 
    }

    const restOfUrl = schemeMatch ? url.substring(schemeMatch[0].length) : url;
    const parts = restOfUrl.split('?');
    const pathPart = parts[0];
    const queryPart = parts[1];

    const addresses = pathPart.split('/');
    if (addresses.length > 0) {
      result.tunnelAddress = addresses[0] || '';
    }
    if (addresses.length > 1) {
      result.targetAddress = addresses.slice(1).join('/') || '';
    }


    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      const log = params.get('log');
      if (log && ['debug', 'info', 'warn', 'error', 'fatal'].includes(log)) {
        result.logLevel = log as MasterLogLevel;
      } else {
        result.logLevel = 'master'; 
      }

      if (result.instanceType === 'server') {
        const tls = params.get('tls');
        if (tls && ['0', '1', '2'].includes(tls)) {
          result.tlsMode = tls as MasterTlsMode;
        } else {
           result.tlsMode = 'master'; 
        }
        if (result.tlsMode === '2') {
          result.certPath = params.get('crt') || '';
          result.keyPath = params.get('key') || '';
        }
      }
    } else {
      result.logLevel = 'master';
      if (result.instanceType === 'server') {
        result.tlsMode = 'master';
      }
    }
  } catch (e) {
    console.error("解析 NodePass URL 错误:", url, e);
  }
  return result;
}

function buildUrl(values: ModifyInstanceFormValues): string {
  const schemeType = values.instanceType === "出口(s)" ? "server" : "client"; // Map to API expected values
  let url = `${schemeType}://${values.tunnelAddress}/${values.targetAddress}`;
  const queryParams = new URLSearchParams();

  if (values.logLevel !== "master") {
    queryParams.append('log', values.logLevel);
  }

  if (schemeType === 'server') { // Use mapped schemeType
    if (values.tlsMode && values.tlsMode !== "master") {
      queryParams.append('tls', values.tlsMode);
      if (values.tlsMode === '2') {
        if (values.certPath && values.certPath.trim() !== '') queryParams.append('crt', values.certPath.trim());
        if (values.keyPath && values.keyPath.trim() !== '') queryParams.append('key', values.keyPath.trim());
      }
    }
  }
  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}

const MASTER_TLS_MODE_DISPLAY_MAP: Record<MasterTlsMode, string> = {
  'master': '主控配置',
  '0': '0: 无TLS',
  '1': '1: 自签名',
  '2': '2: 自定义',
};


export function ModifyInstanceDialog({ instance, open, onOpenChange, apiId, apiRoot, apiToken, apiName, activeApiConfig, onLog }: ModifyInstanceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ModifyInstanceFormValues>({
    resolver: zodResolver(modifyInstanceFormSchema),
    defaultValues: { 
      instanceType: '出口(s)', // Default will be overridden by instance data
      tunnelAddress: '',
      targetAddress: '',
      logLevel: 'master',
      tlsMode: 'master',
      certPath: '',
      keyPath: '',
    },
  });

  const instanceType = form.watch("instanceType");
  const tlsMode = form.watch("tlsMode");


  useEffect(() => {
    if (instance && open) {
      const parsedUrl = parseNodePassUrl(instance.url);
      form.reset({
        instanceType: parsedUrl.instanceType === 'server' ? "出口(s)" : "入口(c)", // Map here
        tunnelAddress: parsedUrl.tunnelAddress || '',
        targetAddress: parsedUrl.targetAddress || '',
        logLevel: parsedUrl.logLevel || 'master',
        tlsMode: parsedUrl.instanceType === 'server' ? (parsedUrl.tlsMode || 'master') : undefined,
        certPath: parsedUrl.certPath || '',
        keyPath: parsedUrl.keyPath || '',
      });
    } else if (!open) {
      form.reset(); 
    }
  }, [instance, open, form]);

  const modifyInstanceMutation = useMutation({
    mutationFn: (data: { instanceId: string; config: ModifyInstanceConfigRequest }) => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整。");
      if (!data.instanceId) throw new Error("实例ID未提供。");
      
      const validatedApiData = modifyInstanceConfigApiSchema.parse(data.config);
      return nodePassApi.modifyInstanceConfig(data.instanceId, validatedApiData, apiRoot, apiToken);
    },
    onSuccess: (updatedInstance) => {
      const shortId = updatedInstance.id.substring(0,8);
      toast({
        title: '实例已修改',
        description: `实例 ${shortId}... 配置已更新。`,
      });
      onLog?.(`实例 ${shortId}... 配置已更新。新URL: ${updatedInstance.url}`, 'SUCCESS');
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTopology']});
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']});
      onOpenChange(false);
    },
    onError: (error: any, variables) => {
      const shortId = variables.instanceId.substring(0,8);
      toast({
        title: '修改实例配置出错',
        description: `修改实例 ${shortId}... 失败: ${error.message || '未知错误。'}`,
        variant: 'destructive',
      });
      onLog?.(`修改实例 ${shortId}... 失败: ${error.message || '未知错误'}`, 'ERROR');
    },
  });

  function onSubmit(values: ModifyInstanceFormValues) {
    if (instance) {
      const newUrl = buildUrl(values);
      onLog?.(`尝试修改实例 ${instance.id.substring(0,8)}... 新URL: ${newUrl}`, 'ACTION');
      modifyInstanceMutation.mutate({ instanceId: instance.id, config: { url: newUrl } });
    }
  }
  
  const masterLogLevelDisplay = activeApiConfig?.masterDefaultLogLevel && activeApiConfig.masterDefaultLogLevel !== 'master'
    ? activeApiConfig.masterDefaultLogLevel.toUpperCase()
    : '主控配置';

  const masterTlsModeDisplay = activeApiConfig?.masterDefaultTlsMode && activeApiConfig.masterDefaultTlsMode !== 'master'
    ? MASTER_TLS_MODE_DISPLAY_MAP[activeApiConfig.masterDefaultTlsMode]
    : '主控配置';

  if (!instance) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center font-title">
            <Pencil className="mr-2 h-6 w-6 text-primary" />
            修改实例配置
          </DialogTitle>
          <DialogDescription className="font-sans">
            编辑实例 <span className="font-semibold font-mono">{instance.id.substring(0,12)}...</span> (主控: {apiName || 'N/A'})。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="instanceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">实例类型 (只读)</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value} 
                    disabled 
                  >
                    <FormControl>
                      <SelectTrigger className="text-sm font-sans">
                        <SelectValue placeholder="选择实例类型" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="出口(s)" className="font-sans">出口(s)</SelectItem>
                      <SelectItem value="入口(c)" className="font-sans">入口(c)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription className="font-sans text-xs">实例类型创建后不可更改。</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tunnelAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">隧道地址 (控制通道)</FormLabel>
                  <FormControl>
                    <Input
                      className="text-sm font-mono"
                      placeholder={instanceType === "出口(s)" ? "监听地址 (例: 0.0.0.0:10101)" : "连接的出口(s)地址 (例: your.server.com:10101)"}
                      {...field}
                    />
                  </FormControl>
                   <FormDescription className="font-sans text-xs">
                    {instanceType === "出口(s)"
                      ? "出口(s)监听控制连接的地址。"
                      : "入口(c)连接的出口(s)控制通道地址。"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">目标地址 (业务数据)</FormLabel>
                  <FormControl>
                    <Input
                      className="text-sm font-mono"
                      placeholder={instanceType === "出口(s)" ? "转发地址 (例: 0.0.0.0:8080)" : "本地转发地址 (例: 127.0.0.1:8000)"}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="font-sans text-xs">
                    {instanceType === "出口(s)"
                      ? "出口(s)业务数据的目标地址。"
                      : "入口(c)转发业务流量至的本地服务地址。"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="logLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">日志级别</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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
                    选择“默认”将继承主控实际启动时应用的设置。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {instanceType === '出口(s)' && (
              <>
                <FormField
                  control={form.control}
                  name="tlsMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-sans">TLS 模式 (出口(s)数据通道)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "master"}>
                        <FormControl>
                          <SelectTrigger className="text-sm font-sans">
                            <SelectValue placeholder="选择TLS模式" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="master" className="font-sans">
                            默认 ({masterTlsModeDisplay})
                          </SelectItem>
                          <SelectItem value="0" className="font-sans">0: 无TLS (明文)</SelectItem>
                          <SelectItem value="1" className="font-sans">1: 自签名</SelectItem>
                          <SelectItem value="2" className="font-sans">2: 自定义</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="font-sans text-xs">
                        出口(s)数据通道的TLS加密模式。
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {tlsMode === '2' && (
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </>
            )}
             {instanceType === '入口(c)' && (
                <FormField
                  control={form.control}
                  name="tlsMode" // Retain for client, but it's informational.
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-sans">TLS 模式 (入口(c)连接行为)</FormLabel>
                       <Select onValueChange={field.onChange} value={field.value || "master"}>
                        <FormControl>
                          <SelectTrigger className="text-sm font-sans">
                            <SelectValue placeholder="选择TLS模式" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="master" className="font-sans">
                             默认 (根据出口(s)自动判断)
                          </SelectItem>
                          <SelectItem value="0" className="font-sans">0: 连接明文出口(s)</SelectItem>
                          <SelectItem value="1" className="font-sans">1: 连接自签名出口(s)</SelectItem>
                          <SelectItem value="2" className="font-sans">2: 连接自定义证书出口(s)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="font-sans text-xs">
                        入口(c)连接目标出口(s)时采用的TLS行为。通常保持默认。
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            )}
          </form>
        </Form>
        <DialogFooter className="pt-4 font-sans">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={modifyInstanceMutation.isPending}>
              取消
            </Button>
          </DialogClose>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={modifyInstanceMutation.isPending || !apiId || !apiRoot || !apiToken}>
            {modifyInstanceMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存更改'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

