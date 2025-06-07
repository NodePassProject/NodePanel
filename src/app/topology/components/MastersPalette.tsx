
"use client";

import React from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Cog } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useReactFlow } from 'reactflow'; // Changed from "import type"

interface MastersPaletteProps {
  onAddMasterNode: (masterConfig: NamedApiConfig, reactFlowInstance: ReturnType<typeof useReactFlow>) => void;
}

export function MastersPalette({ onAddMasterNode }: MastersPaletteProps) {
  const { apiConfigsList, isLoading } = useApiConfig();
  const reactFlowInstanceHook = useReactFlow(); // Hook to get reactFlow instance

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
        <ScrollArea className="h-full flex-grow">
          <div className="space-y-1 pr-1">
            {apiConfigsList.map((config) => (
              <Button
                key={config.id}
                variant="ghost"
                size="sm"
                className="w-full justify-start font-sans text-xs"
                onClick={() => onAddMasterNode(config, reactFlowInstanceHook)}
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
