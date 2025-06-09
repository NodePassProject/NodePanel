
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { LocateFixed, Trash2, Send, LayoutGrid } from 'lucide-react'; 

interface TopologyToolbarProps {
  onCenterView: () => void;
  onFormatLayout: () => void; 
  onClearCanvas: () => void;
  onSubmitTopology: () => void;
  canSubmit: boolean;
  isSubmitting?: boolean;
}

export function TopologyToolbar({
  onCenterView,
  onFormatLayout,
  onClearCanvas,
  onSubmitTopology,
  canSubmit,
  isSubmitting,
}: TopologyToolbarProps) {
  return (
    <div className="flex flex-row flex-wrap gap-2 items-center">
      <Button onClick={onCenterView} size="sm" variant="outline" className="font-sans" disabled={isSubmitting}>
        <LocateFixed className="mr-2 h-4 w-4" />
        居中
      </Button>
      <Button onClick={onFormatLayout} size="sm" variant="outline" className="font-sans" disabled={isSubmitting}>
        <LayoutGrid className="mr-2 h-4 w-4" />
        格式化
      </Button>
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
