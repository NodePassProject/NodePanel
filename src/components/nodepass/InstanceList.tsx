"use client";

import React, { useState, useMemo, useRef } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, Eye, Trash2, ServerIcon, SmartphoneIcon, Search, KeyRound, PlusCircle, CheckCircle, ArrowDown, ArrowUp, Tag, Pencil, MoreVertical, Play, Square, RotateCcw } from 'lucide-react';
import type { Instance, UpdateInstanceRequest } from '@/types/nodepass';
import { InstanceStatusBadge } from './InstanceStatusBadge';
import { DeleteInstanceDialog } from './DeleteInstanceDialog';
import { InstanceDetailsModal } from './InstanceDetailsModal';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import type { AppLogEntry } from './EventLog';
import { extractHostname, extractPort, parseNodePassUrl, isWildcardHostname, formatHostForDisplay } from '@/lib/url-utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { BulkDeleteInstancesDialog } from './BulkDeleteInstancesDialog';
import { useInstanceAliases } from '@/hooks/use-instance-aliases';
import { EditAliasDialog } from './EditAliasDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Separator } from '@/components/ui/separator';


function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

interface InstanceListProps {
  apiId: string | null;
  apiName: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  activeApiConfig: NamedApiConfig | null;
  apiConfigsList: NamedApiConfig[];
  onLog?: (message: string, type: AppLogEntry['type']) => void;
  onOpenCreateInstanceDialog: () => void;
}

export function InstanceList({ apiId, apiName, apiRoot, apiToken, activeApiConfig, apiConfigsList, onLog, onOpenCreateInstanceDialog }: InstanceListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setAlias, isLoadingAliases, removeAlias, aliases: allAliasesObject } = useInstanceAliases();
  const isMobile = useIsMobile();

  const [selectedInstanceForDetails, setSelectedInstanceForDetails] = useState<Instance | null>(null);
  const [selectedInstanceForDelete, setSelectedInstanceForDelete] = useState<Instance | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const [isEditAliasDialogOpen, setIsEditAliasDialogOpen] = useState(false);
  const [editingAliasContext, setEditingAliasContext] = useState<{ id: string; alias?: string } | null>(null);

  const [desktopSelectedInstanceIds, setDesktopSelectedInstanceIds] = useState(new Set<string>());


  const { data: instances, isLoading: isLoadingInstances, error: instancesError } = useQuery<Instance[], Error>({
    queryKey: ['instances', apiId],
    queryFn: () => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("Master control configuration is incomplete.");
      return nodePassApi.getInstances(apiRoot, apiToken);
    },
    enabled: !!apiId && !!apiRoot && !!apiToken,
    refetchInterval: 15000,
  });


  const updateInstanceMutation = useMutation({
    mutationFn: ({ instanceId, action }: { instanceId: string, action: UpdateInstanceRequest['action']}) => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("Master control configuration is incomplete.");
      return nodePassApi.updateInstance(instanceId, { action }, apiRoot, apiToken);
    },
    onSuccess: (data, variables) => {
      const actionTextMap = { start: 'Start', stop: 'Stop', restart: 'Restart' };
      const actionText = actionTextMap[variables.action] || variables.action;
      toast({
        title: `Instance Operation: ${actionText}`,
        description: `Instance ${data.id} status changed to ${data.status}.`,
      });
      onLog?.(`Instance ${data.id} ${actionText} successfully, status: ${data.status}`, 'SUCCESS');
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
    },
    onError: (error: any, variables) => {
      const actionTextMap = { start: 'Start', stop: 'Stop', restart: 'Restart' };
      const actionText = actionTextMap[variables.action] || variables.action;
      toast({
        title: 'Instance Operation Failed',
        description: `Instance ${variables.instanceId} ${actionText} failed: ${error.message || 'Unknown error.'}`,
        variant: 'destructive',
      });
      onLog?.(`Instance ${variables.instanceId} ${actionText} failed: ${error.message || 'Unknown error'}`, 'ERROR');
    },
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: (instanceId: string) => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("Master control configuration is incomplete.");
      return nodePassApi.deleteInstance(instanceId, apiRoot, apiToken);
    },
    onSuccess: (_, instanceId) => {
      toast({
        title: 'Instance Deleted',
        description: `Instance ${instanceId} has been deleted.`,
      });
      onLog?.(`Instance ${instanceId} has been deleted.`, 'SUCCESS');
      removeAlias(instanceId);
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']});
      setSelectedInstanceForDelete(null);
      setDesktopSelectedInstanceIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(instanceId);
        return newSet;
      });
    },
    onError: (error: any, instanceId) => {
      toast({
        title: 'Error Deleting Instance',
        description: `Failed to delete instance ${instanceId}: ${error.message || 'Unknown error.'}`,
        variant: 'destructive',
      });
       onLog?.(`Failed to delete instance ${instanceId}: ${error.message || 'Unknown error'}`, 'ERROR');
    },
  });

  const handleCopyToClipboard = async (textToCopy: string, entity: string) => {
    if (!navigator.clipboard) {
      toast({ title: 'Copy Failed', description: 'Browser does not support clipboard.', variant: 'destructive' });
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast({ title: 'Copy Successful', description: `${entity} copied to clipboard.` });
    } catch (err) {
      toast({ title: 'Copy Failed', description: `Unable to copy ${entity}.`, variant: 'destructive' });
      console.error('Copy failed: ', err);
    }
  };

  const filteredInstances = useMemo(() => {
    return instances?.filter(instance => {
      const instanceAlias = (instance.id !== '********' && !isLoadingAliases) ? allAliasesObject[instance.id] : '';
      return (
        instance.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (instanceAlias || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        instance.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (instance.id !== '********' && instance.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (instance.id === '********' && ('api key'.includes(searchTerm.toLowerCase()) || 'secret key'.includes(searchTerm.toLowerCase()) || (apiName && apiName.toLowerCase().includes(searchTerm.toLowerCase())) ))
      );
    });
  }, [instances, searchTerm, isLoadingAliases, allAliasesObject, apiName]);


  const deletableInstances = useMemo(() => filteredInstances?.filter(inst => inst.id !== '********') || [], [filteredInstances]);

  const apiKeyInstance = filteredInstances?.find(inst => inst.id === '********');
  const otherInstances = filteredInstances?.filter(inst => inst.id !== '********');


  const handleSelectAllInstances = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setDesktopSelectedInstanceIds(new Set(deletableInstances.map(inst => inst.id)));
    } else {
      setDesktopSelectedInstanceIds(new Set());
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (desktopSelectedInstanceIds.size === 0) return;
    setIsBulkDeleting(true);
    onLog?.(`Starting bulk delete of ${desktopSelectedInstanceIds.size} instances...`, 'ACTION');

    const results = await Promise.allSettled(
      Array.from(desktopSelectedInstanceIds).map(id => deleteInstanceMutation.mutateAsync(id))
    );

    let successCount = 0;
    let errorCount = 0;
    results.forEach(result => {
      if (result.status === 'fulfilled') successCount++;
      else errorCount++;
    });

    if (successCount > 0) {
      toast({ title: 'Bulk Delete Successful', description: `${successCount} instances deleted.` });
    }
    if (errorCount > 0) {
      toast({ title: 'Partial Bulk Delete Failed', description: `${errorCount} instances failed to delete, please check logs.`, variant: 'destructive' });
    }
    onLog?.(`Bulk delete completed: ${successCount} succeeded, ${errorCount} failed.`, errorCount > 0 ? 'ERROR' : 'SUCCESS');

    queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
    queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic'] });
    setDesktopSelectedInstanceIds(new Set());
    setIsBulkDeleting(false);
    setIsBulkDeleteDialogOpen(false);
  };

  const handleOpenEditAliasDialog = (instanceId: string, currentAlias: string | undefined) => {
    if (instanceId === '********') return;
    setEditingAliasContext({ id: instanceId, alias: currentAlias });
    setIsEditAliasDialogOpen(true);
  };

  const handleSaveAliasFromDialog = (instanceId: string, newAlias: string) => {
    setAlias(instanceId, newAlias);
    toast({
      title: 'Alias Updated',
      description: newAlias ? `Alias for instance ${instanceId} set to "${newAlias}".` : `Alias for instance ${instanceId} has been cleared.`,
    });
    onLog?.(newAlias ? `Set alias for instance ${instanceId}: "${newAlias}"` : `Cleared alias for instance ${instanceId}`, 'INFO');
    setIsEditAliasDialogOpen(false);
    setEditingAliasContext(null);
  };

  const getInstanceDisplayDetails = (instance: Instance) => {
    const parsedUrl = instance.id !== '********' ? parseNodePassUrl(instance.url) : null;
    const currentAlias = (instance.id !== '********' && !isLoadingAliases) ? allAliasesObject[instance.id] : undefined;

    let displayTargetAddress: React.ReactNode = <span className="text-xs font-mono text-muted-foreground">-</span>;
    let copyTargetTitle = "Target Address (N/A)";
    let targetStringToCopy = "";

    let displayTunnelAddress: React.ReactNode = <span className="text-xs font-mono text-muted-foreground">-</span>;
    let copyTunnelTitle = "Tunnel Address (N/A)";
    let tunnelStringToCopy = "";

    if (instance.id !== '********' && parsedUrl) {
      if (instance.type === 'server') {
          targetStringToCopy = parsedUrl.targetAddress || "N/A";
          copyTargetTitle = "Server Target Address (Business Data)";
          displayTargetAddress = (
             <span
              className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150 break-all"
              onClick={(e) => { e.stopPropagation(); if (targetStringToCopy !== "N/A") { handleCopyToClipboard(targetStringToCopy, copyTargetTitle); }}}
              >
              {targetStringToCopy}
              </span>
          );

          tunnelStringToCopy = parsedUrl.tunnelAddress || "N/A";
          copyTunnelTitle = "Server Listening Tunnel Address";
          displayTunnelAddress = (
             <span
              className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150 break-all"
              onClick={(e) => { e.stopPropagation(); if (tunnelStringToCopy !== "N/A") { handleCopyToClipboard(tunnelStringToCopy, copyTunnelTitle); }}}
              >
              {tunnelStringToCopy}
              </span>
          );
      } else if (instance.type === 'client' && activeApiConfig) {
          const isSingleEnded = parsedUrl.scheme === 'client' && parsedUrl.targetAddress && parsedUrl.tunnelAddress && isWildcardHostname(extractHostname(parsedUrl.tunnelAddress));
          if (isSingleEnded) {
              targetStringToCopy = parsedUrl.targetAddress || "N/A";
              copyTargetTitle = "Client Single-ended Forwarding Target Address";
              displayTargetAddress = (
                 <span className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150 break-all" onClick={(e) => { e.stopPropagation(); if (targetStringToCopy !== "N/A") { handleCopyToClipboard(targetStringToCopy, copyTargetTitle); }}}>{targetStringToCopy}</span>
              );
              const clientLocalListeningPort = extractPort(parsedUrl.tunnelAddress || '');
              const clientMasterApiHost = extractHostname(activeApiConfig.apiUrl);
              tunnelStringToCopy = (clientMasterApiHost && clientLocalListeningPort) ? `${formatHostForDisplay(clientMasterApiHost)}:${clientLocalListeningPort}` : `${parsedUrl.tunnelAddress || '[::]:????'}`;
              copyTunnelTitle = (clientMasterApiHost && clientLocalListeningPort) ? `Client Local Listening (Single-ended Mode, Master: ${activeApiConfig.name})` : `Client Local Listening (Single-ended Mode, Master Address Unknown)`;
              displayTunnelAddress = (<span className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150 break-all" onClick={(e) => { e.stopPropagation(); if(tunnelStringToCopy && !tunnelStringToCopy.includes("????")) {handleCopyToClipboard(tunnelStringToCopy, copyTunnelTitle); }}}>{tunnelStringToCopy}</span>);
          } else {
              const clientLocalForwardPort = extractPort(parsedUrl.targetAddress || '');
              const clientMasterApiHost = extractHostname(activeApiConfig.apiUrl);
              targetStringToCopy = (clientMasterApiHost && clientLocalForwardPort) ? `${formatHostForDisplay(clientMasterApiHost)}:${clientLocalForwardPort}` : (clientLocalForwardPort ? `127.0.0.1:${clientLocalForwardPort}` : (parsedUrl.targetAddress || "N/A (Parse failed)"));
              copyTunnelTitle = (clientMasterApiHost && clientLocalForwardPort) ? `Client Local Forwarding (Master: ${activeApiConfig.name})` : (clientLocalForwardPort ? `Client Local Forwarding (Master Address Unknown)` : "Client Local Forwarding Target");
              displayTargetAddress = (<span className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150 break-all" onClick={(e) => { e.stopPropagation(); if(targetStringToCopy && !targetStringToCopy.startsWith("N/A")) {handleCopyToClipboard(targetStringToCopy, copyTunnelTitle); }}}>{targetStringToCopy}</span>);
              tunnelStringToCopy = parsedUrl.tunnelAddress || "N/A";
              copyTunnelTitle = "Client Connected Server Tunnel Address";
              displayTunnelAddress = (<span className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150 break-all" onClick={(e) => { e.stopPropagation(); if (tunnelStringToCopy !== "N/A") { handleCopyToClipboard(tunnelStringToCopy, copyTunnelTitle); }}}>{tunnelStringToCopy}</span>);
          }
      }
    }

    const totalRx = instance.tcprx + instance.udprx;
    const totalTx = instance.tcptx + instance.udptx;

    return {
        parsedUrl,
        currentAlias,
        displayTargetAddress,
        copyTargetTitle,
        targetStringToCopy,
        displayTunnelAddress,
        copyTunnelTitle,
        tunnelStringToCopy,
        totalRx,
        totalTx,
    };
  };

  const renderDesktopSkeletons = () => {
    return Array.from({ length: 3 }).map((_, i) => (
      <TableRow key={`skeleton-${i}`}>
        <TableCell className="w-10"><Skeleton className="h-4 w-4" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
        <TableCell className="text-left">
          <div className="text-left">
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        </TableCell>
        <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
      </TableRow>
    ));
  };

  const renderMobileSkeletons = () => {
    return Array.from({ length: 2 }).map((_, i) => (
        <Card key={`skeleton-card-${i}`} className="relative mb-4 overflow-hidden">
          <InstanceStatusBadge status="running" compact={true} />
          <CardHeader className="p-3">
            <div className="flex justify-between items-start">
                <div className="flex-grow min-w-0 pr-2">
                    <Skeleton className="h-5 w-3/4 mb-1" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
                <div className="flex flex-col items-end space-y-1 flex-shrink-0 ml-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-8 w-8" />
                </div>
            </div>
          </CardHeader>
          <Separator/>
          <CardContent className="p-3 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </CardContent>
        </Card>
    ));
  };

  const handleSelectInstance = (instanceId: string) => {
    setDesktopSelectedInstanceIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(instanceId)) {
        newSet.delete(instanceId);
      } else {
        newSet.add(instanceId);
      }
      return newSet;
    });
  };


  const renderInstances = () => {
    const instancesToRender = (apiKeyInstance ? [apiKeyInstance] : []).concat(otherInstances || []);
    if (instancesToRender.length === 0) {
        let message = "Loading or no available instance data.";
        if (apiId && !isLoadingInstances && !instancesError) {
            if (instances && instances.length === 0) {
                message = `No instances under master control "${activeApiConfig?.name || apiName}".`;
            } else if (searchTerm) {
                message = `No instances matching "${searchTerm}" found in "${activeApiConfig?.name || apiName}".`;
            }
        } else if (!apiId) {
            message = "Please select an active master control to view instances.";
        } else if (instancesError) {
            return null;
        }
        return isMobile ? (
            <div className="text-center py-10 text-muted-foreground font-sans">{message}</div>
        ) : (
            <TableRow><TableCell colSpan={9} className="text-center h-24 font-sans">{message}</TableCell></TableRow>
        );
    }

    return instancesToRender.map(instance => {
      const {
        currentAlias,
        displayTargetAddress,
        copyTargetTitle,
        targetStringToCopy,
        displayTunnelAddress,
        copyTunnelTitle,
        tunnelStringToCopy,
        totalRx,
        totalTx,
      } = getInstanceDisplayDetails(instance);
      const isApiKeyInstance = instance.id === '********';

      if (isMobile) {
        return (
          <Card key={instance.id} className="relative mb-3 shadow-md card-hover-shadow overflow-hidden">
             {!isApiKeyInstance && (
              <InstanceStatusBadge status={instance.status} compact={true} />
            )}
            <CardHeader className="p-3 pb-2">
              <div className="flex justify-between items-start space-x-2">
                <div className="flex-grow min-w-0">
                  <div
                    className="text-sm font-semibold cursor-pointer hover:text-primary truncate"
                    onClick={() => !isApiKeyInstance && handleOpenEditAliasDialog(instance.id, currentAlias)}
                    title={isApiKeyInstance ? "API Key" : (isLoadingAliases ? "Loading..." : (currentAlias ? `Alias: ${currentAlias} (Click to edit)` : "Click to set alias"))}
                  >
                    {isApiKeyInstance ?
                      <span className="flex items-center"><KeyRound className="h-4 w-4 mr-1.5 text-yellow-500" />API Key</span> :
                      (isLoadingAliases ? <Skeleton className="h-5 w-24" /> : currentAlias || <span className="italic text-muted-foreground">Set alias...</span>)
                    }
                  </div>
                  {!isApiKeyInstance && (
                    <div
                      className="font-mono text-xs text-muted-foreground/70 cursor-pointer hover:text-primary truncate"
                      onClick={() => handleCopyToClipboard(instance.id, "ID")}
                      title={`Instance ID: ${instance.id} (Click to copy)`}
                    >
                      {instance.id}
                    </div>
                  )}
                </div>

                {!isApiKeyInstance && (
                   <div className="flex items-center space-x-2 flex-shrink-0">
                     <Badge
                        variant={instance.type === 'server' ? 'default' : 'accent'}
                        className="items-center whitespace-nowrap text-xs py-0.5 px-1.5 font-sans"
                      >
                        {instance.type === 'server' ? <ServerIcon size={10} className="mr-0.5" /> : <SmartphoneIcon size={10} className="mr-0.5" />}
                        {instance.type === 'server' ? 'Server' : 'Client'}
                      </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Manage Instance">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => updateInstanceMutation.mutate({ instanceId: instance.id, action: 'start' })}
                          disabled={instance.status === 'running' || (updateInstanceMutation.isPending && updateInstanceMutation.variables?.instanceId === instance.id)}
                        >
                          <Play className="mr-2 h-4 w-4" /> Start
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => updateInstanceMutation.mutate({ instanceId: instance.id, action: 'stop' })}
                          disabled={instance.status === 'stopped' || (updateInstanceMutation.isPending && updateInstanceMutation.variables?.instanceId === instance.id)}
                        >
                          <Square className="mr-2 h-4 w-4" /> Stop
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => updateInstanceMutation.mutate({ instanceId: instance.id, action: 'restart' })}
                          disabled={updateInstanceMutation.isPending && updateInstanceMutation.variables?.instanceId === instance.id}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" /> Restart
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setSelectedInstanceForDetails(instance)}>
                          <Eye className="mr-2 h-4 w-4" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setSelectedInstanceForDelete(instance)}
                          disabled={deleteInstanceMutation.isPending && deleteInstanceMutation.variables === instance.id}
                          className="text-destructive hover:!text-destructive focus:!text-destructive focus:!bg-destructive/10"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </CardHeader>
            {!isApiKeyInstance && (
              <>
                <Separator className="my-2" />
                <CardContent className="p-3 pt-1 text-xs space-y-1.5">
                  <div title={copyTunnelTitle}>
                    <strong className="font-medium text-muted-foreground">Tunnel:</strong>
                    <span className="font-mono ml-1 break-all cursor-pointer hover:text-primary" onClick={() => tunnelStringToCopy && tunnelStringToCopy !== "N/A" && handleCopyToClipboard(tunnelStringToCopy, copyTunnelTitle)}>
                      {displayTunnelAddress}
                    </span>
                  </div>
                  <div title={copyTargetTitle}>
                    <strong className="font-medium text-muted-foreground">Target:</strong>
                    <span className="font-mono ml-1 break-all cursor-pointer hover:text-primary" onClick={() => targetStringToCopy && targetStringToCopy !== "N/A" && handleCopyToClipboard(targetStringToCopy, copyTargetTitle)}>
                      {displayTargetAddress}
                    </span>
                  </div>
                  <div>
                    <strong className="font-medium text-muted-foreground">Traffic (Rx/Tx):</strong>
                    <span className="font-mono ml-1">
                      <ArrowDown className="inline-block h-3 w-3 mr-0.5 text-blue-500" />{formatBytes(totalRx)}
                      <span className="text-muted-foreground mx-1">/</span>
                      <ArrowUp className="inline-block h-3 w-3 mr-0.5 text-green-500" />{formatBytes(totalTx)}
                    </span>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        );
      } else {
        return (
            <TableRow
                key={instance.id}
                className="text-foreground/90 hover:text-foreground"
                onDoubleClick={() => setSelectedInstanceForDetails(instance)}
                data-state={desktopSelectedInstanceIds.has(instance.id) ? "selected" : ""}
            >
                <TableCell className="w-10">
                {instance.id !== '********' && (
                    <Checkbox
                    checked={desktopSelectedInstanceIds.has(instance.id)}
                    onCheckedChange={() => handleSelectInstance(instance.id)}
                    aria-label={`Select instance ${instance.id}`}
                    disabled={isBulkDeleting}
                    />
                )}
                </TableCell>
                <TableCell className="font-medium font-mono text-xs break-all" title={instance.id}>{instance.id}</TableCell>
                <TableCell
                    className="text-xs font-sans truncate max-w-[150px]"
                    title={isLoadingAliases ? "Loading..." : (currentAlias || "Double-click to edit alias")}
                    onDoubleClick={(e) => {
                        if (instance.id !== '********') {
                            e.stopPropagation();
                            handleOpenEditAliasDialog(instance.id, currentAlias);
                        }
                    }}
                >
                    {isLoadingAliases && instance.id !== '********' ? <Skeleton className="h-4 w-20" /> :
                    currentAlias ? <span className="flex items-center cursor-pointer"><Pencil size={10} className="mr-1 text-muted-foreground opacity-50 group-hover:opacity-100" />{currentAlias}</span> :
                    (instance.id !== '********' ? <span className="text-muted-foreground cursor-pointer hover:text-primary"><Pencil size={10} className="mr-1 text-muted-foreground opacity-50 group-hover:opacity-100" />Edit Alias</span> : null)
                    }
                </TableCell>
                <TableCell>
                {instance.id === '********' ? (
                    <Badge variant="outline" className="border-yellow-500 text-yellow-600 items-center whitespace-nowrap text-xs py-0.5 px-1.5 font-sans">
                    <KeyRound className="h-3 w-3 mr-1" />API Key
                    </Badge>
                ) : (
                    <Badge
                    variant={instance.type === 'server' ? 'default' : 'accent'}
                    className="items-center whitespace-nowrap text-xs font-sans"
                    >
                    {instance.type === 'server' ? <ServerIcon size={12} className="mr-1" /> : <SmartphoneIcon size={12} className="mr-1" />}
                    {instance.type === 'server' ? 'Server' : 'Client'}
                    </Badge>
                )}
                </TableCell>
                <TableCell>
                {instance.id === '********' ? (
                    <Badge variant="outline" className="border-green-500 text-green-600 whitespace-nowrap font-sans text-xs py-0.5 px-1.5">
                    <CheckCircle className="mr-1 h-3.5 w-3.5" />
                    Available
                    </Badge>
                ) : (
                    <InstanceStatusBadge status={instance.status} />
                )}
                </TableCell>
                <TableCell className="truncate max-w-[200px]" title={copyTunnelTitle}>{displayTunnelAddress}</TableCell>
                <TableCell className="truncate max-w-[200px]" title={copyTargetTitle}>{displayTargetAddress}</TableCell>
                <TableCell className="text-left">
                <div className="text-xs whitespace-nowrap font-mono">
                    {instance.id === '********' ? (
                    <span className="text-muted-foreground">-</span>
                    ) : (
                    <div className="flex items-center space-x-2">
                        <span className="flex items-center" title={`Received: TCP ${formatBytes(instance.tcprx)}, UDP ${formatBytes(instance.udprx)}`}>
                        <ArrowDown className="h-3 w-3 mr-1 text-blue-500" />
                        {formatBytes(totalRx)}
                        </span>
                        <span className="text-muted-foreground">/</span>
                        <span className="flex items-center" title={`Sent: TCP ${formatBytes(instance.tcptx)}, UDP ${formatBytes(instance.udptx)}`}>
                        <ArrowUp className="h-3 w-3 mr-1 text-green-500" />
                        {formatBytes(totalTx)}
                        </span>
                    </div>
                    )}
                </div>
                </TableCell>
                <TableCell className="text-right">
                <div className="flex justify-end items-center space-x-1">
                    {!isApiKeyInstance && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Manage Instance">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                           <DropdownMenuItem
                            onClick={() => updateInstanceMutation.mutate({ instanceId: instance.id, action: 'start'})}
                            disabled={instance.status === 'running' || (updateInstanceMutation.isPending && updateInstanceMutation.variables?.instanceId === instance.id)}
                            >
                            <Play className="mr-2 h-4 w-4" /> Start
                            </DropdownMenuItem>
                            <DropdownMenuItem
                            onClick={() => updateInstanceMutation.mutate({ instanceId: instance.id, action: 'stop'})}
                            disabled={instance.status === 'stopped' || (updateInstanceMutation.isPending && updateInstanceMutation.variables?.instanceId === instance.id)}
                            >
                            <Square className="mr-2 h-4 w-4" /> Stop
                            </DropdownMenuItem>
                            <DropdownMenuItem
                            onClick={() => updateInstanceMutation.mutate({ instanceId: instance.id, action: 'restart'})}
                            disabled={updateInstanceMutation.isPending && updateInstanceMutation.variables?.instanceId === instance.id}
                            >
                            <RotateCcw className="mr-2 h-4 w-4" /> Restart
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setSelectedInstanceForDetails(instance)}>
                            <Eye className="mr-2 h-4 w-4" /> View Details
                            </DropdownMenuItem>
                             {!isApiKeyInstance && (
                                <DropdownMenuItem
                                onClick={() => setSelectedInstanceForDelete(instance)}
                                disabled={deleteInstanceMutation.isPending && deleteInstanceMutation.variables === instance.id}
                                className="text-destructive hover:!text-destructive focus:!text-destructive focus:!bg-destructive/10"
                                >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                             )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {isApiKeyInstance && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedInstanceForDetails(instance)} title="View Details">
                            <Eye className="h-4 w-4" />
                        </Button>
                    )}
                </div>
                </TableCell>
            </TableRow>
        );
      }
    });
  };


  return (
    <Card className="shadow-lg mt-6">
      <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <CardTitle className="font-title">Instance Overview (Master Control: {apiName || 'N/A'})</CardTitle>
          <CardDescription className="font-sans">Manage and monitor NodePass instances.</CardDescription>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-4 sm:mt-0 w-full sm:w-auto">
           {!isMobile && deletableInstances.length > 0 && desktopSelectedInstanceIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsBulkDeleteDialogOpen(true)}
              disabled={isBulkDeleting || desktopSelectedInstanceIds.size === 0}
              className="font-sans h-9 w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Selected ({desktopSelectedInstanceIds.size})
            </Button>
          )}
          <div className="relative w-full sm:w-auto flex-grow sm:flex-grow-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search instances..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 w-full font-sans h-9"
            />
          </div>
          <Button onClick={onOpenCreateInstanceDialog} disabled={!apiRoot || !apiToken} className="font-sans h-9 w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create New Instance
          </Button>
        </div>
      </CardHeader>

      <CardContent className={isMobile ? "pt-4 px-2 sm:px-4" : ""}>
        {!apiId && (
          <div className="text-center py-10 text-muted-foreground font-sans">
            Please select an active master control to view instances.
          </div>
        )}
        {apiId && instancesError && (
          <div className="text-destructive-foreground bg-destructive p-4 rounded-md flex items-center font-sans">
            <AlertTriangle className="h-5 w-5 mr-2" />
            Error loading instances: {instancesError.message}
          </div>
        )}
        {apiId && !instancesError && (
          isMobile ? (
            <div className="space-y-3">
              {isLoadingInstances ? renderMobileSkeletons() : renderInstances()}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      {!isMobile && deletableInstances.length > 0 && (
                        <Checkbox
                          checked={
                            desktopSelectedInstanceIds.size === deletableInstances.length  && deletableInstances.length > 0
                              ? true
                              : desktopSelectedInstanceIds.size > 0
                              ? "indeterminate"
                              : false
                          }
                          onCheckedChange={handleSelectAllInstances}
                          aria-label="Select/Deselect all instances"
                          disabled={deletableInstances.length === 0 || isBulkDeleting}
                        />
                      )}
                    </TableHead>
                    <TableHead className="font-sans">ID</TableHead>
                    <TableHead className="font-sans">Alias</TableHead>
                    <TableHead className="font-sans">Type</TableHead>
                    <TableHead className="font-sans">Status</TableHead>
                    <TableHead className="font-sans">Tunnel Address</TableHead>
                    <TableHead className="font-sans">Target Address</TableHead>
                    <TableHead className="text-left whitespace-nowrap font-sans">Instance Usage</TableHead>
                    <TableHead className="text-right font-sans">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingInstances ? renderDesktopSkeletons() : renderInstances()}
                </TableBody>
              </Table>
            </div>
          )
        )}
      </CardContent>

      <InstanceDetailsModal
        instance={selectedInstanceForDetails}
        open={!!selectedInstanceForDetails}
        onOpenChange={(open) => !open && setSelectedInstanceForDetails(null)}
        apiRoot={apiRoot}
        apiToken={apiToken}
      />
      <DeleteInstanceDialog
        instance={selectedInstanceForDelete}
        open={!!selectedInstanceForDelete}
        onOpenChange={(open) => !open && setSelectedInstanceForDelete(null)}
        onConfirmDelete={(id) => deleteInstanceMutation.mutate(id)}
        isLoading={deleteInstanceMutation.isPending && deleteInstanceMutation.variables === selectedInstanceForDelete?.id}
      />
      {!isMobile &&
        <BulkDeleteInstancesDialog
            selectedInstances={
            instances?.filter(inst => desktopSelectedInstanceIds.has(inst.id))
                .map(inst => ({ id: inst.id, url: inst.url }))
            || []
            }
            open={isBulkDeleteDialogOpen}
            onOpenChange={setIsBulkDeleteDialogOpen}
            isLoading={isBulkDeleting}
            onConfirmDelete={handleConfirmBulkDelete}
        />
      }
      {editingAliasContext && (
        <EditAliasDialog
            open={isEditAliasDialogOpen}
            onOpenChange={(open) => {
                setIsEditAliasDialogOpen(open);
                if (!open) setEditingAliasContext(null);
            }}
            instanceId={editingAliasContext.id}
            currentAlias={editingAliasContext.alias}
            onSave={handleSaveAliasFromDialog}
        />
      )}
    </Card>
  );
}