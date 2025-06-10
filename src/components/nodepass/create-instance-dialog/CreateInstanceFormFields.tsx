
"use client";

import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info, Settings2, Share2, Zap } from 'lucide-react';
import type { CreateInstanceFormValues } from '@/zod-schemas/nodepass';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { MASTER_TLS_MODE_DISPLAY_MAP } from './constants';

interface CreateInstanceFormFieldsProps {
  form: UseFormReturn<CreateInstanceFormValues>;
  instanceType: "客户端" | "服务端";
  tlsMode?: string;
  isSingleEndedForward: boolean;
  activeApiConfig: NamedApiConfig | null;
  apiConfigsList: NamedApiConfig[];
  serverInstancesForDropdown: undefined; // This prop is no longer used
  isLoadingServerInstances: false; // This prop is no longer used
  externalApiSuggestion: string | null;
  onSubmitHandler: (values: CreateInstanceFormValues) => void;
  showDetailedDescriptions: boolean;
}

export function CreateInstanceFormFields({
  form,
  instanceType,
  tlsMode,
  isSingleEndedForward,
  activeApiConfig,
  externalApiSuggestion,
  onSubmitHandler,
  showDetailedDescriptions,
}: CreateInstanceFormFieldsProps) {

  const masterLogLevelDisplay = activeApiConfig?.masterDefaultLogLevel && activeApiConfig.masterDefaultLogLevel !== 'master'
    ? activeApiConfig.masterDefaultLogLevel.charAt(0).toUpperCase() + activeApiConfig.masterDefaultLogLevel.slice(1)
    : '主控配置';

  const effectiveTlsModeDisplay = activeApiConfig?.masterDefaultTlsMode && activeApiConfig.masterDefaultTlsMode !== 'master'
    ? MASTER_TLS_MODE_DISPLAY_MAP[activeApiConfig.masterDefaultTlsMode as keyof typeof MASTER_TLS_MODE_DISPLAY_MAP] || '主控配置'
    : '主控配置';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmitHandler)} className="space-y-3 py-1 max-h-[calc(65vh-50px)] overflow-y-auto pr-2" id="create-instance-form">
        <FormField
          control={form.control}
          name="instanceType"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="font-sans text-xs">实例类型</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="text-xs font-sans h-9">
                    <SelectValue placeholder="选择实例类型" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="客户端" className="font-sans text-xs">客户端</SelectItem>
                  <SelectItem value="服务端" className="font-sans text-xs">服务端</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        {instanceType === '客户端' && (
          <FormField
            control={form.control}
            name="isSingleEndedForward"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-2 space-y-0 rounded-md border p-2 shadow-sm bg-muted/30">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    id="isSingleEndedForwardCheckbox"
                    className="h-3.5 w-3.5"
                  />
                </FormControl>
                <div className="space-y-0.5 leading-none">
                  <FormLabel htmlFor="isSingleEndedForwardCheckbox" className="font-sans cursor-pointer text-xs flex items-center">
                    <Zap size={13} className="mr-1 text-yellow-500" />
                    单端转发模式
                  </FormLabel>
                  {showDetailedDescriptions && (
                    <FormDescription className="font-sans text-xs mt-0.5">
                      启用后，仅需配置本地监听地址和远程目标转发地址。
                    </FormDescription>
                  )}
                </div>
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="tunnelAddress"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="font-sans text-xs flex items-center">
                 <Settings2 size={14} className="mr-1 text-muted-foreground" />
                {instanceType === '服务端' ? '隧道地址' :
                 (isSingleEndedForward ? '监听地址 (客户端)' :
                   '连接的服务端隧道地址'
                 )}
              </FormLabel>
              <FormControl>
                <Input
                  className="text-xs font-mono h-9"
                  placeholder={
                    instanceType === "服务端"
                      ? "例: 0.0.0.0:10101"
                      : (isSingleEndedForward
                          ? "例: 127.0.0.1:8080"
                          : "例: your.server.com:10101")
                  }
                  {...field}
                />
              </FormControl>
               {showDetailedDescriptions && (
                <FormDescription className="font-sans text-xs mt-0.5">
                  {instanceType === "服务端"
                    ? "服务端在此地址监听控制连接。"
                    : (isSingleEndedForward
                        ? "客户端在此本地地址 (IP:端口) 监听传入连接。"
                        : "客户端连接此服务端地址的控制通道.")}
                </FormDescription>
               )}
              {externalApiSuggestion && showDetailedDescriptions && instanceType === '客户端' && !isSingleEndedForward && (
                <FormDescription className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 font-sans">
                  <Info size={12} className="inline-block mr-1 align-text-bottom" />
                  {externalApiSuggestion}
                </FormDescription>
              )}
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="targetAddress"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="font-sans text-xs flex items-center">
                <Share2 size={14} className="mr-1 text-muted-foreground" />
                {instanceType === '服务端' ? '目标地址' :
                 (isSingleEndedForward ? '目标地址' : '客户端本地转发端口 (可选)')}
              </FormLabel>
              <FormControl>
                <Input
                  className="text-xs font-mono h-9"
                  placeholder={
                      instanceType === '服务端' ? "例: 10.0.0.5:3000" :
                      (isSingleEndedForward ? "例: remote.service.com:3000" : "例: 8000 (默认为服务端隧道端口+1)")
                  }
                  {...field}
                />
              </FormControl>
              {showDetailedDescriptions && (
                <FormDescription className="font-sans text-xs mt-0.5">
                  {instanceType === "服务端"
                    ? "服务端将业务数据转发到此地址。"
                    : (isSingleEndedForward
                        ? "客户端将流量转发到的远程目标服务地址。"
                        : "客户端将流量转发到的本地服务端口 (主机固定为 [::])。若留空，将使用 (服务端隧道端口+1) 自动生成。")}
                </FormDescription>
              )}
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="logLevel"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="font-sans text-xs">日志级别</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="text-xs font-sans h-9">
                    <SelectValue placeholder="选择日志级别" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="debug" className="font-sans text-xs">Debug</SelectItem>
                  <SelectItem value="info" className="font-sans text-xs">Info</SelectItem>
                  <SelectItem value="warn" className="font-sans text-xs">Warn</SelectItem>
                  <SelectItem value="error" className="font-sans text-xs">Error</SelectItem>
                </SelectContent>
              </Select>
              {showDetailedDescriptions && (
                <FormDescription className="font-sans text-xs mt-0.5">
                  实例日志级别。如果主控自身配置了默认日志级别 (非"未指定")，则"主控配置"选项将使用该级别。
                </FormDescription>
              )}
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        {(instanceType === '服务端' || (instanceType === '客户端' && !isSingleEndedForward)) && (
          <>
            <FormField
              control={form.control}
              name="tlsMode"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="font-sans text-xs">
                    {instanceType === '服务端' ? "TLS 模式 (服务端数据通道)"
                      : "TLS 模式 (客户端连接服务端行为)"}
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "master"}>
                    <FormControl>
                      <SelectTrigger className="text-xs font-sans h-9">
                        <SelectValue placeholder="选择 TLS 模式" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="master" className="font-sans text-xs">
                        默认 ({effectiveTlsModeDisplay})
                      </SelectItem>
                      <SelectItem value="0" className="font-sans text-xs">0: 无TLS (明文)</SelectItem>
                      <SelectItem value="1" className="font-sans text-xs">1: 自签名</SelectItem>
                      <SelectItem value="2" className="font-sans text-xs">2: 自定义</SelectItem>
                    </SelectContent>
                  </Select>
                  {showDetailedDescriptions && (
                    <FormDescription className="font-sans text-xs mt-0.5">
                      {instanceType === '服务端'
                        ? "服务端数据通道的TLS加密模式。"
                        : "客户端连接目标服务端的TLS行为。"}
                    </FormDescription>
                  )}
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            {tlsMode === '2' && (
              <>
                <FormField
                  control={form.control}
                  name="certPath"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="font-sans text-xs">证书路径 (TLS 2)</FormLabel>
                      <FormControl>
                        <Input
                          className="text-xs font-mono h-9"
                          placeholder="例: /path/to/cert.pem"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      {showDetailedDescriptions && (
                        <FormDescription className="font-sans text-xs mt-0.5">
                          {instanceType === '客户端' ? "用于客户端连接服务端 (mTLS)。" : "用于服务端数据通道。"}
                        </FormDescription>
                      )}
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="keyPath"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="font-sans text-xs">密钥路径 (TLS 2)</FormLabel>
                      <FormControl>
                        <Input
                          className="text-xs font-mono h-9"
                          placeholder="例: /path/to/key.pem"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      {showDetailedDescriptions && (
                        <FormDescription className="font-sans text-xs mt-0.5">
                         {instanceType === '客户端' ? "用于客户端连接服务端 (mTLS)。" : "用于服务端数据通道。"}
                        </FormDescription>
                      )}
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              </>
            )}
          </>
        )}
        {instanceType === '客户端' && isSingleEndedForward && showDetailedDescriptions && (
            <FormDescription className="font-sans text-xs mt-0.5">
                <Info size={12} className="inline-block mr-1 align-text-bottom" />
                单端转发模式下，客户端直接连接目标，不涉及连接NodePass服务端的TLS配置。
            </FormDescription>
        )}
      </form>
    </Form>
  );
}

    