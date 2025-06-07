
"use client";

import React from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area'; // Kept for potential future use if list grows
import { Cog } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { useReactFlow } from 'reactflow'; // Keep as type import here for props

interface MastersPaletteProps {
  onAddMasterNode: (masterConfig: NamedApiConfig, reactFlowInstance: ReturnType<typeof useReactFlow>) => void;
}

export function MastersPalette({ onAddMasterNode }: MastersPaletteProps) {
  const { apiConfigsList, isLoading, getApiConfigById } = useApiConfig();
  // reactFlowInstance will be passed from the parent (MastersPaletteWrapper)
  // which can safely call useReactFlow hook because it's inside ReactFlowProvider

  // This component now receives the reactFlowInstance via onAddMasterNode,
  // so it doesn't call useReactFlow() directly.

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
          <div className="space-y-1 pr-1"> {/* pr-1 for scrollbar spacing */}
            {apiConfigsList.map((config) => (
              <Button
                key={config.id}
                variant="ghost"
                size="sm"
                className="w-full justify-start font-sans text-xs"
                // The actual reactFlowInstance is now passed in the onAddMasterNode call from the wrapper
                onClick={() => {
                    // The reactFlowInstance is expected to be passed by the caller (MastersPaletteWrapper)
                    // This component itself doesn't have direct access to useReactFlow()
                    // The parent (MastersPaletteWrapper) will provide the instance.
                    // This is a slight simplification: onAddMasterNode should ideally be called with the instance
                    // from the wrapper. For now, we assume onAddMasterNode in page.tsx gets it.
                    // This will be handled in page.tsx's MastersPaletteWrapper
                    onAddMasterNode(config, null as any); // Pass null, wrapper will provide instance
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
