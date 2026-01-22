"use client";

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiConfigDialog } from '@/components/nodepass/ApiKeyDialog';
import { PlusCircle, Edit3, Trash2, Power, CheckCircle, Loader2, Upload, Download, MoreVertical, AlertTriangle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { AppLogEntry } from './EventLog';
import { MasterInfoCells } from './MasterInfoCells';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import type { MasterInfo } from '@/types/nodepass';
import { MASTER_TLS_MODE_DISPLAY_MAP } from './create-instance-dialog/constants';


const mapLogLevelMobile = (logLevel: string | undefined): string => {
  if (!logLevel) return 'N/A';
  const lowerLogLevel = logLevel.toLowerCase();
  if (lowerLogLevel === 'master') return 'Master Default';
  return lowerLogLevel.charAt(0).toUpperCase() + lowerLogLevel.slice(1);
}

const mapTlsModeMobile = (tlsMode: string | undefined): string => {
  if (!tlsMode) return 'N/A';
  if (tlsMode in MASTER_TLS_MODE_DISPLAY_MAP) {
    return MASTER_TLS_MODE_DISPLAY_MAP[tlsMode as keyof typeof MASTER_TLS_MODE_DISPLAY_MAP];
  }
  return tlsMode;
}

const CompactMasterInfo: React.FC<{ config: NamedApiConfig, isActive: boolean }> = ({ config, isActive }) => {
  const { getApiRootUrl, getToken } = useApiConfig();

  const { data: masterInfo, isLoading: isLoadingMasterInfo, error: masterInfoError, refetch: refetchMasterInfo, isRefetching: isRefetchingMasterInfo } = useQuery<MasterInfo, Error>({
    queryKey: ['masterInfo', config.id, 'compact'], // Unique key for compact view
    queryFn: () => {
      const apiRoot = getApiRootUrl(config.id);
      const token = getToken(config.id);
      if (!apiRoot || !token) {
        throw new Error(`API configuration for master ${config.name} is incomplete.`);
      }
      return nodePassApi.getMasterInfo(apiRoot, token);
    },
    enabled: !!config.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const defaultLogLevel = mapLogLevelMobile(config.masterDefaultLogLevel || 'master');
  const defaultTlsMode = mapTlsModeMobile(config.masterDefaultTlsMode || 'master');

  const renderInfoLine = (label: string, value: React.ReactNode, isLoading?: boolean, hasError?: boolean, onRetry?: () => void) => (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}:</span>
      {isLoading ? <Skeleton className="h-3 w-16 ml-1" /> :
       hasError ? (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onRetry?.(); }} disabled={isRefetchingMasterInfo} className="h-auto p-0 text-xs text-destructive hover:text-destructive ml-1">
            <AlertTriangle className="h-3 w-3 mr-0.5" />Error <RefreshCw className={`h-2.5 w-2.5 ml-0.5 ${isRefetchingMasterInfo ? 'animate-spin' : ''}`} />
          </Button>
        ) : (
          <span className="font-mono text-right truncate" title={typeof value === 'string' ? value : undefined}>{value}</span>
        )
      }
    </div>
  );

  return (
    <div className="text-xs space-y-1.5 mt-2 pt-2 border-t border-border/30">
       {isActive && (
         <div className="absolute top-0 right-0" style={{ width: "24px", height: "24px" }}>
            <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <svg width="24px" height="24px" viewBox="0 0 20 20" className="overflow-visible">
                            <polygon points="0,0 20,0 20,20" className="fill-green-500 dark:fill-green-600" />
                        </svg>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs font-sans p-1.5">
                        Currently Active
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
       )}
      {renderInfoLine("Default Log", defaultLogLevel)}
      {renderInfoLine("Default TLS", defaultTlsMode)}
      {renderInfoLine("Version", masterInfo?.ver || "N/A", isLoadingMasterInfo, !!masterInfoError, refetchMasterInfo)}
      {renderInfoLine("System", masterInfo ? `${masterInfo.os} ${masterInfo.arch}` : "N/A", isLoadingMasterInfo, !!masterInfoError, refetchMasterInfo)}
    </div>
  );
};

interface ConnectionsManagerProps {
  onLog?: (message: string, type: AppLogEntry['type']) => void;
}

export function ConnectionsManager({ onLog }: ConnectionsManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const {
    apiConfigsList,
    activeApiConfig,
    addOrUpdateApiConfig,
    deleteApiConfig,
    setActiveApiConfigId,
    isLoading: isLoadingApiConfig,
  } = useApiConfig();

  const isMobile = useIsMobile();
  const [isApiConfigDialogOpen, setIsApiConfigDialogOpen] = useState(false);
  const [editingApiConfig, setEditingApiConfig] = useState<NamedApiConfig | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<NamedApiConfig | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenApiConfigDialog = (configToEdit?: NamedApiConfig | null) => {
    setEditingApiConfig(configToEdit || null);
    setIsApiConfigDialogOpen(true);
  };

  const handleSaveApiConfig = (configToSave: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    const isNew = !configToSave.id;
    const savedConfig = addOrUpdateApiConfig(configToSave);
    setEditingApiConfig(null);
    setIsApiConfigDialogOpen(false);
    const actionText = isNew ? 'added' : 'updated';
    toast({
      title: `Master has been ${actionText}`,
      description: `“${savedConfig.name}” has been saved.`,
    });
    onLog?.(`Master config "${savedConfig.name}" has been ${actionText}.`, 'SUCCESS');
    if (isNew && apiConfigsList.length === 0) { 
        setActiveApiConfigId(savedConfig.id);
        onLog?.(`Master "${savedConfig.name}" has been automatically activated.`, 'INFO');
    }
  };

  const handleSetActive = (id: string) => {
    const config = apiConfigsList.find(c => c.id === id);
    setActiveApiConfigId(id);
    toast({
      title: 'Active master switched',
      description: `Connected to "${config?.name}".`,
    });
    onLog?.(`Active master switched to: "${config?.name}"`, 'INFO');
  };

  const handleDeleteConfirm = () => {
    if (deletingConfig) {
      const name = deletingConfig.name;
      deleteApiConfig(deletingConfig.id);
      toast({
        title: 'Master deleted',
        description: `“${name}” has been deleted.`,
        variant: 'destructive',
      });
      onLog?.(`Master config "${name}" has been deleted.`, 'SUCCESS');
      setDeletingConfig(null);
    }
  };

  const handleExportConfigs = () => {
    if (apiConfigsList.length === 0) {
      toast({
        title: 'No configs to export',
        description: 'Please add master connections first.',
        variant: 'destructive',
      });
      onLog?.('Attempt to export master configs failed: list is empty.', 'WARNING');
      return;
    }
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(apiConfigsList, null, 2)
    )}`;
    const link = document.createElement('a');
    link.href = jsonString;
    link.download = 'nodepass-connections.json';
    link.click();
    toast({
      title: 'Configs exported',
      description: 'Master connection configs have been successfully downloaded.',
    });
    onLog?.('Master configs have been exported.', 'INFO');
  };

  const handleImportFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') throw new Error("Unable to read file content.");

        const importedConfigsUntyped = JSON.parse(content) as any[];
        if (!Array.isArray(importedConfigsUntyped)) throw new Error("Import file format is invalid, should be a JSON array.");

        let importedCount = 0;
        let skippedCount = 0;
        let invalidCount = 0;
        let firstNewlyImportedConfig: NamedApiConfig | null = null;
        const currentActiveConfigBeforeImport = activeApiConfig;

        importedConfigsUntyped.forEach(importedConfig => {
          if (
            typeof importedConfig.id === 'string' &&
            typeof importedConfig.name === 'string' &&
            typeof importedConfig.apiUrl === 'string' &&
            typeof importedConfig.token === 'string'
          ) {
            const existingConfig = apiConfigsList.find(c => c.id === importedConfig.id);
            if (existingConfig) {
              skippedCount++;
            } else {
              const configToAdd: Omit<NamedApiConfig, 'id'> & { id?: string } = {
                id: importedConfig.id,
                name: importedConfig.name,
                apiUrl: importedConfig.apiUrl,
                token: importedConfig.token,
                masterDefaultLogLevel: importedConfig.masterDefaultLogLevel || 'master',
                masterDefaultTlsMode: importedConfig.masterDefaultTlsMode || 'master',
              };
              const saved = addOrUpdateApiConfig(configToAdd); 
              if (importedCount === 0) {
                  firstNewlyImportedConfig = saved;
              }
              importedCount++;
            }
          } else {
            console.warn("Skipping invalid import config item:", importedConfig);
            invalidCount++;
          }
        });

        let importSummary = `Successfully imported ${importedCount} configs.`;
        if (skippedCount > 0) importSummary += ` Skipped ${skippedCount} duplicate ID configs.`;
        if (invalidCount > 0) importSummary += ` ${invalidCount} configs with invalid format ignored.`;

        toast({
          title: 'Import complete',
          description: importSummary,
        });
        onLog?.(`Master config import completed: ${importSummary}`, 'INFO');

        if (firstNewlyImportedConfig && !currentActiveConfigBeforeImport) {
            const config = firstNewlyImportedConfig as NamedApiConfig;
            setActiveApiConfigId(config.id);
            toast({
                title: 'Master activated',
                description: `"${config.name}" has been automatically activated.`,
            });
            onLog?.(`Master "${config.name}" has been automatically activated.`, 'INFO');
        }

      } catch (error: any) {
        toast({
          title: 'Import failed',
          description: error.message || 'Failed to parse file or incorrect file format.',
          variant: 'destructive',
        });
        onLog?.(`Master config import failed: ${error.message || 'Unknown error'}`, 'ERROR');
      }
    };
    reader.onerror = () => {
       toast({
        title: 'Import failed',
        description: 'An error occurred while reading the file.',
        variant: 'destructive',
      });
      onLog?.('Master config import failed: file read error.', 'ERROR');
    }
    reader.readAsText(file);
    if (event.target) {
      event.target.value = '';
    }
  };

  if (isLoadingApiConfig) {
    return (
      <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg font-sans">Loading master connections...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2 sm:ml-auto w-full sm:w-auto">
          <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm" className="font-sans flex-grow sm:flex-grow-0">
            <Upload className="mr-2 h-4 w-4" />
            Import Configs
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFileSelected}
            style={{ display: 'none' }}
            accept=".json"
          />
          <Button onClick={handleExportConfigs} variant="outline" size="sm" className="font-sans flex-grow sm:flex-grow-0">
            <Download className="mr-2 h-4 w-4" />
            Export Configs
          </Button>
          <Button onClick={() => handleOpenApiConfigDialog(null)} size="sm" className="font-sans flex-grow sm:flex-grow-0">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add New Master
          </Button>
        </div>
      </div>

      {apiConfigsList.length === 0 ? (
        <Card className="text-center py-10 shadow-lg card-hover-shadow">
          <CardHeader>
            <CardTitle className="font-title">No Master Connections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground font-sans">No master connections have been added.</p>
            <p className="text-muted-foreground font-sans">Click "Add New Master" or "Import Configs" above to get started.</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        // Mobile Card Layout
        <div className="space-y-3">
          {apiConfigsList.map((config) => {
            const isActive = activeApiConfig?.id === config.id;
            return (
              <Card key={config.id} className={`shadow-md card-hover-shadow relative overflow-hidden ${isActive ? 'border-primary ring-2 ring-primary' : ''}`}>
                <CardHeader className="p-3 pb-2">
                  <div className="flex justify-between items-start space-x-2">
                    <div className="flex-grow min-w-0">
                      <div
                        className="text-sm font-semibold cursor-pointer hover:text-primary truncate"
                        onClick={() => !isActive && handleSetActive(config.id)}
                        title={isActive ? config.name : `Click to activate: ${config.name}`}
                      >
                        {config.name}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground/80 break-all" title={config.apiUrl}>
                        {config.apiUrl}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Manage Master">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!isActive && (
                            <DropdownMenuItem onClick={() => handleSetActive(config.id)}>
                              <Power className="mr-2 h-4 w-4" /> Set Active
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleOpenApiConfigDialog(config)}>
                            <Edit3 className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem
                                    onSelect={(e) => e.preventDefault()} 
                                    disabled={isActive}
                                    className={isActive ? "" : "text-destructive hover:!text-destructive focus:!text-destructive focus:!bg-destructive/10"}
                                >
                                 <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle className="font-title">Confirm Deletion</AlertDialogTitle>
                                <AlertDialogDescription className="font-sans">
                                    Are you sure you want to delete master “{config.name}”? This action cannot be undone.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel className="font-sans">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => {
                                        setDeletingConfig(config); 
                                        handleDeleteConfirm();
                                    }}
                                    className="bg-destructive hover:bg-destructive/90 font-sans text-destructive-foreground"
                                >
                                    Delete
                                </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-1">
                  <CompactMasterInfo config={config} isActive={isActive} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        // Desktop Table Layout
        <div className="border rounded-lg shadow-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px] text-center font-sans">Status</TableHead>
                <TableHead className="font-sans">Master Name</TableHead>
                <TableHead className="font-sans">Master API URL</TableHead>
                <TableHead className="font-sans">Version</TableHead>
                <TableHead className="font-sans">System Info</TableHead>
                <TableHead className="font-sans">Default Log</TableHead>
                <TableHead className="font-sans">Default TLS</TableHead>
                <TableHead className="text-right w-[250px] font-sans">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiConfigsList.map((config) => (
                <TableRow key={config.id} className={activeApiConfig?.id === config.id ? 'bg-muted/50' : ''}>
                  <TableCell className="text-center">
                    {activeApiConfig?.id === config.id && (
                      <CheckCircle className="h-5 w-5 text-green-500 inline-block" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium break-all font-sans">{config.name}</TableCell>
                  <TableCell className="text-xs break-all font-mono">{config.apiUrl}</TableCell>
                  <MasterInfoCells apiConfig={config} />
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenApiConfigDialog(config)}
                        aria-label={`Edit master ${config.name}`}
                        className="font-sans"
                      >
                        <Edit3 className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeletingConfig(config)}
                            aria-label={`Delete master ${config.name}`}
                            disabled={activeApiConfig?.id === config.id}
                            className="font-sans"
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        {deletingConfig && deletingConfig.id === config.id && (
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-title">Confirm Deletion</AlertDialogTitle>
                              <AlertDialogDescription className="font-sans">
                                Are you sure you want to delete master “{deletingConfig.name}”? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setDeletingConfig(null)} className="font-sans">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleDeleteConfirm}
                                className="bg-destructive hover:bg-destructive/90 font-sans text-destructive-foreground"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        )}
                      </AlertDialog>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleSetActive(config.id)}
                        disabled={activeApiConfig?.id === config.id}
                        aria-label={`Activate master ${config.name}`}
                        className="font-sans"
                      >
                        <Power className="mr-1 h-3.5 w-3.5" />
                        {activeApiConfig?.id === config.id ? 'Currently Active' : 'Set Active'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ApiConfigDialog
        open={isApiConfigDialogOpen}
        onOpenChange={setIsApiConfigDialogOpen}
        onSave={handleSaveApiConfig}
        currentConfig={editingApiConfig}
        isEditing={!!editingApiConfig}
      />
    </div>
  );
}