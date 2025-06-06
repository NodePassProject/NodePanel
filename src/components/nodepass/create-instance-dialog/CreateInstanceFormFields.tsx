
"use client";

import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Info } from 'lucide-react';
import type { CreateInstanceFormValues } from '@/zod-schemas/nodepass';
import type { Instance } from '@/types/nodepass';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { MASTER_TLS_MODE_DISPLAY_MAP } from './constants';

interface CreateInstanceFormFieldsProps {
  form: UseFormReturn<CreateInstanceFormValues>;
  instanceType: 'server' | 'client';
  tlsMode?: string; // Watching form.watch("tlsMode")
  autoCreateServer: boolean; // Watching form.watch("autoCreateServer")
  activeApiConfig: NamedApiConfig | null;
  serverInstancesForDropdown: Array<{id: string, display: string, tunnelAddr: string}> | undefined;
  isLoadingServerInstances: boolean;
  externalApiSuggestion: string | null;
  onSubmitHandler: (values: CreateInstanceFormValues) => void; // Actual submit logic
}

export function CreateInstanceFormFields({
  form,
  instanceType,
  tlsMode,
  autoCreateServer,
  activeApiConfig,
  serverInstancesForDropdown,
  isLoadingServerInstances,
  externalApiSuggestion,
  onSubmitHandler,
}: CreateInstanceFormFieldsProps) {

  const masterLogLevelDisplay = activeApiConfig?.masterDefaultLogLevel && activeApiConfig.masterDefaultLogLevel !== 'master'
    ? activeApiConfig.masterDefaultLogLevel.toUpperCase()
    : '主控配置';
  
  const effectiveTlsModeDisplay = activeApiConfig?.masterDefaultTlsMode && activeApiConfig.masterDefaultTlsMode !== 'master'
    ? MASTER_TLS_MODE_DISPLAY_MAP[activeApiConfig.masterDefaultTlsMode as keyof typeof MASTER_TLS_MODE_DISPLAY_MAP] || '主控配置'
    : '主控配置';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmitHandler)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2" id="create-instance-form">
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
                    在当前主控下创建相应的服务端。客户端本地监听端口将使用服务端的隧道监听端口+1。
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
                    instanceType === "server" ? "例: 0.0.0.0:10101 或 [::]:10101" : 
                    (autoCreateServer ? "例: [::]:8080 或 your.host.com:8080" : "例: your.server.com:10101 或 [::]:10101")
                  } 
                  {...field}
                />
              </FormControl>
               <FormDescription className="font-sans text-xs">
                {instanceType === "server"
                  ? "服务端在此地址监听控制连接。"
                  : (autoCreateServer 
                      ? "自动创建的服务端将在此地址监听控制连接。"
                      : "客户端连接此服务端地址的控制通道。")}
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
        
        {(instanceType === 'server' || (instanceType === 'client' && autoCreateServer)) && (
          <FormField
            control={form.control}
            name="targetAddress"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-sans">
                  {instanceType === 'server' ? '服务端目标地址 (业务数据)' : '服务端转发目标地址 (业务数据)'}
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
                    ? "服务端业务数据的目标地址。"
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
                {instanceType === 'server' ? "TLS 模式 (服务端数据通道)" 
                  : (instanceType === 'client' && autoCreateServer ? "TLS 模式 (自动创建的服务端)" : "TLS 模式 (客户端连接行为)")}
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
                  <SelectItem value="1" className="font-sans">1: 自签名</SelectItem>
                  <SelectItem value="2" className="font-sans">2: 自定义</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription className="font-sans text-xs">
                {instanceType === 'server' 
                  ? "服务端数据通道的TLS加密模式。" 
                  : (autoCreateServer 
                      ? "应用于自动创建的服务端的数据通道的TLS模式。" 
                      : "客户端连接目标服务端时采用的TLS行为。若选 '2'，则服务端需提供自定义证书。")}
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
  );
}
