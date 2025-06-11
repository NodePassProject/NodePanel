
"use client";

import React from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Cog, MoreVertical, RefreshCw, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { parseNodePassUrl, extractHostname, isWildcardHostname } from '@/lib/url-utils';

interface MasterPaletteItemProps {
  config: NamedApiConfig;
}

const MasterPaletteItem: React.FC<MasterPaletteItemProps> = ({ config }) => {
  const { getApiRootUrl, getToken } = useApiConfig();
  const { toast } = useToast();
  const queryClient = useQueryClient(); // Get query client for manual refetch if needed

  const { data: instanceCounts, isLoading: isLoadingInstances, error, refetch } = useQuery<
    { clientCount: number; tunnelCount: number },
    Error
  >({
    queryKey: ['masterInstancesCount', config.id],
    queryFn: async () => {
      const apiRoot = getApiRootUrl(config.id);
      const token = getToken(config.id);
      if (!apiRoot || !token) {
        throw new Error(`API configuration for master ${config.name} is incomplete.`);
      }
      const fetchedInstances = await nodePassApi.getInstances(apiRoot, token);
      let clientCount = 0;
      let serverCount = 0;
      let externalClientConnections = 0;

      const masterApiHost = extractHostname(config.apiUrl);

      fetchedInstances.forEach(instance => {
        if (instance.id === '********') return;
        if (instance.type === 'client') {
          clientCount++;
          const parsedClientUrl = parseNodePassUrl(instance.url);
          if (parsedClientUrl.tunnelAddress) {
            const clientConnectsToHost = extractHostname(parsedClientUrl.tunnelAddress);
            
            if (clientConnectsToHost && masterApiHost && clientConnectsToHost.toLowerCase() !== masterApiHost.toLowerCase()) {
               let isExternal = true;
               for (const sInst of fetchedInstances) {
                   if (sInst.type === 'server') {
                       const parsedSUrl = parseNodePassUrl(sInst.url);
                       if (parsedSUrl.tunnelAddress) {
                           const serverListenHost = extractHostname(parsedSUrl.tunnelAddress);
                           const serverListenPort = parsedSUrl.tunnelAddress.split(':').pop();
                           const clientConnectsToPort = parsedClientUrl.tunnelAddress.split(':').pop();

                           if (clientConnectsToPort === serverListenPort && (serverListenHost === clientConnectsToHost || (isWildcardHostname(serverListenHost) && clientConnectsToHost === masterApiHost) )) {
                               isExternal = false;
                               break;
                           }
                       }
                   }
               }
               if (isExternal) {
                 externalClientConnections++;
               }
            }
          }
        } else if (instance.type === 'server') {
          serverCount++;
        }
      });
      const tunnelCount = serverCount + externalClientConnections;
      return { clientCount, tunnelCount };
    },
    enabled: !!config.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    onError: (err) => {
        toast({
            title: `获取主控 ${config.name} 实例计数失败`,
            description: err.message,
            variant: "destructive"
        })
    }
  });

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, masterConfig: NamedApiConfig) => {
    event.dataTransfer.setData('application/nodepass-master-config', JSON.stringify(masterConfig));
    event.dataTransfer.effectAllowed = 'move';
  };

  const countsDisplay = isLoadingInstances
    ? <Loader2 className="h-3 w-3 animate-spin ml-1" />
    : error
    ? <RefreshCw className="h-3 w-3 ml-1 text-destructive cursor-pointer" onClick={() => refetch()} title="点击重试计数"/>
    : instanceCounts
    ? `(${instanceCounts.clientCount}c/${instanceCounts.tunnelCount}t)`
    : '';


  return (
    <div
      draggable={true}
      onDragStart={(event) => handleDragStart(event, config)}
      className="group flex items-center justify-between p-2 border rounded-md bg-card text-card-foreground hover:bg-muted/50 cursor-grab active:cursor-grabbing transition-colors text-xs font-sans shadow-sm"
      title={`拖拽主控 "${config.name}" 到画布`}
    >
      <div className="flex items-center truncate">
        <Cog className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
        <span className="truncate mr-1">{config.name}</span>
        {config.id && <span className="text-muted-foreground text-[10px]">{countsDisplay}</span>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-50 group-hover:opacity-100">
            <MoreVertical className="h-3.5 w-3.5" />
            <span className="sr-only">主控操作</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="font-sans text-xs">
           {/* Item removed from here, will be a global button */}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};


export function MastersPalette() {
  const { apiConfigsList, isLoading } = useApiConfig();

  return (
    <div className="h-full">
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : apiConfigsList.length === 0 ? (
        <p className="text-xs text-muted-foreground font-sans text-center">未配置任何主控。</p>
      ) : (
        <div className="space-y-2">
          {apiConfigsList.map((config) => (
            <MasterPaletteItem
              key={config.id}
              config={config}
            />
          ))}
        </div>
      )}
    </div>
  );
}
    

    
