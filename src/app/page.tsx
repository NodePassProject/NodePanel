"use client";

import React, { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ApiConfigDialog } from '@/components/nodepass/ApiKeyDialog';
import { CreateInstanceDialog } from '@/components/nodepass/create-instance-dialog';
import { InstanceList } from '@/components/nodepass/InstanceList';
import { EventLog, type AppLogEntry } from '@/components/nodepass/EventLog';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Loader2, PlusCircle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';


export default function HomePage() {
  const {
    activeApiConfig,
    apiConfigsList,
    addOrUpdateApiConfig,
    isLoading: isLoadingApiConfig,
    setActiveApiConfigId,
    getApiRootUrl,
    getToken
  } = useApiConfig();
  const { toast } = useToast();

  const [isApiConfigDialogOpenForSetup, setIsApiConfigDialogOpenForSetup] = useState(false);
  const [editingApiConfigForSetup, setEditingApiConfigForSetup] = useState<NamedApiConfig | null>(null);
  
  const [isCreateInstanceDialogOpen, setIsCreateInstanceDialogOpen] = useState(false);

  const [pageLogs, setPageLogs] = useState<AppLogEntry[]>([]);
  const prevApiIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const addPageLog = (message: string, type: AppLogEntry['type'], details?: Record<string, any> | string) => {
    setPageLogs(prevLogs => [
      { timestamp: new Date().toISOString(), message, type, details },
      ...prevLogs
    ].slice(0, 100)); 
  };

  useEffect(() => {
    if (activeApiConfig && prevApiIdRef.current !== activeApiConfig.id) {
      if (prevApiIdRef.current !== null) { 
        addPageLog('Active master control switched to: "' + activeApiConfig.name + '"', 'INFO', { previousApiId: prevApiIdRef.current, newApiId: activeApiConfig.id });
      } else {
        addPageLog('Active master control set to: "' + activeApiConfig.name + '"', 'INFO', { newApiId: activeApiConfig.id });
      }
      prevApiIdRef.current = activeApiConfig.id;
    } else if (!activeApiConfig && prevApiIdRef.current !== null) {
        addPageLog('Active master control disconnected.', 'INFO', { previousApiId: prevApiIdRef.current });
        prevApiIdRef.current = null;
    }
  }, [activeApiConfig]);


  const handleSaveApiConfigForSetup = (configToSave: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    const savedConfig = addOrUpdateApiConfig(configToSave);
    setActiveApiConfigId(savedConfig.id);
    setEditingApiConfigForSetup(null);
    setIsApiConfigDialogOpenForSetup(false);
    toast({
      title: 'Master Control Added',
      description: `“${configToSave.name}” has been saved and activated.`,
    });
    addPageLog(`Master control "${savedConfig.name}" added and activated.`, 'SUCCESS', { configId: savedConfig.id, name: savedConfig.name });
  };

  const handleOpenApiConfigDialogForSetup = () => {
    setEditingApiConfigForSetup(null); 
    setIsApiConfigDialogOpenForSetup(true);
  };

  const handleImportFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') throw new Error("Failed to read file content.");
        
        const importedConfigsUntyped = JSON.parse(content) as any[]; 
        if (!Array.isArray(importedConfigsUntyped)) throw new Error("Invalid import file format, expected JSON array.");

        let importedCount = 0;
        let skippedCount = 0;
        let invalidCount = 0;
        let firstNewlyImportedConfig: NamedApiConfig | null = null;

        const currentActiveConfigBeforeImport = activeApiConfig; // Capture state before updates

        importedConfigsUntyped.forEach(importedConfig => {
          if (
            typeof importedConfig.id === 'string' &&
            typeof importedConfig.name === 'string' &&
            typeof importedConfig.apiUrl === 'string' &&
            typeof importedConfig.token === 'string'
          ) {
            // Check against the most up-to-date list from the hook, 
            // though for "existing" check, initial apiConfigsList is fine.
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
              const savedConfig = addOrUpdateApiConfig(configToAdd);
              if (importedCount === 0) { // If this is the first *newly* imported config
                firstNewlyImportedConfig = savedConfig;
              }
              importedCount++;
            }
          } else {
            console.warn("Skipping invalid import config item:", importedConfig);
            invalidCount++;
          }
        });
        
        let importSummary = `Successfully imported ${importedCount} configurations.`;
        if (skippedCount > 0) importSummary += ` Skipped ${skippedCount} duplicate ID configurations.`;
        if (invalidCount > 0) importSummary += ` ${invalidCount} configurations with invalid format ignored.`;
        
        toast({
          title: 'Import Completed',
          description: importSummary,
        });
        addPageLog(`Master control configurations import completed: ${importSummary}`, 'INFO');

        if (firstNewlyImportedConfig && !currentActiveConfigBeforeImport) {
            setActiveApiConfigId(firstNewlyImportedConfig.id);
             toast({
                title: 'Master Control Activated',
                description: `“${firstNewlyImportedConfig.name}” has been automatically activated.`,
            });
            addPageLog(`Master control "${firstNewlyImportedConfig.name}" has been automatically activated.`, 'INFO');
        }

      } catch (error: any) {
        toast({
          title: 'Import Failed',
          description: error.message || 'Failed to parse file or incorrect file format.',
          variant: 'destructive',
        });
        addPageLog(`Master control configurations import failed: ${error.message || 'Unknown error'}`, 'ERROR');
      }
    };
    reader.onerror = () => {
       toast({
        title: 'Import Failed',
        description: 'Error occurred while reading the file.',
        variant: 'destructive',
      });
      addPageLog('Master control configurations import failed: file read error.', 'ERROR');
    }
    reader.readAsText(file);
    if (event.target) {
      event.target.value = ''; 
    }
  };


  const currentApiId = activeApiConfig?.id || null;
  const currentApiName = activeApiConfig?.name || null;
  const currentApiRoot = activeApiConfig ? getApiRootUrl(activeApiConfig.id) : null;
  const currentToken = activeApiConfig ? getToken(activeApiConfig.id) : null;


  if (isLoadingApiConfig) {
    return (
      <AppLayout onLog={addPageLog}>
        <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg font-sans">Loading master control configurations...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout onLog={addPageLog}>
        {activeApiConfig ? (
          <div className="space-y-8">
            <InstanceList
              key={activeApiConfig.id} 
              apiId={currentApiId}
              apiName={currentApiName}
              apiRoot={currentApiRoot}
              apiToken={currentToken}
              activeApiConfig={activeApiConfig}
              apiConfigsList={apiConfigsList}
              onLog={addPageLog}
              onOpenCreateInstanceDialog={() => setIsCreateInstanceDialogOpen(true)}
            />
          </div>
        ) : (
           <div className="flex flex-col items-center justify-center text-center flex-grow">
            <h2 className="text-2xl font-semibold mb-4 font-title">
              {apiConfigsList.length > 0 ? 'No Master Control Selected' : 'Master Control Connection Required'}
            </h2>
            <p className="text-muted-foreground mb-6 font-sans">
              {apiConfigsList.length > 0
                ? 'Please select or add a master control connection from the header menu.'
                : 'Please add a master control connection or import configurations from the header menu to get started.'}
            </p>
            {apiConfigsList.length === 0 && (
              <div className="flex flex-row gap-4">
                <Button onClick={handleOpenApiConfigDialogForSetup} size="lg" className="font-sans">
                  <PlusCircle className="mr-2 h-5 w-5" />
                  Add Master Control
                </Button>
                <Button onClick={() => fileInputRef.current?.click()} size="lg" variant="outline" className="font-sans">
                  <Upload className="mr-2 h-5 w-5" />
                  Import Configurations
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportFileSelected}
                  style={{ display: 'none' }}
                  accept=".json"
                />
              </div>
            )}
             {apiConfigsList.length > 0 && !activeApiConfig && (
              <p className="text-sm text-muted-foreground mt-4 font-sans">
                Click the settings icon in the top right corner to manage or select a master control connection.
              </p>
            )}
          </div>
        )}

      <div className="mt-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-title">Application Event Log</CardTitle>
            <CardDescription className="font-sans mt-1">
              Records key operations and state changes within the application.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EventLog logs={pageLogs} />
          </CardContent>
        </Card>
      </div>
      
      <ApiConfigDialog
        open={isApiConfigDialogOpenForSetup}
        onOpenChange={setIsApiConfigDialogOpenForSetup}
        onSave={handleSaveApiConfigForSetup}
        currentConfig={editingApiConfigForSetup}
        isEditing={!!editingApiConfigForSetup}
        onLog={addPageLog}
      />
      <CreateInstanceDialog
        open={isCreateInstanceDialogOpen}
        onOpenChange={setIsCreateInstanceDialogOpen}
        apiId={currentApiId}
        apiRoot={currentApiRoot}
        apiToken={currentToken}
        apiName={currentApiName}
        activeApiConfig={activeApiConfig}
        onLog={addPageLog}
      />
    </AppLayout>
  );
}