"use client";

import React from 'react';
import type { Instance } from '@/types/nodepass';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConfirmationDialog } from './ConfirmationDialog'; 
import { Trash2 } from 'lucide-react';

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
  if (!open) return null;

  if (selectedInstances.length === 0 && open) {
    return (
      <ConfirmationDialog
        open={open}
        onOpenChange={onOpenChange}
        title="No Instances Selected"
        description="No instances were selected for deletion."
        onConfirm={() => onOpenChange(false)} 
        confirmText="Close"
        isLoading={false} 
      />
    );
  }

  const mainDescription = (
    <>
      Are you sure you want to delete the following <span className="font-semibold">{selectedInstances.length}</span> selected instances? This action cannot be undone.
    </>
  );

  const listContent = selectedInstances.length > 0 ? (
    <ScrollArea className="max-h-[200px] my-2 rounded-md border p-2 bg-muted/30">
      <ul className="space-y-1 text-xs">
        {selectedInstances.map(instance => (
          <li key={instance.id} className="font-mono truncate" title={instance.url}>
            ID: {instance.id.substring(0, 12)}... (URL: {instance.url.length > 30 ? instance.url.substring(0, 27) + '...' : instance.url})
          </li>
        ))}
      </ul>
    </ScrollArea>
  ) : null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Bulk Delete Instances"
      description={mainDescription}
      onConfirm={onConfirmDelete}
      confirmText={isLoading ? "Deleting..." : `Delete ${selectedInstances.length} Instances`}
      confirmButtonVariant="destructive"
      ConfirmButtonIcon={Trash2}
      isLoading={isLoading || selectedInstances.length === 0}
    >
      {listContent}
    </ConfirmationDialog>
  );
}