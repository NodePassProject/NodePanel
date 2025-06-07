
"use client";

import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Info, Network } from 'lucide-react';
import type { CreateInstanceFormValues } from '@/zod-schemas/nodepass';
// Instance type removed as not directly used here for type checking, form has it.
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { MASTER_TLS_MODE_DISPLAY_MAP } from './constants';

interface CreateInstanceFormFieldsProps {
  form: UseFormReturn<CreateInstanceFormValues>;
  instanceType: "入口(c)" | "出口(s)"; // Updated to use new terminology
  tlsMode?: string;
  autoCreateServer: boolean;
  activeApiConfig: NamedApiConfig | null;
  apiConfigsList: NamedApiConfig[];
  serverInstancesForDropdown: Array<{id: string, display: string, tunnelAddr: string, masterName: string}> | undefined;
  isLoadingServerInstances: boolean;
  externalApiSuggestion: string | null;
  onSubmitHandler: (values: CreateInstanceFormValues) => void;
}

export function CreateInstanceFormFields({
  form,
  instanceType,
  tlsMode,
  autoCreateServer,
  activeApiConfig,
  apiConfigsList,
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
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="text-sm font-sans">
                    <SelectValue placeholder="选择实例类型" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="入口(c)" className="font-sans">入口(c)</SelectItem>
                  <SelectItem value="出口(s)" className="font-sans">出口(s)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {instanceType === '入口(c)' && (
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
                    自动创建匹配的出口(s)
                  </FormLabel>
                  <FormDescription className="font-sans text-xs">
                    在选定主控下创建相应出口(s)。入口(c)本地监听端口将使用出口(s)隧道监听端口+1。
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        )}

        {instanceType === '入口(c)' && autoCreateServer && (
          <FormField
            control={form.control}
            name="serverApiId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-sans flex items-center">
                  <Network size={16} className="mr-1.5 text-primary" />
                  出口(s)所属主控
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value || activeApiConfig?.id || ""}
                >
                  <FormControl>
                    <SelectTrigger className="text-sm font-sans">
                      <SelectValue placeholder="选择出口(s)将创建于哪个主控" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {apiConfigsList.map(config => (
                      <SelectItem key={config.id} value={config.id} className="font-sans">
                        {config.name} {config.id === activeApiConfig?.id ? "(当前入口(c)主控)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription className="font-sans text-xs">
                  选择自动创建的出口(s)实例将归属于哪个主控。
                </FormDescription>
                <FormMessage />
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
                {instanceType === '出口(s)' ? '出口(s)隧道监听地址 (控制通道)' :
                 (autoCreateServer ? '出口(s)隧道监听地址 (控制通道)' : '连接的出口(s)隧道地址 (控制通道)')}
              </FormLabel>
              <FormControl>
                <Input
                  className="text-sm font-mono"
                  placeholder={
                    instanceType === "出口(s)" ? "例: 0.0.0.0:10101 或 [::]:10101" :
                    (autoCreateServer ? "例: [::]:8080 或 your.host.com:8080" : "例: your.server.com:10101")
                  }
                  {...field}
                />
              </FormControl>
               <FormDescription className="font-sans text-xs">
                {instanceType === "出口(s)"
                  ? "出口(s)在此地址监听控制连接。"
                  : (autoCreateServer
                      ? "自动创建的出口(s)将在此地址监听。"
                      : "入口(c)连接此出口(s)地址的控制通道。")}
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

        {instanceType === '入口(c)' && !autoCreateServer && (
          <FormItem>
            <FormLabel className="font-sans">或从其他主控的现有出口(s)选择隧道</FormLabel>
            <Select
              onValueChange={(selectedServerId) => { // selectedServerId here is actually the instance ID
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
                    isLoadingServerInstances ? "加载出口(s)中..." :
                    (!serverInstancesForDropdown || serverInstancesForDropdown.length === 0) ? "无其他主控的可用出口(s)" : "选择出口(s)隧道"
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
                <FormDescription className="font-sans text-xs">在其他主控下无可用出口(s)实例供选择。</FormDescription>
            )}
          </FormItem>
        )}

        {(instanceType === '出口(s)' || (instanceType === '入口(c)' && autoCreateServer)) && (
          <FormField
            control={form.control}
            name="targetAddress"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-sans">
                  {instanceType === '出口(s)' ? '出口(s)目标地址 (业务数据)' : '出口(s)转发目标地址 (业务数据)'}
                </FormLabel>
                <FormControl>
                  <Input
                    className="text-sm font-mono"
                    placeholder={
                      instanceType === "出口(s)" ? "例: 0.0.0.0:8080 或 10.0.0.5:3000" :
                      (autoCreateServer ? "例: 192.168.1.100:80" : "")
                    }
                    {...field}
                  />
                </FormControl>
                <FormDescription className="font-sans text-xs">
                  {instanceType === "出口(s)"
                    ? "出口(s)业务数据的目标地址。"
                    : (autoCreateServer
                        ? "自动创建的出口(s)将业务流量转发到此目标。"
                        : "")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        
        {/* Target address for client type when NOT auto-creating server (OPTIONAL) */}
        {instanceType === '入口(c)' && !autoCreateServer && (
           <FormField
            control={form.control}
            name="targetAddress"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-sans">入口(c)本地转发地址 (可选)</FormLabel>
                <FormControl>
                  <Input
                    className="text-sm font-mono"
                    placeholder={"例: 127.0.0.1:8000 (默认为隧道端口+1)"}
                    {...field}
                  />
                </FormControl>
                <FormDescription className="font-sans text-xs">
                  入口(c)将流量转发到的本地服务地址。若留空，将使用连接的出口(s)隧道端口+1自动生成。
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
                实例日志级别。
                {autoCreateServer && instanceType === '入口(c)' && " 此设置亦用于自动创建的出口(s)。"}
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
                {instanceType === '出口(s)' ? "TLS 模式 (出口(s)数据通道)"
                  : (instanceType === '入口(c)' && autoCreateServer ? "TLS 模式 (自动创建的出口(s))" : "TLS 模式 (入口(c)连接行为)")}
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
                {instanceType === '出口(s)'
                  ? "出口(s)数据通道的TLS加密模式。"
                  : (autoCreateServer
                      ? "用于自动创建的出口(s)的数据通道。"
                      : "入口(c)连接目标出口(s)时的TLS行为。")}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {(instanceType === '出口(s)' || (instanceType === '入口(c)' && autoCreateServer)) && tlsMode === '2' && (
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
                    {instanceType === '入口(c)' && autoCreateServer ? "用于自动创建的出口(s)。" : ""}
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
                   {instanceType === '入口(c)' && autoCreateServer ? "用于自动创建的出口(s)。" : ""}
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

