"use client";

import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Node, CustomNodeData, MasterSubRole } from '../topologyTypes';
import { MASTER_TLS_MODE_DISPLAY_MAP } from '@/components/nodepass/create-instance-dialog/constants';
import { useApiConfig } from '@/hooks/use-api-key';

interface EditTopologyNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: Node | null;
  hasServerNodesInParentContainer: boolean;
  isInterMasterClientLink?: boolean;
  interMasterLinkSourceInfo?: {
    serverTunnelAddress: string;
  };
  onSave: (nodeId: string, updatedData: Partial<CustomNodeData>) => void;
}

const hostPortRegex = /^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/;
const hostPortErrorMsg = "Invalid address format (e.g., host:port or [ipv6]:port).";

const baseSchema = z.object({
  label: z.string().min(1, "Label cannot be empty."),
});

const masterSchema = baseSchema.extend({
  masterSubRoleM: z.enum(["container", "primary", "client-role", "server-role", "generic"]),
  targetAddressM: z.optional(z.string().regex(hostPortRegex, hostPortErrorMsg)),
  logLevelM: z.enum(["master", "debug", "info", "warn", "error", "event"]),
  tlsModeM: z.enum(["master", "0", "1", "2"]),
  remoteMasterIdForTunnel: z.optional(z.string()),
  remoteServerListenAddress: z.optional(z.string().regex(hostPortRegex, "Invalid remote server(s) listen address format (e.g., [::]:10101).")),
  remoteServerForwardAddress: z.optional(z.string().regex(hostPortRegex, "Invalid remote server(s) forward address format (e.g., 192.168.1.10:80).")),
});

const serverSchema = baseSchema.extend({
  tunnelAddressS: z.string().min(1, "Tunnel address cannot be empty.").regex(hostPortRegex, hostPortErrorMsg),
  targetAddressS: z.string().min(1, "Target address cannot be empty.").regex(hostPortRegex, hostPortErrorMsg),
  logLevelS: z.enum(["master", "debug", "info", "warn", "error", "event"]),
  tlsModeS: z.enum(["master", "0", "1", "2"]),
  certPathS: z.optional(z.string()),
  keyPathS: z.optional(z.string()),
  tunnelKeyS: z.string().optional(),
});

const clientSchema = z.object({
  label: z.string().min(1, "Label cannot be empty."),
  isSingleEndedForwardC: z.boolean().default(false),
  tunnelAddressC_Normal: z.optional(z.string()),
  localListenAddressC_Normal: z.optional(z.string()),
  localListenAddressC_Single: z.optional(z.string()),
  remoteTargetAddressC_Single: z.optional(z.string()),
  logLevelC: z.enum(["master", "debug", "info", "warn", "error", "event"]),
  tunnelKeyC: z.string().optional(),
  minPoolSizeC: z.coerce.number().int("Minimum connection pool must be an integer.").positive("Minimum connection pool must be positive.").optional().or(z.literal("").transform(() => undefined)),
  maxPoolSizeC: z.coerce.number().int("Maximum connection pool must be an integer.").positive("Maximum connection pool must be positive.").optional().or(z.literal("").transform(() => undefined)),
}).superRefine((data, ctx) => {
    const effectiveIsSingleEnded = data.isSingleEndedForwardC;

    if (effectiveIsSingleEnded) {
        if (!data.localListenAddressC_Single || !hostPortRegex.test(data.localListenAddressC_Single)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid local listen address (${hostPortErrorMsg}).`, path: ["localListenAddressC_Single"] });
        }
        if (!data.remoteTargetAddressC_Single || !hostPortRegex.test(data.remoteTargetAddressC_Single)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid target service address (${hostPortErrorMsg}).`, path: ["remoteTargetAddressC_Single"] });
        }
    } else {
        if (!data.tunnelAddressC_Normal || !hostPortRegex.test(data.tunnelAddressC_Normal)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid tunnel address (${hostPortErrorMsg}).`, path: ["tunnelAddressC_Normal"] });
        }
        if (data.localListenAddressC_Normal && data.localListenAddressC_Normal.trim() !== "" && !hostPortRegex.test(data.localListenAddressC_Normal)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid local listen address (${hostPortErrorMsg}).`, path: ["localListenAddressC_Normal"] });
        }
    }
    if (data.minPoolSizeC !== undefined && data.maxPoolSizeC !== undefined && data.minPoolSizeC >= data.maxPoolSizeC) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Minimum connection pool must be less than maximum connection pool.",
            path: ["minPoolSizeC"],
        });
    }
});


const tuSchema = baseSchema.extend({
  targetAddressTU: z.optional(z.string().regex(hostPortRegex, hostPortErrorMsg)),
});

type FormValues = z.infer<typeof masterSchema> | z.infer<typeof serverSchema> | z.infer<typeof clientSchema> | z.infer<typeof tuSchema>;

export function EditTopologyNodeDialog({
  open,
  onOpenChange,
  node,
  hasServerNodesInParentContainer,
  isInterMasterClientLink = false,
  interMasterLinkSourceInfo,
  onSave
}: EditTopologyNodeDialogProps) {
  const role = node?.data.role;
  const { apiConfigsList, activeApiConfig, getApiConfigById } = useApiConfig();

  const canClientBeSingleEnded = role === 'C' ? !hasServerNodesInParentContainer && !isInterMasterClientLink : false;

  const currentSchema = useMemo(() => {
    if (role === 'M') return masterSchema;
    if (role === 'S') return serverSchema;
    if (role === 'C') return clientSchema;
    return tuSchema;
  }, [role]);

  const otherApiConfigs = apiConfigsList.filter(c => c.id !== node?.data.masterId && c.id !== activeApiConfig?.id);

  const form = useForm<FormValues>({
    resolver: zodResolver(currentSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (node && open) {
      const data = node.data;
      let defaultVals: Partial<FormValues> = { label: data.label };

      if (role === 'M') {
        defaultVals = {
          ...defaultVals,
          masterSubRoleM: data.masterSubRole || "container",
          targetAddressM: data.targetAddress || "",
          logLevelM: (data.logLevel as any) || data.defaultLogLevel || "master",
          tlsModeM: (data.tlsMode as any) || data.defaultTlsMode || "master",
          remoteMasterIdForTunnel: data.remoteMasterIdForTunnel || "",
          remoteServerListenAddress: data.remoteServerListenAddress || "",
          remoteServerForwardAddress: data.remoteServerForwardAddress || "",
        };
      } else if (role === 'S') {
        defaultVals = {
          ...defaultVals,
          label: data.label,
          tunnelAddressS: data.tunnelAddress || "",
          targetAddressS: data.targetAddress || "",
          logLevelS: (data.logLevel as any) || "master",
          tlsModeS: (data.tlsMode as any) || "master",
          certPathS: data.certPath || "",
          keyPathS: data.keyPath || "",
          tunnelKeyS: data.tunnelKey || "",
        };
      } else if (role === 'C') {
        const isEffectivelySingleEndedForDefaults = canClientBeSingleEnded ? !!data.isSingleEndedForwardC : false;
        defaultVals = {
          ...defaultVals,
          label: data.label,
          isSingleEndedForwardC: isEffectivelySingleEndedForDefaults,
          logLevelC: (data.logLevel as any) || "master",
          tunnelKeyC: data.tunnelKey || "",
          minPoolSizeC: data.minPoolSize || undefined,
          maxPoolSizeC: data.maxPoolSize || undefined,
        };
        if (isEffectivelySingleEndedForDefaults) {
          (defaultVals as any).localListenAddressC_Single = data.tunnelAddress || "";
          (defaultVals as any).remoteTargetAddressC_Single = data.targetAddress || "";
        } else {
          if (isInterMasterClientLink && interMasterLinkSourceInfo) {
            (defaultVals as any).tunnelAddressC_Normal = interMasterLinkSourceInfo.serverTunnelAddress;
          } else {
            (defaultVals as any).tunnelAddressC_Normal = data.tunnelAddress || "";
          }
          (defaultVals as any).localListenAddressC_Normal = data.targetAddress || "";
        }
      } else if (role === 'T' || role === 'U') {
        defaultVals = { ...defaultVals, label: data.label, targetAddressTU: data.targetAddress || "" };
      }
      form.reset(defaultVals as any);
    }
  }, [node, open, form, role, hasServerNodesInParentContainer, isInterMasterClientLink, currentSchema, interMasterLinkSourceInfo, canClientBeSingleEnded]);

  const onSubmit = (values: FormValues) => {
    if (!node) return;
    let updatedData: Partial<CustomNodeData> = { label: values.label };

    if (role === 'M' && 'masterSubRoleM' in values) {
      updatedData = {
        ...updatedData,
        masterSubRole: values.masterSubRoleM as MasterSubRole,
        logLevel: values.logLevelM,
        tlsMode: values.tlsModeM,
      };
      if (values.masterSubRoleM === 'client-role') {
        updatedData.targetAddress = values.targetAddressM;
        updatedData.remoteMasterIdForTunnel = values.remoteMasterIdForTunnel;
        updatedData.remoteServerListenAddress = values.remoteServerListenAddress;
        updatedData.remoteServerForwardAddress = values.remoteServerForwardAddress;
      } else {
        updatedData.targetAddress = "";
        updatedData.remoteMasterIdForTunnel = "";
        updatedData.remoteServerListenAddress = "";
        updatedData.remoteServerForwardAddress = "";
      }
    } else if (role === 'S' && 'tunnelAddressS' in values) {
      updatedData = {
        ...updatedData,
        label: values.label,
        tunnelAddress: values.tunnelAddressS,
        targetAddress: values.targetAddressS,
        logLevel: values.logLevelS,
        tlsMode: values.tlsModeS,
        certPath: values.tlsModeS === "2" ? values.certPathS : "",
        keyPath: values.tlsModeS === "2" ? values.keyPathS : "",
        tunnelKey: values.tunnelKeyS?.trim() || undefined,
      };
    } else if (role === 'C' && 'logLevelC' in values) {
      const finalIsSingleEndedDataValue = canClientBeSingleEnded ? values.isSingleEndedForwardC : false;
      updatedData = {
        ...updatedData,
        label: values.label,
        isSingleEndedForwardC: finalIsSingleEndedDataValue,
        logLevel: values.logLevelC,
        tlsMode: finalIsSingleEndedDataValue ? "0" : values.tlsModeC || "master",
        certPath: (finalIsSingleEndedDataValue || values.tlsModeC !== '2') ? "" : values.certPathC,
        keyPath: (finalIsSingleEndedDataValue || values.tlsModeC !== '2') ? "" : values.keyPathC,
        tunnelKey: values.tunnelKeyC?.trim() || undefined,
        minPoolSize: values.minPoolSizeC,
        maxPoolSize: values.maxPoolSizeC,
      };
      if (finalIsSingleEndedDataValue) {
        updatedData.tunnelAddress = values.localListenAddressC_Single;
        updatedData.targetAddress = values.remoteTargetAddressC_Single;
      } else {
        updatedData.tunnelAddress = values.tunnelAddressC_Normal;
        updatedData.targetAddress = values.localListenAddressC_Normal;
      }
    } else if (role === 'T' && 'targetAddressTU' in values) {
      updatedData = { ...updatedData, label: values.label, targetAddress: values.targetAddressTU };
    } else if (role === 'U') {
      updatedData = { ...updatedData, label: values.label };
    }
    onSave(node.id, updatedData);
    onOpenChange(false);
  };

  if (!node) return null;
  const dialogTitle = role === 'M' ? "Edit Master Container"
    : role === 'S' ? "Edit Server"
    : role === 'C' ? "Edit Client"
    : role === 'T' ? "Edit Target Service"
    : "Edit User";
  const watchedMasterSubRole = role === 'M' ? form.watch('masterSubRoleM') : undefined;
  const renderClientAsSingleEnded = canClientBeSingleEnded ? form.watch('isSingleEndedForwardC') : false;
  const watchedServerTlsMode = role === 'S' ? form.watch('tlsModeS') : undefined;
  const watchedClientTlsMode = (role === 'C' && !renderClientAsSingleEnded) ? form.watch('tlsModeC') : undefined;


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-title">{dialogTitle}</DialogTitle>
          <DialogDescription className="font-sans">
            Modify configuration for node "{node.data.label}".
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">Label</FormLabel>
                  <FormControl><Input {...field} className="font-sans" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {role === 'M' && (
              <>
                <FormField control={form.control} name="masterSubRoleM" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">Master Canvas Role</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent>
                    <SelectItem value="container">Container (Advanced Topology Default)</SelectItem>
                    <SelectItem value="generic">Generic (Legacy/Basic)</SelectItem>
                    <SelectItem value="server-role">Server Host (Basic Topology)</SelectItem>
                    <SelectItem value="client-role">Client Host (Basic Topology - Defines Tunnel)</SelectItem>
                    <SelectItem value="primary">Primary (Basic Topology)</SelectItem>
                  </SelectContent></Select>
                  <FormDescription className="font-sans text-xs">Defines this master's behavior and connection semantics on the canvas.</FormDescription>
                  <FormMessage /></FormItem>)}
                />
                {watchedMasterSubRole === 'client-role' && (
                  <>
                    <FormField control={form.control} name="targetAddressM" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">Client Local Service Address</FormLabel><FormControl><Input {...field} placeholder="e.g., 127.0.0.1:8080" className="font-mono" /></FormControl>
                      <FormDescription className="font-sans text-xs">On this client host, the client(c) instance listens and forwards to the tunnel address.</FormDescription><FormMessage /></FormItem>)}
                    />
                    <FormField control={form.control} name="remoteMasterIdForTunnel" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">Remote Server(s) Master</FormLabel><Select onValueChange={field.onChange} value={field.value as string | undefined} disabled={otherApiConfigs.length === 0}><FormControl><SelectTrigger className="font-sans"><SelectValue placeholder={otherApiConfigs.length === 0 ? "No other masters available" : "Select master hosting server(s)"} /></SelectTrigger></FormControl><SelectContent>
                        {otherApiConfigs.map(config => (<SelectItem key={config.id} value={config.id}>{config.name}</SelectItem>))}
                      </SelectContent></Select>
                      <FormDescription className="font-sans text-xs">The server(s) part of the tunnel will be created on this master.</FormDescription><FormMessage /></FormItem>)}
                    />
                    <FormField control={form.control} name="remoteServerListenAddress" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">Remote Server(s) Listen Address</FormLabel><FormControl><Input {...field} placeholder="e.g., [::]:10101" className="font-mono" /></FormControl>
                      <FormDescription className="font-sans text-xs">Remote server(s) will listen on this address.</FormDescription><FormMessage /></FormItem>)}
                    />
                    <FormField control={form.control} name="remoteServerForwardAddress" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">Remote Server(s) Forward Address</FormLabel><FormControl><Input {...field} placeholder="e.g., 192.168.1.10:80" className="font-mono" /></FormControl>
                      <FormDescription className="font-sans text-xs">Remote server(s) will forward traffic to this business address.</FormDescription><FormMessage /></FormItem>)}
                    />
                  </>
                )}
                 <FormField control={form.control} name="logLevelM" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">Log Level</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="master">Master Default</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="event">Event</SelectItem></SelectContent></Select>
                   <FormDescription className="font-sans text-xs">Default log level for S/C nodes within this master.</FormDescription>
                  <FormMessage /></FormItem>)} />
                <FormField control={form.control} name="tlsModeM" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">TLS Mode</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent>{Object.entries(MASTER_TLS_MODE_DISPLAY_MAP).map(([val, lab]) => (<SelectItem key={val} value={val}>{lab}</SelectItem>))}</SelectContent></Select>
                  <FormDescription className="font-sans text-xs">Default TLS mode for S/C nodes within this master.</FormDescription>
                  <FormMessage /></FormItem>)} />
              </>
            )}

            {(role === 'S' || role === 'C') && (
               <FormField control={form.control} name={role === 'S' ? 'tunnelKeyS' : 'tunnelKeyC'} render={({ field }) => (
                <FormItem><FormLabel className="font-sans">Tunnel Key (Optional)</FormLabel><FormControl><Input {...field} placeholder="Default: Port-derived key" className="font-mono" /></FormControl>
                <FormDescription className="font-sans text-xs">Leave empty to use port-derived key.</FormDescription><FormMessage /></FormItem>)} />
            )}

            {role === 'S' && (
              <>
                <FormField control={form.control} name="tunnelAddressS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">Tunnel Address</FormLabel><FormControl><Input {...field} placeholder="e.g., [::]:10101 or 0.0.0.0:10101" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="targetAddressS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">Target Address</FormLabel><FormControl><Input {...field} placeholder="e.g., 192.168.1.10:80" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="logLevelS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">Log Level</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="master">Master Default</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="event">Event</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="tlsModeS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">TLS Mode</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent>{Object.entries(MASTER_TLS_MODE_DISPLAY_MAP).map(([val, lab]) => (<SelectItem key={val} value={val}>{lab}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                {watchedServerTlsMode === '2' && (<>
                  <FormField control={form.control} name="certPathS" render={({ field }) => (<FormItem><FormLabel className="font-sans">Certificate Path</FormLabel><FormControl><Input {...field} placeholder="/path/to/cert.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="keyPathS" render={({ field }) => (<FormItem><FormLabel className="font-sans">Key Path</FormLabel><FormControl><Input {...field} placeholder="/path/to/key.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                </>)}
              </>
            )}

            {role === 'C' && (
              <>
                {canClientBeSingleEnded ? (
                  <FormField
                    control={form.control}
                    name="isSingleEndedForwardC"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-2 space-y-0 rounded-md border p-2 shadow-sm">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} id="isSingleEndedForwardCheckbox" /></FormControl>
                        <div className="space-y-0.5 leading-none">
                          <FormLabel htmlFor="isSingleEndedForwardCheckbox" className="font-sans cursor-pointer text-sm">Single-ended Forwarding Mode</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="p-2 text-xs text-muted-foreground border rounded-md bg-muted/50 font-sans">
                    {hasServerNodesInParentContainer && !isInterMasterClientLink && "This client's (c) parent master container already has server(s) (s) nodes, so single-ended forwarding mode cannot be enabled."}
                    {isInterMasterClientLink && "This client (c) is connected to another master’s server(s) (s), functioning as a tunnel mode, so single-ended forwarding cannot be enabled."}
                  </div>
                )}
                {renderClientAsSingleEnded ? (
                  <>
                    <FormField control={form.control} name="localListenAddressC_Single" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">Listen Address</FormLabel><FormControl><Input {...field} placeholder="e.g., [::]:10101 or 127.0.0.1:10101" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="remoteTargetAddressC_Single" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">Target Address</FormLabel><FormControl><Input {...field} placeholder="e.g., remote.host:8000" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                  </>
                ) : (
                  <>
                    <FormField control={form.control} name="tunnelAddressC_Normal" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-sans">Tunnel Address</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g., server.example.com:10101"
                            className="font-mono"
                            disabled={isInterMasterClientLink && !!interMasterLinkSourceInfo?.serverTunnelAddress}
                          />
                        </FormControl>
                        {isInterMasterClientLink && !!interMasterLinkSourceInfo?.serverTunnelAddress && (
                          <FormDescription className="font-sans text-xs">
                            This address is automatically determined by cross-master connection.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="localListenAddressC_Normal" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">Local Listen Address</FormLabel><FormControl><Input {...field} placeholder="e.g., [::]:8080 or 127.0.0.1:8080" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                  </>
                )}
                <FormField control={form.control} name="logLevelC" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">Log Level</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="master">Master Default</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="event">Event</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                {!renderClientAsSingleEnded && (
                   <FormField control={form.control} name="tlsModeC" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">TLS Mode (When Connecting to Server)</FormLabel><Select onValueChange={field.onChange} value={(field.value as string) || 'master'}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent>{Object.entries(MASTER_TLS_MODE_DISPLAY_MAP).map(([val, lab]) => (<SelectItem key={val} value={val}>{lab}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                )}
                {watchedClientTlsMode === '2' && !renderClientAsSingleEnded && (
                  <>
                    <FormField control={form.control} name="certPathC" render={({ field }) => (<FormItem><FormLabel className="font-sans">Certificate Path (TLS 2)</FormLabel><FormControl><Input {...field} placeholder="/path/to/client-cert.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="keyPathC" render={({ field }) => (<FormItem><FormLabel className="font-sans">Key Path (TLS 2)</FormLabel><FormControl><Input {...field} placeholder="/path/to/client-key.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                  </>
                )}
                 <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="minPoolSizeC" render={({ field }) => (
                        <FormItem><FormLabel className="font-sans">Minimum Connection Pool</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} value={field.value ?? ""} placeholder="e.g., 64" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="maxPoolSizeC" render={({ field }) => (
                        <FormItem><FormLabel className="font-sans">Maximum Connection Pool</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} value={field.value ?? ""} placeholder="e.g., 8192" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                </div>
              </>
            )}

            {role === 'T' && (
              <FormField
                control={form.control}
                name="targetAddressTU"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-sans">Target Address</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g., 192.168.1.10:80" className="font-mono" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
             {role === 'U' && (
                <FormDescription className="font-sans text-xs">
                  User nodes currently only support label modification.
                </FormDescription>
            )}
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}