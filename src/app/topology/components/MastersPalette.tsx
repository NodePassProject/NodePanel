
"use client";

import React from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
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
    <div className="h-full"> {/* Removed p-1, parent div in page.tsx handles padding and scrolling */}
      {isLoading ? (
        <div className="space-y-2 p-1"> {/* Add p-1 back if needed for skeleton internal spacing */}
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : apiConfigsList.length === 0 ? (
        <p className="text-xs text-muted-foreground p-1 font-sans text-center">未配置任何主控。</p>
      ) : (
        <div className="space-y-1 p-1"> {/* Add p-1 back if needed for button list internal spacing */}
          {apiConfigsList.map((config) => (
            <Button
              key={config.id}
              variant="ghost"
              size="sm"
              className="w-full justify-start font-sans text-xs"
              onClick={(event) => {
                  const mockReactFlowInstance = {} as ReactFlowInstance;
                  onAddMasterNode(config, mockReactFlowInstance);
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
