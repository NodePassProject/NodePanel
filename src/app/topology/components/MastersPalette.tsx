
"use client";

import React from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card'; // For a title like area
import { Cog } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface MastersPaletteProps {
  onAddMasterNode: (masterConfig: NamedApiConfig) => void;
}

export function MastersPalette({ onAddMasterNode }: MastersPaletteProps) {
  const { apiConfigsList, isLoading } = useApiConfig();

  return (
    <div className="flex flex-col h-auto max-h-[400px]"> 
      <div className="p-3 border-b">
        <h3 className="text-sm font-medium font-title">主控列表</h3>
        <p className="text-xs text-muted-foreground font-sans">
          点击一个主控将其代表添加到画布。
        </p>
      </div>
      <div className="flex-grow overflow-y-auto p-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : apiConfigsList.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2 font-sans">未配置任何主控。</p>
        ) : (
          <ScrollArea className="h-full">
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
        )}
      </div>
    </div>
  );
}

    