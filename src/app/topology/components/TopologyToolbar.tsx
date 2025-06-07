
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { LocateFixed, LayoutDashboard, Trash2, Send, PlusCircle } from 'lucide-react';

interface TopologyToolbarProps {
  onAddNode: () => void;
  onCenterView: () => void;
  onFormatLayout: () => void;
  onClearCanvas: () => void;
  onSubmitTopology: () => void;
  canSubmit: boolean;
}

export function TopologyToolbar({
  onAddNode,
  onCenterView,
  onFormatLayout,
  onClearCanvas,
  onSubmitTopology,
  canSubmit,
}: TopologyToolbarProps) {
  return (
    <div className="flex flex-row flex-wrap gap-2"> {/* Ensures buttons are horizontal and wrap */}
      <Button onClick={onAddNode} size="sm" variant="outline" className="font-sans">
        <PlusCircle className="mr-2 h-4 w-4" />
        添加节点
      </Button>
      <Button onClick={onCenterView} size="sm" variant="outline" className="font-sans">
        <LocateFixed className="mr-2 h-4 w-4" />
        居中视图
      </Button>
      <Button onClick={onFormatLayout} size="sm" variant="outline" className="font-sans">
        <LayoutDashboard className="mr-2 h-4 w-4" />
        格式化
      </Button>
      <Button onClick={onClearCanvas} size="sm" variant="destructive" className="font-sans">
        <Trash2 className="mr-2 h-4 w-4" />
        清空画布
      </Button>
      <Button onClick={onSubmitTopology} size="sm" variant="default" className="font-sans" disabled={!canSubmit}>
        <Send className="mr-2 h-4 w-4" />
        提交拓扑
      </Button>
    </div>
  );
}

