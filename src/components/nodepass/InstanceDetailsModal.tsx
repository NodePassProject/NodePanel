
"use client";

import React,  { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { Instance } from '@/types/nodepass';
import { InstanceStatusBadge } from './InstanceStatusBadge';
import { ArrowDownCircle, ArrowUpCircle, ServerIcon, SmartphoneIcon, Fingerprint, Cable, KeyRound, Eye, EyeOff, ScrollText, Network } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getEventsUrl } from '@/lib/api';

interface InstanceDetailsModalProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiRoot: string | null;
  apiToken: string | null;
}

const MAX_LOG_LINES = 200; // Increased log lines
const RECONNECT_DELAY = 5000; // 5 seconds

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function stripAnsiCodes(str: string): string {
  if (typeof str !== 'string') return str;
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return str.replace(ansiRegex, '');
}


export function InstanceDetailsModal({ instance, open, onOpenChange, apiRoot, apiToken }: InstanceDetailsModalProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const { toast } = useToast();
  const [instanceLogs, setInstanceLogs] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connectToSse = useCallback(async () => {
    if (!instance || !apiRoot || !apiToken || !open || instance.id === '********') {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort("Starting new connection attempt");
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const eventsUrl = getEventsUrl(apiRoot);
    if (!eventsUrl) {
        console.error("Modal SSE: Invalid events URL derived from apiRoot", apiRoot);
        setInstanceLogs(prev => [`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] 事件流URL无效。`, ...prev.slice(0, MAX_LOG_LINES -1)]);
        return;
    }
    
    console.log(`Modal SSE: Attempting to connect to ${eventsUrl} for instance ${instance.id}`);

    try {
      const response = await fetch(eventsUrl, {
        method: 'GET',
        headers: { 
          'X-API-Key': apiToken, 
          'Accept': 'text/event-stream', 
          'Cache-Control': 'no-cache' 
        },
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP error ${response.status}`);
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      if (!response.body) {
        throw new Error("Response body is null.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (signal.aborted) break;
        const { value, done } = await reader.read();
        if (signal.aborted) break;
        
        if (done) {
          if (!signal.aborted) { // If not intentionally aborted
            console.log(`Modal SSE for ${instance.id}: Stream closed by server. Attempting to reconnect in ${RECONNECT_DELAY / 1000}s.`);
            setInstanceLogs(prev => [`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] 事件流已关闭，${RECONNECT_DELAY / 1000}秒后尝试重连...`, ...prev.slice(0, MAX_LOG_LINES -1)]);
            if (!signal.aborted) reconnectTimeoutRef.current = setTimeout(connectToSse, RECONNECT_DELAY);
          }
          break; // Break from the while(true) loop
        }

        buffer += decoder.decode(value, { stream: true });
        const messageBlocks = buffer.split('\n\n');
        buffer = messageBlocks.pop() || ''; // Last part might be an incomplete message

        for (const block of messageBlocks) {
          if (block.trim() === '') continue;

          let eventName = 'message'; // Default SSE event name
          let eventData = '';
          const messageLines = block.split('\n');

          for (const line of messageLines) {
            if (line.startsWith('event:')) {
              eventName = line.substring('event:'.length).trim();
            } else if (line.startsWith('data:')) {
              eventData += line.substring('data:'.length).trim(); // Concatenate if data is split over multiple lines, though JSON usually isn't
            }
          }

          if (eventName === 'instance' && eventData) {
            try {
              const jsonData = JSON.parse(eventData);
              const currentTime = new Date(jsonData.time || Date.now()).toLocaleTimeString('zh-CN', { hour12: false });

              if (jsonData.type === 'log' && jsonData.instance?.id === instance.id) {
                let rawLogData = jsonData.logs || '';
                if (typeof rawLogData === 'string') {
                  const cleanedLog = stripAnsiCodes(rawLogData);
                  setInstanceLogs(prevLogs => [`[${currentTime}] ${cleanedLog}`, ...prevLogs.slice(0, MAX_LOG_LINES - 1)]);
                }
              } else if (jsonData.type === 'shutdown') {
                setInstanceLogs(prevLogs => [`[${currentTime}] 主控服务已关闭事件流。`, ...prevLogs.slice(0, MAX_LOG_LINES - 1)]);
                if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
                    abortControllerRef.current.abort("Server shutdown event received");
                }
                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                    reconnectTimeoutRef.current = null;
                }
                return; // Exit the read loop, do not reconnect
              } else if (jsonData.type === 'initial') {
                  setInstanceLogs(prevLogs => [`[${currentTime}] 收到初始实例数据。`, ...prevLogs.slice(0, MAX_LOG_LINES - 1)]);
              } else if (jsonData.type === 'create' && jsonData.instance) {
                  setInstanceLogs(prevLogs => [`[${currentTime}] 实例已创建: ${jsonData.instance.id.substring(0,8)}...`, ...prevLogs.slice(0, MAX_LOG_LINES - 1)]);
              } else if (jsonData.type === 'update' && jsonData.instance) {
                  setInstanceLogs(prevLogs => [`[${currentTime}] 实例已更新: ${jsonData.instance.id.substring(0,8)}... 状态: ${jsonData.instance.status}`, ...prevLogs.slice(0, MAX_LOG_LINES - 1)]);
              } else if (jsonData.type === 'delete' && jsonData.instance) {
                  setInstanceLogs(prevLogs => [`[${currentTime}] 实例已删除: ${jsonData.instance.id.substring(0,8)}...`, ...prevLogs.slice(0, MAX_LOG_LINES - 1)]);
              }

            } catch (e) {
              console.error("Modal SSE: Error parsing JSON from 'instance' event data:", e, "Raw data:", eventData);
              setInstanceLogs(prev => [`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] 解析事件数据错误。`, ...prev.slice(0, MAX_LOG_LINES -1)]);
            }
          }
        }
      }
    } catch (error: any) {
      if (signal.aborted && error.name === 'AbortError') {
        console.log(`Modal SSE for ${instance.id}: Fetch aborted as expected.`);
      } else {
        console.error(`Modal SSE for ${instance.id}: Connection error: ${error.message}`, error);
        let displayError = error.message;
        if (error.message.toLowerCase().includes('failed to fetch') || error.message.toLowerCase().includes('networkerror')) {
            displayError = '网络错误。请检查连接或服务器CORS设置。';
        }
        setInstanceLogs(prev => [`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] 事件流连接错误: ${displayError} ${RECONNECT_DELAY / 1000}秒后尝试重连...`, ...prev.slice(0, MAX_LOG_LINES -1)]);
        if (!signal.aborted) {
          reconnectTimeoutRef.current = setTimeout(connectToSse, RECONNECT_DELAY);
        }
      }
    }
  }, [instance, apiRoot, apiToken, open]);


  useEffect(() => {
    if (open && instance && apiRoot && apiToken && instance.id !== '********') {
      setInstanceLogs([`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] 正在初始化实例日志流...`]);
      connectToSse();
    } else {
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort("Modal closed or instance invalid");
      }
      abortControllerRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if(instance?.id === '********' || !open || !instance){
        setInstanceLogs([]); // Clear logs if not supposed to connect
      }
    }

    return () => {
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort("Component unmounting or dependencies changed");
      }
      abortControllerRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [open, instance, apiRoot, apiToken, connectToSse]);


  useEffect(() => {
    if (open) {
      setShowApiKey(false);
    }
  }, [open, instance]);

  const handleCopyToClipboard = async (textToCopy: string, entity: string) => {
    if (!navigator.clipboard) {
      toast({ title: '复制失败', description: '浏览器不支持剪贴板。', variant: 'destructive' });
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast({ title: '复制成功', description: `${entity} 已复制到剪贴板。` });
    } catch (err) {
      toast({ title: '复制失败', description: `无法复制 ${entity}。`, variant: 'destructive' });
      console.error('复制失败: ', err);
    }
  };

  if (!instance) return null;
  const isApiKeyInstance = instance.id === '********';

  const detailItems = [
    { 
      label: "ID", 
      value: (
        <span 
          className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150"
          title={`点击复制: ${instance.id}`}
          onClick={() => handleCopyToClipboard(instance.id, "ID")}
        >
          {instance.id}
        </span>
      ), 
      icon: <Fingerprint className="h-4 w-4 text-muted-foreground" /> 
    },
    {
      label: "类型",
      value: isApiKeyInstance ? (
        <span className="flex items-center text-xs font-sans">
          <KeyRound className="h-4 w-4 mr-1.5 text-yellow-500" />
          API 密钥
        </span>
      ) : (
        <Badge
          variant={instance.type === 'server' ? 'default' : 'accent'}
          className="items-center whitespace-nowrap text-xs font-sans"
        >
          {instance.type === 'server' ? <ServerIcon size={12} className="mr-1" /> : <SmartphoneIcon size={12} className="mr-1" />}
          {instance.type === 'server' ? '服务端' : '客户端'}
        </Badge>
      ),
      icon: isApiKeyInstance ? <KeyRound className="h-4 w-4 text-muted-foreground" /> : (instance.type === 'server' ? <ServerIcon className="h-4 w-4 text-muted-foreground" /> : <SmartphoneIcon className="h-4 w-4 text-muted-foreground" />)
    },
    { 
      label: "状态", 
      value: isApiKeyInstance ? (
         <Badge variant="outline" className="border-yellow-500 text-yellow-600 whitespace-nowrap font-sans text-xs">
            <KeyRound className="mr-1 h-3.5 w-3.5" />
            监听中
          </Badge>
      ) : <InstanceStatusBadge status={instance.status} />, 
      icon: <Cable className="h-4 w-4 text-muted-foreground" /> 
    },
    { 
      label: isApiKeyInstance ? "API 密钥" : "URL", 
      value: (
        <div className="flex items-center justify-between w-full">
          <span 
            className={`font-mono text-xs break-all ${isApiKeyInstance ? 'flex-grow' : ''} cursor-pointer hover:text-primary transition-colors duration-150`}
            title={`点击复制: ${instance.url}`}
            onClick={() => handleCopyToClipboard(instance.url, isApiKeyInstance ? 'API 密钥' : 'URL')}
          >
            {isApiKeyInstance ? (showApiKey ? instance.url : '••••••••••••••••••••••••••••••••') : instance.url}
          </span>
          {isApiKeyInstance && (
            <button
              className="p-1 ml-2 rounded-md hover:bg-muted flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); setShowApiKey(!showApiKey);}}
              aria-label={showApiKey ? "隐藏密钥" : "显示密钥"}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
      ), 
      icon: <Network className="h-4 w-4 text-muted-foreground" />,
      fullWidth: true 
    },
    { 
      label: "TCP 流量 (接收/发送)", 
      value: (
        <span className="font-mono text-xs">
          <ArrowDownCircle className="inline-block h-3.5 w-3.5 mr-1 text-blue-500" />{formatBytes(instance.tcprx)}
          <span className="mx-1">/</span>
          <ArrowUpCircle className="inline-block h-3.5 w-3.5 mr-1 text-green-500" />{formatBytes(instance.tcptx)}
        </span>
      ), 
      icon: <Cable className="h-4 w-4 text-muted-foreground" /> 
    },
    { 
      label: "UDP 流量 (接收/发送)", 
      value: (
        <span className="font-mono text-xs">
          <ArrowDownCircle className="inline-block h-3.5 w-3.5 mr-1 text-blue-500" />{formatBytes(instance.udprx)}
          <span className="mx-1">/</span>
          <ArrowUpCircle className="inline-block h-3.5 w-3.5 mr-1 text-green-500" />{formatBytes(instance.udptx)}
        </span>
      ), 
      icon: <Cable className="h-4 w-4 text-muted-foreground" /> 
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-title">实例详情</DialogTitle>
          <DialogDescription className="font-sans">
            实例 <span 
                    className="font-semibold font-mono cursor-pointer hover:text-primary transition-colors duration-150"
                    title={`点击复制: ${instance.id}`}
                    onClick={() => handleCopyToClipboard(instance.id, "ID")}
                  >
                    {instance.id.substring(0,12)}...
                  </span> 详细信息。
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-3 overflow-y-auto pr-1">
          {detailItems.map((item, index) => (
            <div key={index} className={`flex ${item.fullWidth ? 'flex-col' : 'items-center justify-between'} py-2 border-b border-border/50 last:border-b-0`}>
              <div className="flex items-center">
                {item.icon && <span className="mr-2 shrink-0">{item.icon}</span>}
                <span className="text-sm font-medium text-muted-foreground font-sans shrink-0">{item.label}:</span>
              </div>
              <div className={`text-xs ${item.fullWidth ? 'mt-1 w-full' : 'ml-2 text-right break-all'}`}>{item.value}</div>
            </div>
          ))}
        </div>
        
        {!isApiKeyInstance && (
          <div className="mt-4 pt-4 border-t border-border/50 flex-shrink-0 flex flex-col min-h-0">
            <h3 className="text-md font-semibold mb-2 flex items-center font-title">
              <ScrollText size={18} className="mr-2 text-primary" />
              实例日志
            </h3>
            <ScrollArea className="h-48 w-full rounded-md border border-border/30 p-3 bg-muted/20 flex-grow">
              {instanceLogs.length === 0 && <p className="text-xs text-muted-foreground text-center py-2 font-sans">等待日志...</p>}
              {instanceLogs.map((log, index) => (
                <p key={index} className="text-xs font-mono py-0.5 whitespace-pre-wrap break-all">
                  {log}
                </p>
              ))}
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

