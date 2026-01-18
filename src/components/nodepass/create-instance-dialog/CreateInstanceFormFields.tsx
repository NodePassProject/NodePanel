"use client";

import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info, Settings2, Share2, Zap, Tag, KeyRound, Users, Minimize, Expand } from 'lucide-react';
import type { CreateInstanceFormValues } from '@/zod-schemas/nodepass';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { MASTER_TLS_MODE_DISPLAY_MAP } from './constants';

interface CreateInstanceFormFieldsProps {
  form: UseFormReturn<CreateInstanceFormValues>;
  instanceType: "Client" | "Server";
  tlsMode?: string;
  isSingleEndedForward: boolean;
  activeApiConfig: NamedApiConfig | null;
  apiConfigsList: NamedApiConfig[];
  serverInstancesForDropdown: undefined; // This prop is no longer used
  isLoadingServerInstances: false; // This prop is no longer used
  externalApiSuggestion: string | null;
  onSubmitHandler: (values: CreateInstanceFormValues) => void;
  showDetailedDescriptions: boolean; // Prop kept for signature but effectively unused
}

export function CreateInstanceFormFields({
  form,
  instanceType,
  tlsMode,
  isSingleEndedForward,
  activeApiConfig,
  externalApiSuggestion,
  onSubmitHandler,
  // showDetailedDescriptions, // Parameter is effectively unused now
}: CreateInstanceFormFieldsProps) {

  const masterLogLevelDisplay = activeApiConfig?.masterDefaultLogLevel && activeApiConfig.masterDefaultLogLevel !== 'master'
    ? activeApiConfig.masterDefaultLogLevel.charAt(0).toUpperCase() + activeApiConfig.masterDefaultLogLevel.slice(1)
    : 'Master Config';

  const effectiveTlsModeDisplay = activeApiConfig?.masterDefaultTlsMode && activeApiConfig.masterDefaultTlsMode !== 'master'
    ? MASTER_TLS_MODE_DISPLAY_MAP[activeApiConfig.masterDefaultTlsMode as keyof typeof MASTER_TLS_MODE_DISPLAY_MAP] || 'Master Config'
    : 'Master Config';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmitHandler)} className="space-y-3 py-1 max-h-[calc(65vh-50px)] overflow-y-auto pr-2" id="create-instance-form">
        <FormField
          control={form.control}
          name="instanceType"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="font-sans text-xs">Instance Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="text-xs font-sans h-9">
                    <SelectValue placeholder="Select Instance Type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Client" className="font-sans text-xs">Client</SelectItem>
                  <SelectItem value="Server" className="font-sans text-xs">Server</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="alias"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="font-sans text-xs flex items-center">
                <Tag size={14} className="mr-1 text-muted-foreground" />
                Instance Alias (Optional)
              </FormLabel>
              <FormControl>
                <Input
                  className="text-xs font-sans h-9"
                  placeholder="e.g.: My Test Service"
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        {!(instanceType === 'Client' && isSingleEndedForward) && (
            <FormField
            control={form.control}
            name="tunnelKey"
            render={({ field }) => (
                <FormItem className="space-y-1">
                <FormLabel className="font-sans text-xs flex items-center">
                    <KeyRound size={14} className="mr-1 text-muted-foreground" />
                    Tunnel Key (Optional)
                </FormLabel>
                <FormControl>
                    <Input
                    className="text-xs font-sans h-9"
                    placeholder="Leave empty to use port-derived key"
                    {...field}
                    value={field.value || ""}
                    />
                </FormControl>
                <FormMessage className="text-xs" />
                </FormItem>
            )}
            />
        )}


        {instanceType === 'Client' && (
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
                    Single-ended Forward Mode
                  </FormLabel>
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
                {instanceType === 'Server' ? 'Tunnel Address' :
                 (isSingleEndedForward ? 'Listening Address' :
                   'Tunnel Address'
                 )}
              </FormLabel>
              <FormControl>
                <Input
                  className="text-xs font-mono h-9"
                  placeholder={
                    instanceType === "Server"
                      ? "e.g.: 0.0.0.0:10101"
                      : (isSingleEndedForward
                          ? "e.g.: 127.0.0.1:8080"
                          : "e.g.: 10.0.0.2:10101")
                  }
                  {...field}
                />
              </FormControl>
              {externalApiSuggestion && instanceType === 'Client' && !isSingleEndedForward && (
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
                {instanceType === 'Server' ? 'Target Address' :
                 (isSingleEndedForward ? 'Target Address' : 'Target Address')}
              </FormLabel>
              <FormControl>
                <Input
                  className="text-xs font-mono h-9"
                  placeholder={
                      instanceType === 'Server' ? "e.g.: 10.0.0.5:3000" :
                      (isSingleEndedForward ? "e.g.: remote.service.com:3000" : "e.g.: 8000 (Default is server tunnel port +1)")
                  }
                  {...field}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        {instanceType === 'Client' && (
            <div className="grid grid-cols-2 gap-3">
                <FormField
                control={form.control}
                name="minPoolSize"
                render={({ field }) => (
                    <FormItem className="space-y-1">
                    <FormLabel className="font-sans text-xs flex items-center">
                        <Minimize size={14} className="mr-1 text-muted-foreground" />
                        Minimum Connection Pool (Optional)
                    </FormLabel>
                    <FormControl>
                        <Input
                        type="number"
                        className="text-xs font-mono h-9"
                        placeholder="Default: 64"
                        {...field}
                        onChange={event => field.onChange(event.target.value === '' ? undefined : +event.target.value)}
                        value={field.value ?? ""}
                        />
                    </FormControl>
                    <FormMessage className="text-xs" />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="maxPoolSize"
                render={({ field }) => (
                    <FormItem className="space-y-1">
                    <FormLabel className="font-sans text-xs flex items-center">
                        <Expand size={14} className="mr-1 text-muted-foreground" />
                        Maximum Connection Pool (Optional)
                    </FormLabel>
                    <FormControl>
                        <Input
                        type="number"
                        className="text-xs font-mono h-9"
                        placeholder="Default: 8192"
                        {...field}
                        onChange={event => field.onChange(event.target.value === '' ? undefined : +event.target.value)}
                        value={field.value ?? ""}
                        />
                    </FormControl>
                    <FormMessage className="text-xs" />
                    </FormItem>
                )}
                />
            </div>
        )}


        <FormField
          control={form.control}
          name="logLevel"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="font-sans text-xs">Log Level</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="text-xs font-sans h-9">
                    <SelectValue placeholder="Select Log Level" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="master" className="font-sans text-xs">Default (Master Config)</SelectItem>
                  <SelectItem value="debug" className="font-sans text-xs">Debug</SelectItem>
                  <SelectItem value="info" className="font-sans text-xs">Info</SelectItem>
                  <SelectItem value="warn" className="font-sans text-xs">Warn</SelectItem>
                  <SelectItem value="error" className="font-sans text-xs">Error</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        {(instanceType === 'Server' || (instanceType === 'Client' && !isSingleEndedForward)) && (
          <>
            <FormField
              control={form.control}
              name="tlsMode"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="font-sans text-xs">
                    {instanceType === 'Server' ? "TLS Mode"
                      : "TLS Mode"}
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "master"}>
                    <FormControl>
                      <SelectTrigger className="text-xs font-sans h-9">
                        <SelectValue placeholder="Select TLS Mode" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="master" className="font-sans text-xs">
                        Default ({effectiveTlsModeDisplay})
                      </SelectItem>
                      <SelectItem value="0" className="font-sans text-xs">0: No TLS (Plaintext)</SelectItem>
                      <SelectItem value="1" className="font-sans text-xs">1: Self-signed</SelectItem>
                      <SelectItem value="2" className="font-sans text-xs">2: Custom</SelectItem>
                    </SelectContent>
                  </Select>
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
                      <FormLabel className="font-sans text-xs">Certificate Path (TLS 2)</FormLabel>
                      <FormControl>
                        <Input
                          className="text-xs font-mono h-9"
                          placeholder="e.g.: /path/to/cert.pem"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="keyPath"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="font-sans text-xs">Key Path (TLS 2)</FormLabel>
                      <FormControl>
                        <Input
                          className="text-xs font-mono h-9"
                          placeholder="e.g.: /path/to/key.pem"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              </>
            )}
          </>
        )}
      </form>
    </Form>
  );
}