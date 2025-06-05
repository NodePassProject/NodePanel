
"use client";

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Cog, Network, ServerIcon, SmartphoneIcon, Globe, UserCircle2, ChevronDown, Loader2 } from 'lucide-react';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import type { DraggableNodeType, TopologyNodeData } from '../lib/topology-types';
import { getNodeIconColorClass, extractHostname } from '../lib/topology-utils';
import type { Instance } from '@/types/nodepass';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DraggablePanelsProps {
  apiConfigsList: NamedApiConfig[];
  onDragStartPanelItem: (
    event: React.DragEvent<HTMLDivElement>,
    nodeType: TopologyNodeData['type'],
    label?: string,
    apiId?: string,
    apiName?: string
  ) => void;
  instanceDataByApiId: Record<string, Instance[] | null | undefined>;
  isLoadingGlobalInstances: boolean;
  onSelectInstanceForTopologyRender: (instance: Instance, managingApiId: string) => void;
  onSelectMasterForFullTopologyRender: (apiId: string) => void; 
}

const nodePanelTypes: DraggableNodeType[] = [
    { type: 'server', title: '服务端', icon: ServerIcon },
    { type: 'client', title: '客户端', icon: SmartphoneIcon },
    { type: 'landing', title: '落地', icon: Globe },
    { type: 'user', title: '用户源 (暂未启用)', icon: UserCircle2, disabled: true },
];


export const DraggablePanels: React.FC<DraggablePanelsProps> = ({
  apiConfigsList,
  onDragStartPanelItem,
  instanceDataByApiId,
  isLoadingGlobalInstances,
  onSelectInstanceForTopologyRender,
  onSelectMasterForFullTopologyRender,
}) => {
  const isDraggingRef = useRef(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const getApproximateTunnelCount = (apiId: string): number => {
    const instances = instanceDataByApiId[apiId];
    if (!instances) return 0;
    return instances.filter(inst => {
      if (inst.type === 'client' && inst.id !== '********') {
        const fullUrl = inst.url.includes('://') ? inst.url : `http://${inst.url}`;
        try {
            const parsedUrl = new URL(fullUrl);
            const targetHostPath = parsedUrl.pathname.startsWith('/') ? parsedUrl.pathname.substring(1) : parsedUrl.pathname;
            const targetHost = extractHostname(targetHostPath);
            return targetHost && targetHost !== 'localhost' && targetHost !== '127.0.0.1';
        } catch (e) {
            const pathPart = fullUrl.substring(fullUrl.indexOf('://') + 3).split('/')[1];
            if (pathPart) {
                const targetHost = extractHostname(pathPart);
                 return targetHost && targetHost !== 'localhost' && targetHost !== '127.0.0.1';
            }
            return false;
        }
      }
      return false;
    }).length;
  };

  const handleDropdownOpenChange = (newOpenState: boolean, configId: string) => {
    if (newOpenState) {
      setOpenDropdownId(configId);
    } else {
      if (openDropdownId === configId) { // Only close if it's the currently open one
        setOpenDropdownId(null);
      }
    }
  };
  
  const handleDropdownItemSelect = () => {
    setOpenDropdownId(null); // Close dropdown after selecting an item
  };

  return (
    <div className="w-60 flex-shrink-0 space-y-2 flex flex-col">
      <Card className="shadow-sm flex-shrink-0">
        <CardHeader className="py-2 px-2.5">
          <CardTitle className="text-sm font-title flex items-center">
            <Cog className="mr-1.5 h-4 w-4 text-yellow-500" />已配置主控
          </CardTitle>
        </CardHeader>
        <CardContent className="p-1">
          <ScrollArea className="min-h-[8rem] max-h-[12rem]">
            <div className="space-y-0.5 p-0.5">
              {apiConfigsList.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-1 font-sans">无主控连接。</p>
              )}
              {apiConfigsList.map((config) => {
                const instancesForThisMaster = instanceDataByApiId[config.id];
                const instanceCount = instancesForThisMaster ? instancesForThisMaster.length : 0;
                const tunnelCount = getApproximateTunnelCount(config.id);
                const isLoadingThisMaster = isLoadingGlobalInstances && instancesForThisMaster === undefined;
                const loadFailedThisMaster = !isLoadingGlobalInstances && instancesForThisMaster === null;

                return (
                  <DropdownMenu 
                    key={config.id} 
                    open={openDropdownId === config.id} 
                    onOpenChange={(isOpen) => handleDropdownOpenChange(isOpen, config.id)}
                  >
                    <div 
                      className="flex items-center justify-between gap-1.5 p-1.5 border rounded hover:bg-muted/50 text-xs h-auto cursor-grab active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => {
                        isDraggingRef.current = true;
                        setOpenDropdownId(null); // Close dropdown on drag start
                        onDragStartPanelItem(e, 'controller', config.name, config.id, config.name);
                      }}
                      onDragEnd={() => {
                        setTimeout(() => { isDraggingRef.current = false; }, 0);
                      }}
                      title={`主控: ${config.name}\n拖拽添加至画布。点击右侧图标展开实例。`}
                    >
                        <div className="flex items-center gap-1.5 flex-grow overflow-hidden">
                            <Cog className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                            <span className="font-medium truncate font-sans flex-grow text-left">{config.name}</span>
                        </div>
                        <div className="flex items-center shrink-0">
                          {isLoadingThisMaster ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          ) : loadFailedThisMaster ? (
                            <span className="text-destructive text-[10px]">(失败)</span>
                          ) : (
                            <span className="text-muted-foreground text-[10px] mr-1">
                              ({instanceCount}实/{tunnelCount}隧)
                            </span>
                          )}
                          <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0"
                                onClick={(e) => {
                                    if (isDraggingRef.current) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        return;
                                    }
                                    setOpenDropdownId(prevId => prevId === config.id ? null : config.id);
                                }}
                                onMouseDown={(e) => e.stopPropagation()} // Prevent drag start when clicking chevron
                                aria-label="展开实例"
                            >
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                        </div>
                    </div>
                    <DropdownMenuContent className="w-56 font-sans max-h-72 overflow-y-auto">
                      <DropdownMenuLabel className="text-xs">主控: {config.name}</DropdownMenuLabel>
                      <DropdownMenuItem 
                        onSelect={() => { 
                          onSelectMasterForFullTopologyRender(config.id); 
                          handleDropdownItemSelect();
                        }} 
                        className="text-xs"
                      >
                        <Network className="mr-2 h-3.5 w-3.5" />
                        渲染完整拓扑
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {isLoadingThisMaster ? (
                        <DropdownMenuItem disabled className="text-xs flex items-center justify-center">
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> 加载实例中...
                        </DropdownMenuItem>
                      ) : loadFailedThisMaster ? (
                         <DropdownMenuItem disabled className="text-xs text-destructive">加载实例失败</DropdownMenuItem>
                      ) : instancesForThisMaster && instancesForThisMaster.length > 0 ? (
                        <>
                          <DropdownMenuLabel className="text-xs pt-1">选择实例渲染其链路</DropdownMenuLabel>
                          {instancesForThisMaster.map(inst => (
                            <DropdownMenuItem 
                              key={inst.id} 
                              onSelect={() => {
                                onSelectInstanceForTopologyRender(inst, config.id);
                                handleDropdownItemSelect();
                              }}
                              className="text-xs"
                            >
                              {inst.type === 'server' ? <ServerIcon className="mr-2 h-3.5 w-3.5 text-primary" /> : <SmartphoneIcon className="mr-2 h-3.5 w-3.5 text-accent" />}
                              <span className="truncate" title={inst.id}>{inst.id.substring(0, 12)}... ({inst.type})</span>
                            </DropdownMenuItem>
                          ))}
                        </>
                      ) : (
                        <DropdownMenuItem disabled className="text-xs">此主控下无实例</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="shadow-sm flex-shrink-0">
        <CardHeader className="py-2 px-2.5">
          <CardTitle className="text-sm font-title flex items-center">
            <Network className="mr-1.5 h-4 w-4 text-primary" />组件面板
          </CardTitle>
        </CardHeader>
        <CardContent className="p-1">
          <ScrollArea className="max-h-[15rem] min-h-[80px]">
            <div className="space-y-0.5 p-0.5">
              {nodePanelTypes.map(({ type, title, icon: Icon, disabled }) => (
                <div
                  key={type}
                  draggable={!disabled}
                  onDragStart={(e) => {
                    if (disabled) {
                      e.preventDefault();
                      return;
                    }
                    onDragStartPanelItem(e, type, title);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 p-1.5 border rounded hover:bg-muted/50 transition-colors text-xs",
                    disabled ? "opacity-50 cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
                  )}
                  title={disabled ? `${title} (不可用)` : `拖拽添加 "${title}"`}
                >
                  <Icon className={cn(
                      "h-3.5 w-3.5 shrink-0", 
                      disabled ? "text-muted-foreground" : getNodeIconColorClass(type)
                  )} />
                  <span className={cn("font-medium font-sans", disabled && "text-muted-foreground")}>{title}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
