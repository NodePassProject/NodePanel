
"use client";

import React from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area'; // Keep ScrollArea for content
import { Cog } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReactFlowInstance } from 'reactflow'; // Import ReactFlowInstance type

interface MastersPaletteProps {
  onAddMasterNode: (masterConfig: NamedApiConfig, reactFlowInstance: ReactFlowInstance) => void;
}

export function MastersPalette({ onAddMasterNode }: MastersPaletteProps) {
  const { apiConfigsList, isLoading } = useApiConfig();
  // reactFlowInstanceHook will be passed via props from a wrapper component that uses useReactFlow
  // For this component, we assume reactFlowInstance is passed to onAddMasterNode.

  return (
    <div className="flex flex-col h-full p-1">
      {isLoading ? (
        <div className="space-y-2 p-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : apiConfigsList.length === 0 ? (
        <p className="text-xs text-muted-foreground p-2 font-sans text-center">未配置任何主控。</p>
      ) : (
        <ScrollArea className="h-full flex-grow"> {/* Use ScrollArea for the list */}
          <div className="space-y-1 pr-1">
            {apiConfigsList.map((config) => (
              <Button
                key={config.id}
                variant="ghost"
                size="sm"
                className="w-full justify-start font-sans text-xs"
                // The actual reactFlowInstance will be provided by the wrapper when calling onAddMasterNode
                // For type safety, onAddMasterNode signature expects it.
                onClick={(event) => {
                    // This is a placeholder if reactFlowInstance is needed *directly* here
                    // which it isn't, as it's part of the callback prop's signature.
                    // The actual instance is injected by the parent wrapper.
                    const mockReactFlowInstance = {} as ReactFlowInstance; // This is just for the onClick signature if needed
                    onAddMasterNode(config, mockReactFlowInstance); // The real instance comes from TopologyPage via wrapper
                }}
                title={`将主控 "${config.name}" 添加到画布`}
              >
                <Cog className="mr-2 h-4 w-4 text-primary" />
                {config.name}
              </Button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
