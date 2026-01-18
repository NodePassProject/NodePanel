"use client";

import React from 'react';
import type { Instance } from '@/types/nodepass';
import { ConfirmationDialog } from './ConfirmationDialog'; // Import the new generic dialog
import { Trash2 } from 'lucide-react';

interface DeleteInstanceDialogProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: (instanceId: string) => void;
  isLoading: boolean;
}

export function DeleteInstanceDialog({
  instance,
  open,
  onOpenChange,
  onConfirmDelete,
  isLoading,
}: DeleteInstanceDialogProps) {
  if (!instance) return null;

  const description = (
    <>
      Are you sure you want to delete instance <span className="font-semibold">{instance.id}</span>? This action cannot be undone.
      <br />
      URL: <span className="font-semibold break-all">{instance.url}</span>.
    </>
  );

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Instance"
      description={description}
      onConfirm={() => onConfirmDelete(instance.id)}
      confirmText="Delete"
      confirmButtonVariant="destructive"
      ConfirmButtonIcon={Trash2}
      isLoading={isLoading}
    />
  );
}