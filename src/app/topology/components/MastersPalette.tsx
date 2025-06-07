
"use client";

import React from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Cog } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface MastersPaletteProps {
  onAddMasterNode: (masterConfig: NamedApiConfig) => void;
}

export function MastersPalette({ onAddMasterNode }: MastersPaletteProps) {
  const { apiConfigsList, isLoading } = useApiConfig();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (apiConfigsList.length === 0) {
    return <p className="text-xs text-muted-foreground font-sans">未配置任何主控。</p>;
  }

  return (
    <ScrollArea className="h-full max-h-[calc(100%-40px)]"> 
      <div className="space-y-1 pr-1">
        {apiConfigsList.map((config) => (
          <Button
            key={config.id}
            variant="ghost"
            size="sm"
            className="w-full justify-start font-sans text-xs"
            onClick={() => onAddMasterNode(config)}
            title={`将主控 "${config.name}" 添加到画布`}
          >
            <Cog className="mr-2 h-4 w-4 text-primary" />
            {config.name}
          </Button>
        ))}
      </div>
    </ScrollArea>
  );
}

