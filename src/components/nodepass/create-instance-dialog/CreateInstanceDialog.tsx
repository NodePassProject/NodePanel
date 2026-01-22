"use client";

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { createInstanceFormSchema, type CreateInstanceFormValues, createInstanceApiSchema } from '@/zod-schemas/nodepass';
import type { CreateInstanceRequest, Instance } from '@/types/nodepass';
import { PlusCircle, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import type { AppLogEntry } from '../EventLog';
import { extractHostname } from '@/lib/url-utils';
import { useInstanceAliases } from '@/hooks/use-instance-aliases';

import { CreateInstanceFormFields } from './CreateInstanceFormFields';
import { buildUrlFromFormValues, type BuildUrlParams, prepareClientUrlParams, prepareServerUrlParams } from './utils';

interface CreateInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiId: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  apiName: string | null;
  activeApiConfig: NamedApiConfig | null;
  onLog?: (message: string, type: AppLogEntry['type']) => void;
}

export function CreateInstanceDialog({ open, onOpenChange, apiId, apiRoot, apiToken, apiName, activeApiConfig, onLog }: CreateInstanceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { apiConfigsList, getApiRootUrl, getToken } = useApiConfig();
  const { setAlias: saveInstanceAlias } = useInstanceAliases();
  const [externalApiSuggestion, setExternalApiSuggestion] = useState<string | null>(null);

  const form = useForm<CreateInstanceFormValues>({
    resolver: zodResolver(createInstanceFormSchema),
    defaultValues: {
      instanceType: 'Client',
      alias: '',
      tunnelKey: '',
      isSingleEndedForward: false,
      tunnelAddress: '',
      targetAddress: '',
      logLevel: 'master',
      tlsMode: 'master',
      certPath: '',
      keyPath: '',
      minPoolSize: undefined,
      maxPoolSize: undefined,
    },
  });

  const instanceType = form.watch("instanceType");
  const tlsModeWatch = form.watch("tlsMode");
  const isSingleEndedForwardWatched = form.watch("isSingleEndedForward");
  const tunnelAddressValue = form.watch("tunnelAddress");

  useEffect(() => {
    if (open) {
      form.reset({
        instanceType: 'Client',
        alias: '',
        tunnelKey: '',
        isSingleEndedForward: false,
        tunnelAddress: '',
        targetAddress: '',
        logLevel: 'master',
        tlsMode: 'master',
        certPath: '',
        keyPath: '',
        minPoolSize: undefined,
        maxPoolSize: undefined,
      });
      setExternalApiSuggestion(null);
    }
  }, [open, form]);

 useEffect(() => {
    if (instanceType === "Client") {
        if (isSingleEndedForwardWatched) {
            if (form.getValues("tlsMode") !== '0') form.setValue("tlsMode", "0", { shouldDirty: true });
            if (form.getValues("certPath") !== '') form.setValue("certPath", '', { shouldDirty: true });
            if (form.getValues("keyPath") !== '') form.setValue("keyPath", '', { shouldDirty: true });
        } else {
            if (tlsModeWatch !== '2') {
                if (form.getValues("certPath") !== '') form.setValue("certPath", '');
                if (form.getValues("keyPath") !== '') form.setValue("keyPath", '');
            }
        }
    } else if (instanceType === "Server") {
        if (isSingleEndedForwardWatched) {
            form.setValue("isSingleEndedForward", false, {shouldDirty: true});
        }
        if (tlsModeWatch !== '2') {
            if (form.getValues("certPath") !== '') form.setValue("certPath", '');
            if (form.getValues("keyPath") !== '') form.setValue("keyPath", '');
        }
        // For server, min/max pool size are not applicable, ensure they are undefined
        if (form.getValues("minPoolSize") !== undefined) form.setValue("minPoolSize", undefined);
        if (form.getValues("maxPoolSize") !== undefined) form.setValue("maxPoolSize", undefined);
    }
  }, [instanceType, form, isSingleEndedForwardWatched, tlsModeWatch]);


  useEffect(() => {
    if (instanceType === 'Client' && tunnelAddressValue && !isSingleEndedForwardWatched) {
      const clientTunnelHost = extractHostname(tunnelAddressValue);
      if (!clientTunnelHost) {
        setExternalApiSuggestion(null);
        return;
      }

      const localHostnames = ['localhost', '127.0.0.1', '::', '::1', ''];
      if (localHostnames.includes(clientTunnelHost.toLowerCase())) {
        setExternalApiSuggestion(null);
        return;
      }

      const isKnownHost = apiConfigsList.some(config => {
        const configuredApiHost = extractHostname(config.apiUrl);
        return configuredApiHost && configuredApiHost.toLowerCase() === clientTunnelHost.toLowerCase();
      });

      if (!isKnownHost) {
        setExternalApiSuggestion('Hint: Connecting to external master control (' + clientTunnelHost + '). Consider adding it as a master connection.');
      } else {
        setExternalApiSuggestion(null);
      }
    } else {
      setExternalApiSuggestion(null);
    }
  }, [tunnelAddressValue, instanceType, apiConfigsList, isSingleEndedForwardWatched]);

  const createInstanceMutation = useMutation({
    mutationFn: (params: { data: CreateInstanceRequest, useApiRoot?: string, useApiToken?: string }) => {
      const effectiveApiRoot = params.useApiRoot || apiRoot;
      const effectiveApiToken = params.useApiToken || apiToken;

      if (!effectiveApiRoot || !effectiveApiToken) throw new Error("API configuration is incomplete.");
      const validatedApiData = createInstanceApiSchema.parse(params.data);
      return nodePassApi.createInstance(validatedApiData, effectiveApiRoot, effectiveApiToken);
    },
    onSuccess: (createdInstance, variables) => {
      const shortUrl = variables.data.url.length > 40 ? variables.data.url.substring(0,37) + "..." : variables.data.url;
      const masterNameForToast = variables.useApiRoot === apiRoot ? apiName : apiConfigsList.find(c => getApiRootUrl(c.id) === variables.useApiRoot)?.name || 'a master';

      toast({
        title: 'Instance created at ' + masterNameForToast,
        description: 'Instance (URL: ' + shortUrl + ') -> ID: ' + createdInstance.id.substring(0,8) + '...',
      });
      onLog?.('Instance successfully created at ' + masterNameForToast + ': ' + (createdInstance.type === 'server' ? 'Server' : 'Client') + ' - ' + createdInstance.id.substring(0,8) + '... (URL: ' + shortUrl + ')', 'SUCCESS');

      queryClient.invalidateQueries({ queryKey: ['instances', variables.useApiRoot === apiRoot ? apiId : apiConfigsList.find(c => getApiRootUrl(c.id) === variables.useApiRoot)?.id] });
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']});
    },
    onError: (error: any, variables) => {
      const shortUrl = variables.data.url.length > 40 ? variables.data.url.substring(0,37) + "..." : variables.data.url;
      const masterNameForToast = variables.useApiRoot === apiRoot ? apiName : apiConfigsList.find(c => getApiRootUrl(c.id) === variables.useApiRoot)?.name || 'a master';
      toast({
        title: 'Failed to create instance at ' + masterNameForToast,
        description: 'Creation (URL: ' + shortUrl + ') failed: ' + (error.message || 'Unknown error.'),
        variant: 'destructive',
      });
      onLog?.('Failed to create instance at ' + masterNameForToast + ': (URL: ' + shortUrl + ') - ' + (error.message || 'Unknown error'), 'ERROR');
    },
  });

 async function onSubmitHandler(values: CreateInstanceFormValues) {
    if (!apiId || !apiRoot || !apiToken || !activeApiConfig) {
        toast({ title: "Operation failed", description: "Current master control configuration is invalid.", variant: "destructive"});
        onLog?.('Attempt to create instance failed: Current master control configuration is invalid.', 'ERROR');
        return;
    }

    let primaryUrlParams: BuildUrlParams | null = null;
    let primaryCreatedInstance: Instance | null = null;

    const localOnLog = (message: string, type: 'INFO' | 'WARNING' | 'ERROR') => {
      if (type === 'ERROR') toast({ title: "Configuration error", description: message, variant: "destructive" });
      onLog?.(message, type);
    };

    if (values.instanceType === 'Client') {
      const clientSubmission = prepareClientUrlParams(values, activeApiConfig, localOnLog);
      if (!clientSubmission) return;
      primaryUrlParams = clientSubmission.clientParams;
    } else { // 'Server'
      const serverSubmission = prepareServerUrlParams(values, localOnLog);
      if (!serverSubmission) return;
      primaryUrlParams = serverSubmission.serverParams;
    }

    if (!primaryUrlParams) {
      onLog?.('Failed to properly prepare URL parameters for primary instance.', 'ERROR');
      toast({ title: "Internal error", description: "Failed to build primary instance URL.", variant: "destructive" });
      return;
    }

    const primaryInstanceUrl = buildUrlFromFormValues(primaryUrlParams, activeApiConfig);
    onLog?.('Preparing to create primary instance at "' + activeApiConfig.name + '": ' + primaryInstanceUrl, 'INFO');

    try {
      if (primaryInstanceUrl) {
        primaryCreatedInstance = await createInstanceMutation.mutateAsync({
            data: { url: primaryInstanceUrl },
            useApiRoot: apiRoot,
            useApiToken: apiToken,
         });

         if (primaryCreatedInstance && values.alias && values.alias.trim() !== "") {
            saveInstanceAlias(primaryCreatedInstance.id, values.alias.trim());
            onLog?.(`Set alias for instance ${primaryCreatedInstance.id.substring(0,8)}...: "${values.alias.trim()}"`, 'INFO');
         }
      }

      if (!createInstanceMutation.isError) {
         form.reset();
         onOpenChange(false);
      }
    } catch (error: any) {
       console.error("Error occurred while creating instance or saving alias:", error);
       if (!createInstanceMutation.isError) {
          toast({ title: "Operation failed", description: "An unexpected error occurred during instance creation.", variant: "destructive" });
          onLog?.('Error occurred while creating instance or saving alias: ' + error.message, 'ERROR');
       }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-4">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center font-title">
            <PlusCircle className="mr-2 h-5 w-5 text-primary" />
            Create New Instance
          </DialogTitle>
          <div className="flex justify-between items-center mt-1">
            <DialogDescription className="font-sans text-xs mr-4">
              Configure a new instance for the current master control “{apiName || 'N/A'}”.
            </DialogDescription>
            {/* Removed Switch and Label for "Parameter Description" */}
          </div>
        </DialogHeader>

        <CreateInstanceFormFields
            form={form}
            instanceType={instanceType as "Client" | "Server"}
            tlsMode={tlsModeWatch}
            isSingleEndedForward={isSingleEndedForwardWatched}
            activeApiConfig={activeApiConfig}
            apiConfigsList={apiConfigsList}
            serverInstancesForDropdown={undefined}
            isLoadingServerInstances={false}
            externalApiSuggestion={externalApiSuggestion}
            onSubmitHandler={onSubmitHandler}
            showDetailedDescriptions={false} // Hardcoded to false
        />

        <DialogFooter className="pt-3 font-sans">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createInstanceMutation.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form="create-instance-form" disabled={createInstanceMutation.isPending || !apiId}>
            {createInstanceMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Instance'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}