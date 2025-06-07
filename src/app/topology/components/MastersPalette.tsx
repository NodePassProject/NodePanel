
"use client";

import React from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Cog } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReactFlowInstance } from 'reactflow';

interface MastersPaletteProps {
  onAddMasterNode: (masterConfig: NamedApiConfig, reactFlowInstance: ReactFlowInstance) => void;
}

export function MastersPalette({ onAddMasterNode }: MastersPaletteProps) {
  const { apiConfigsList, isLoading } = useApiConfig();
  // reactFlowInstance will be passed to onAddMasterNode by the wrapper component.

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
            <div
              key={config.id}
              onClick={(event) => {
                  // The actual ReactFlowInstance will be injected by the wrapper.
                  // For type safety, we cast to a partial and then to full if really needed,
                  // but here the wrapper handles the actual instance.
                  const mockReactFlowInstance = {} as ReactFlowInstance; 
                  onAddMasterNode(config, mockReactFlowInstance);
              }}
              className="flex items-center p-2 border rounded-md bg-card text-card-foreground hover:bg-muted/50 cursor-pointer transition-colors text-xs font-sans"
              title={`将主控 "${config.name}" 添加到画布`}
            >
              <Cog className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
              <span className="truncate">{config.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
