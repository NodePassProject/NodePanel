
"use client";

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Node, CustomNodeData } from '../page';
import { extractHostname, extractPort, formatHostForDisplay } from '@/lib/url-utils';
import { MASTER_TLS_MODE_DISPLAY_MAP } from '@/components/nodepass/create-instance-dialog/constants';

interface EditTopologyNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: Node | null;
  onSave: (nodeId: string, updatedData: Partial<CustomNodeData>) => void;
}

const baseSchema = z.object({
  label: z.string().min(1, "标签不能为空。"),
});

const serverSchema = baseSchema.extend({
  tunnelHost: z.string().min(1, "监听主机不能为空。").default("[::]"),
  tunnelPort: z.string().regex(/^[0-9]+$/, "端口必须是数字。").min(1, "监听端口不能为空。"),
  targetAddressS: z.string().min(1, "转发地址不能为空。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "转发地址格式无效 (例: host:port 或 [ipv6]:port)。"),
  logLevelS: z.enum(["master", "debug", "info", "warn", "error", "event"]),
  tlsModeS: z.enum(["master", "0", "1", "2"]),
  certPathS: z.optional(z.string()),
  keyPathS: z.optional(z.string()),
});

const clientSchema = baseSchema.extend({
  tunnelAddressC: z.string().min(1, "服务端隧道地址不能为空。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "服务端隧道地址格式无效 (例: host:port 或 [ipv6]:port)。"),
  localHostC: z.string().min(1, "本地监听主机不能为空。").default("[::]"),
  localPortC: z.string().regex(/^[0-9]+$/, "端口必须是数字。").min(1, "本地监听端口不能为空。"),
  logLevelC: z.enum(["master", "debug", "info", "warn", "error", "event"]),
});

const landingSchema = baseSchema.extend({
  ipAddressT: z.string().min(1, "IP地址不能为空。"),
  portT: z.string().regex(/^[0-9]+$/, "端口必须是数字。").min(1, "端口不能为空。"),
});

type FormValues = z.infer<typeof serverSchema> | z.infer<typeof clientSchema> | z.infer<typeof landingSchema>;


export function EditTopologyNodeDialog({ open, onOpenChange, node, onSave }: EditTopologyNodeDialogProps) {
  const role = node?.data.role;
  const currentSchema = role === 'S' ? serverSchema : role === 'C' ? clientSchema : landingSchema;

  const form = useForm<FormValues>({
    resolver: zodResolver(currentSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (node && open) {
      const data = node.data;
      let defaultVals: Partial<FormValues> = { label: data.label };

      if (role === 'S') {
        defaultVals = {
          ...defaultVals,
          tunnelHost: extractHostname(data.tunnelAddress || "[::]:0") || "[::]",
          tunnelPort: extractPort(data.tunnelAddress || "[::]:0") || "",
          targetAddressS: data.targetAddress || "",
          logLevelS: (data.logLevel as any) || "master",
          tlsModeS: (data.tlsMode as any) || "master",
          certPathS: data.certPath || "",
          keyPathS: data.keyPath || "",
        };
      } else if (role === 'C') {
        defaultVals = {
          ...defaultVals,
          tunnelAddressC: data.tunnelAddress || "",
          localHostC: extractHostname(data.targetAddress || "[::]:0") || "[::]",
          localPortC: extractPort(data.targetAddress || "[::]:0") || "",
          logLevelC: (data.logLevel as any) || "master",
        };
      } else if (role === 'T') {
        defaultVals = {
          ...defaultVals,
          ipAddressT: data.ipAddress || "",
          portT: data.port || "",
        };
      }
      form.reset(defaultVals);
    }
  }, [node, open, form, role]);

  const onSubmit = (values: FormValues) => {
    if (!node) return;
    let updatedData: Partial<CustomNodeData> = { label: values.label };

    if (role === 'S' && 'tunnelHost' in values) {
      updatedData = {
        ...updatedData,
        tunnelAddress: `${formatHostForDisplay(values.tunnelHost)}:${values.tunnelPort}`,
        targetAddress: values.targetAddressS,
        logLevel: values.logLevelS,
        tlsMode: values.tlsModeS,
        certPath: values.tlsModeS === "2" ? values.certPathS : "",
        keyPath: values.tlsModeS === "2" ? values.keyPathS : "",
      };
    } else if (role === 'C' && 'tunnelAddressC' in values) {
      updatedData = {
        ...updatedData,
        tunnelAddress: values.tunnelAddressC,
        targetAddress: `${formatHostForDisplay(values.localHostC)}:${values.localPortC}`,
        logLevel: values.logLevelC,
      };
    } else if (role === 'T' && 'ipAddressT' in values) {
      updatedData = {
        ...updatedData,
        ipAddress: values.ipAddressT,
        port: values.portT,
      };
    }
    onSave(node.id, updatedData);
    onOpenChange(false);
  };

  if (!node) return null;
  const dialogTitle = role === 'S' ? "编辑 出口(s) 属性" : role === 'C' ? "编辑 入口(c) 属性" : "编辑 落地端 属性";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-title">{dialogTitle}</DialogTitle>
          <DialogDescription className="font-sans">
            修改节点 "{node.data.label}" 的配置。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">标签</FormLabel>
                  <FormControl><Input {...field} className="font-sans" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {role === 'S' && (
              <>
                <FormField control={form.control} name="tunnelHost" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">隧道监听主机</FormLabel><FormControl><Input {...field} placeholder="例: [::] 或 0.0.0.0" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="tunnelPort" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">隧道监听端口</FormLabel><FormControl><Input {...field} placeholder="例: 10101" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="targetAddressS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">流量转发地址</FormLabel><FormControl><Input {...field} placeholder="例: 192.168.1.10:80" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="logLevelS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">日志级别</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="event">Event</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="tlsModeS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">TLS模式</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent>{Object.entries(MASTER_TLS_MODE_DISPLAY_MAP).map(([val, lab]) => (<SelectItem key={val} value={val}>{lab}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                {form.watch('tlsModeS') === '2' && (<>
                  <FormField control={form.control} name="certPathS" render={({ field }) => (<FormItem><FormLabel className="font-sans">证书路径 (TLS 2)</FormLabel><FormControl><Input {...field} placeholder="/path/to/cert.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="keyPathS" render={({ field }) => (<FormItem><FormLabel className="font-sans">密钥路径 (TLS 2)</FormLabel><FormControl><Input {...field} placeholder="/path/to/key.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                </>)}
              </>
            )}

            {role === 'C' && (
              <>
                <FormField control={form.control} name="tunnelAddressC" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">服务端隧道地址</FormLabel><FormControl><Input {...field} placeholder="例: server.example.com:10101" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="localHostC" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">本地监听主机</FormLabel><FormControl><Input {...field} placeholder="例: [::] 或 127.0.0.1" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="localPortC" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">本地监听端口</FormLabel><FormControl><Input {...field} placeholder="例: 8080 (默认为出口隧道端口+1)" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="logLevelC" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">日志级别</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="event">Event</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              </>
            )}

            {role === 'T' && (
              <>
                <FormField control={form.control} name="ipAddressT" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">IP 地址</FormLabel><FormControl><Input {...field} placeholder="例: 192.168.1.100" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="portT" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">端口</FormLabel><FormControl><Input {...field} placeholder="例: 80" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
              </>
            )}
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
              <Button type="submit">保存</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
