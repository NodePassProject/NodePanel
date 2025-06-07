
"use client";

import React from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Cog } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function MastersPalette() {
  const { apiConfigsList, isLoading } = useApiConfig();

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, config: NamedApiConfig) => {
    event.dataTransfer.setData('application/nodepass-master-config', JSON.stringify(config));
    event.dataTransfer.effectAllowed = 'move';
  };

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
              draggable={true}
              onDragStart={(event) => handleDragStart(event, config)}
              className="flex items-center p-2 border rounded-md bg-card text-card-foreground hover:bg-muted/50 cursor-grab active:cursor-grabbing transition-colors text-xs font-sans shadow-sm"
              title={`拖拽主控 "${config.name}" 到画布`}
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

    