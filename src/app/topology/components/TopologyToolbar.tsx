
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { LocateFixed, Trash2, Send } from 'lucide-react'; // LayoutDashboard removed

interface TopologyToolbarProps {
  onCenterView: () => void;
  // onFormatLayout removed
  onClearCanvas: () => void;
  onSubmitTopology: () => void;
  canSubmit: boolean;
  isSubmitting?: boolean; // Added for loading state
}

export function TopologyToolbar({
  onCenterView,
  // onFormatLayout removed
  onClearCanvas,
  onSubmitTopology,
  canSubmit,
  isSubmitting, // Added
}: TopologyToolbarProps) {
  return (
    <div className="flex flex-row flex-wrap gap-2 items-center">
      <Button onClick={onCenterView} size="sm" variant="outline" className="font-sans" disabled={isSubmitting}>
        <LocateFixed className="mr-2 h-4 w-4" />
        居中
      </Button>
      {/* FormatLayout button removed */}
      <Button onClick={onSubmitTopology} size="sm" variant="default" className="font-sans" disabled={!canSubmit || isSubmitting}>
        <Send className="mr-2 h-4 w-4" />
        {isSubmitting ? "提交中..." : "提交"}
      </Button>
      <Button onClick={onClearCanvas} size="sm" variant="destructive" className="font-sans" disabled={isSubmitting}>
        <Trash2 className="mr-2 h-4 w-4" />
        清空
      </Button>
    </div>
  );
}

