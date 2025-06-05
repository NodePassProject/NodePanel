
"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { Network } from 'lucide-react';

interface SelectManagingControllerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  apiConfigsList: NamedApiConfig[];
  onControllerSelected: (selectedConfig: NamedApiConfig) => void;
  droppedNodeType: 'server' | 'client' | null;
  droppedNodeLabel: string | null;
}

export const SelectManagingControllerDialog: React.FC<SelectManagingControllerDialogProps> = ({
  isOpen,
  onOpenChange,
  apiConfigsList,
  onControllerSelected,
  droppedNodeType,
  droppedNodeLabel,
}) => {
  const [selectedApiId, setSelectedApiId] = useState<string | undefined>(apiConfigsList.length > 0 ? apiConfigsList[0].id : undefined);

  const handleSubmit = () => {
    if (selectedApiId) {
      const selectedConfig = apiConfigsList.find(c => c.id === selectedApiId);
      if (selectedConfig) {
        onControllerSelected(selectedConfig);
      }
    }
    onOpenChange(false);
  };

  useEffect(() => {
    // Reset selectedApiId if dialog opens and list is populated, or if list changes
    if (isOpen && apiConfigsList.length > 0) {
        const currentSelectionStillValid = apiConfigsList.some(config => config.id === selectedApiId);
        if (!currentSelectionStillValid) {
             setSelectedApiId(apiConfigsList[0].id);
        } else if (!selectedApiId) { // If selectedApiId was undefined but list has items
            setSelectedApiId(apiConfigsList[0].id);
        }
    } else if (apiConfigsList.length === 0) {
        setSelectedApiId(undefined);
    }
  }, [isOpen, apiConfigsList, selectedApiId]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-title flex items-center">
            <Network className="mr-2 h-5 w-5 text-primary" />
            选择管理主控
          </DialogTitle>
          <DialogDescription className="font-sans">
            为新的 {droppedNodeType === 'server' ? '服务端' : '客户端'} 节点 "{droppedNodeLabel || '未命名'}" 选择一个管理主控。
            此主控将负责创建和管理该实例。
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <Label htmlFor="managing-controller-select" className="font-sans">可用主控</Label>
          <Select value={selectedApiId} onValueChange={setSelectedApiId} disabled={apiConfigsList.length === 0}>
            <SelectTrigger id="managing-controller-select" className="font-sans">
              <SelectValue placeholder={apiConfigsList.length === 0 ? "无可用主控" : "选择一个主控"} />
            </SelectTrigger>
            <SelectContent>
              {apiConfigsList.map(config => (
                <SelectItem key={config.id} value={config.id} className="font-sans">
                  {config.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {apiConfigsList.length === 0 && <p className="text-xs text-destructive font-sans pt-1">无可用主控配置。请先通过右上角设置添加主控。</p>}
        </div>
        <DialogFooter className="font-sans">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!selectedApiId || apiConfigsList.length === 0}>确认选择</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
