
"use client";

import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Instance } from '@/types/nodepass';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BulkDeleteInstancesDialogProps {
  selectedInstances: Pick<Instance, 'id' | 'url'>[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  isLoading: boolean;
}

export function BulkDeleteInstancesDialog({
  selectedInstances,
  open,
  onOpenChange,
  onConfirmDelete,
  isLoading,
}: BulkDeleteInstancesDialogProps) {
  if (selectedInstances.length === 0 && open) { // Still render if open to allow onOpenChange to fire
     // This case should ideally be prevented by disabling the trigger button
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>无选中实例</AlertDialogTitle>
                    <AlertDialogDescription>
                        没有选中任何实例进行删除。
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => onOpenChange(false)}>关闭</AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
  }
  if (!open) return null;


  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-title">批量删除实例</AlertDialogTitle>
          <AlertDialogDescription className="font-sans">
            确定删除以下 <span className="font-semibold">{selectedInstances.length}</span> 个选中的实例吗？此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {selectedInstances.length > 0 && (
          <ScrollArea className="max-h-[200px] my-2 rounded-md border p-2 bg-muted/30">
            <ul className="space-y-1 text-xs">
              {selectedInstances.map(instance => (
                <li key={instance.id} className="font-mono truncate" title={instance.url}>
                  ID: {instance.id.substring(0, 12)}... (URL: {instance.url.length > 30 ? instance.url.substring(0, 27) + '...' : instance.url})
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
        <AlertDialogFooter className="font-sans">
          <AlertDialogCancel disabled={isLoading} onClick={() => onOpenChange(false)}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmDelete}
            disabled={isLoading || selectedInstances.length === 0}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? '删除中...' : `删除 ${selectedInstances.length} 个实例`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
