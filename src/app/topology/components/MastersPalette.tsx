
"use client";

import React from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
// ScrollArea removed as parent CardContent will handle scrolling
import { Cog } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReactFlowInstance } from 'reactflow'; // Import ReactFlowInstance type

interface MastersPaletteProps {
  onAddMasterNode: (masterConfig: NamedApiConfig, reactFlowInstance: ReactFlowInstance) => void;
}

export function MastersPalette({ onAddMasterNode }: MastersPaletteProps) {
  const { apiConfigsList, isLoading } = useApiConfig();
  // reactFlowInstance will be passed to onAddMasterNode by the wrapper component.

  return (
    <div className="flex flex-col h-full p-1"> {/* Ensures the div tries to fill height if parent allows */}
      {isLoading ? (
        <div className="space-y-2 p-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : apiConfigsList.length === 0 ? (
        <p className="text-xs text-muted-foreground p-2 font-sans text-center">未配置任何主控。</p>
      ) : (
        // Removed ScrollArea. Parent CardContent handles scrolling.
        <div className="space-y-1 pr-1"> {/* Added pr-1 for consistency if scrollbar appears in parent */}
          {apiConfigsList.map((config) => (
            <Button
              key={config.id}
              variant="ghost"
              size="sm"
              className="w-full justify-start font-sans text-xs"
              onClick={(event) => {
                  // The actual instance is injected by the parent wrapper (MastersPaletteWrapperComponent)
                  // This is a placeholder to satisfy the onAddMasterNode signature if it were called directly without instance
                  const mockReactFlowInstance = {} as ReactFlowInstance; 
                  onAddMasterNode(config, mockReactFlowInstance); // The wrapper will pass the real instance
              }}
              title={`将主控 "${config.name}" 添加到画布`}
            >
              <Cog className="mr-2 h-4 w-4 text-primary" />
              {config.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
