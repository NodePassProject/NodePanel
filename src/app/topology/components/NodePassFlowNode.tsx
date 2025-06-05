
import React from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import { cn } from "@/lib/utils";
import type { TopologyNodeData, ControllerNodeData, ServerNodeData, ClientNodeData, LandingNodeData, UserNodeData } from '../lib/topology-types';
import { getNodeIcon, getNodeIconColorClass, getNodeBorderColorClass, getSelectedNodeBgClass } from '../lib/topology-utils';
import { ChevronDown, ChevronRight } from 'lucide-react';

const NodePassFlowNode: React.FC<NodeProps<TopologyNodeData>> = React.memo(({ data, selected, id }) => {
  const { getNode } = useReactFlow();
  const node = getNode(id);

  if (!data || !node) {
    return <div className="w-20 h-10 bg-muted rounded text-xs flex items-center justify-center">数据错误</div>;
  }

  const Icon = getNodeIcon(data.type);
  const isExpanded = data.isExpanded;
  
  let displayLabel = data.label;
  let subText = '';
  let detailsContent = null;
  
  const isControllerClientRole = data.type === 'controller' && (data as ControllerNodeData).role === 'client';

  if (data.type === 'controller') {
    const controllerData = data as ControllerNodeData;
    displayLabel = controllerData.label || '主控';
    if (controllerData.role === 'server') displayLabel += ' (服务)';
    else if (controllerData.role === 'client') displayLabel += ' (客户)';
    
    subText = controllerData.apiName || '未知API';

    if (isControllerClientRole && isExpanded) {
      detailsContent = (
        <>
          <div className="text-[9px] truncate" title={controllerData.tunnelAddress}>隧道: {controllerData.tunnelAddress || '未配置'}</div>
          <div className="text-[9px] truncate" title={controllerData.targetAddress}>转发: {controllerData.targetAddress || '未配置'}</div>
          <div className="text-[9px] truncate">日志: {controllerData.logLevel || 'master'}</div>
          {controllerData.managingApiName && (
              <div className="text-[9px] truncate" title={`由 ${controllerData.managingApiName} 管理`}>管理: {controllerData.managingApiName}</div>
          )}
        </>
      );
       if (!subText && controllerData.tunnelAddress) subText = controllerData.tunnelAddress;
    } else if (data.type === 'controller' && data.role !== 'client' && isExpanded) { // General or Server role controller (expanded)
       detailsContent = (
        <>
           <div className="text-[9px] truncate">API: {controllerData.apiName || 'N/A'}</div>
           {controllerData.masterDefaultLogLevel !== 'master' &&  <div className="text-[9px] truncate">默认日志: {controllerData.masterDefaultLogLevel}</div>}
           {controllerData.masterDefaultTlsMode !== 'master' &&  <div className="text-[9px] truncate">默认TLS: {controllerData.masterDefaultTlsMode}</div>}
        </>
      );
    }
  } else if (isExpanded) {
    switch (data.type) {
      case 'client':
        const clientData = data as ClientNodeData;
        subText = clientData.tunnelAddress || '未配置服务端';
        detailsContent = (
          <>
            <div className="text-[9px] truncate">隧道: {clientData.tunnelAddress}</div>
            <div className="text-[9px] truncate">转发: {clientData.targetAddress}</div>
            {clientData.managingApiName && (
              <div className="text-[9px] truncate" title={`由 ${clientData.managingApiName} 管理`}>管理: {clientData.managingApiName}</div>
            )}
          </>
        );
        break;
      case 'server':
        const serverData = data as ServerNodeData;
        subText = serverData.tunnelAddress || '未配置隧道';
        detailsContent = (
          <>
            <div className="text-[9px] truncate">隧道: {serverData.tunnelAddress}</div>
            <div className="text-[9px] truncate">转发: {serverData.targetAddress}</div>
            <div className="text-[9px] truncate">TLS: {serverData.tlsMode}</div>
            {serverData.managingApiName && (
              <div className="text-[9px] truncate" title={`由 ${serverData.managingApiName} 管理`}>管理: {serverData.managingApiName}</div>
            )}
          </>
        );
        break;
      case 'landing':
        const landingData = data as LandingNodeData;
        subText = ((landingData.landingIp && landingData.landingPort) ? 
          `${landingData.landingIp}:${landingData.landingPort}` : '未配置IP/端口');
        detailsContent = (
          <>
            <div className="text-[9px] truncate">IP: {landingData.landingIp || 'N/A'}</div>
            <div className="text-[9px] truncate">端口: {landingData.landingPort || 'N/A'}</div>
            {landingData.managingApiName && (
              <div className="text-[9px] truncate" title={`上游主控: ${landingData.managingApiName}`}>主控: {landingData.managingApiName}</div>
            )}
          </>
        );
        break;
      case 'user':
        const userData = data as UserNodeData;
        subText = userData.description || '未描述';
        detailsContent = (
          <div className="text-[9px] truncate">描述: {userData.description || 'N/A'}</div>
        );
        break;
    }
  }

  const baseBorderClass = getNodeBorderColorClass(data.type, false, data.isChainHighlighted, data.statusInfo);
  const backgroundClass = selected ? getSelectedNodeBgClass(data.type) : "bg-card";
  const mainTextColorClass = selected ? "text-primary-foreground" : "text-card-foreground";
  const iconFinalColorClass = selected ? "text-primary-foreground" : getNodeIconColorClass(data.type);
  const subTextFinalColorClass = selected ? "text-primary-foreground/80" : "text-muted-foreground";

  let statusInfoFinalColorClass = '';
  let statusInfoInlineStyle = {};
  if (data.statusInfo) {
    if (selected) {
      statusInfoFinalColorClass = 'text-primary-foreground/90';
    } else {
      statusInfoInlineStyle = { color: data.statusInfo.includes('失败') ? 'hsl(var(--destructive))' : 'hsl(var(--chart-2))' };
    }
  }
  
  const nodeMinHeightClass = isExpanded ? "min-h-[80px]" : "";


  return (
    <div
      className={cn(
        "rounded-md shadow-md flex flex-col items-center justify-center border-2",
        "py-1 px-2",
        baseBorderClass,
        backgroundClass,
        mainTextColorClass,
        nodeMinHeightClass
      )}
      style={{ // Ensure width/height from node object are applied for ELK's dynamic sizing
        width: node.width ? `${node.width}px` : undefined,
        height: node.height ? `${node.height}px` : undefined,
      }}
      data-type={data.type}
    >
      <div className="flex items-center text-[11px] font-medium mb-0.5 w-full">
        {Icon && <Icon className={cn("h-3.5 w-3.5 mr-1 shrink-0", iconFinalColorClass)} />}
        <span className="truncate" title={displayLabel}>{displayLabel}</span>
        {data.type !== 'user' && ( // User nodes are not expandable as they have no children or specific operational details
          <span className="ml-auto">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </span>
        )}
      </div>

      {subText && <div className={cn("text-[9px] truncate w-full text-center", subTextFinalColorClass)} title={subText}>{subText}</div>}
      
      {isExpanded && detailsContent && (
        <div className="mt-1 w-full space-y-0.5 border-t border-border/30 pt-1">
          {detailsContent}
        </div>
      )}

      {data.statusInfo && (
        <div 
          className={cn("text-[8px] font-semibold mt-0.5 w-full text-center", statusInfoFinalColorClass)}
          style={statusInfoInlineStyle}
        >
          {data.statusInfo}
        </div>
      )}

      {/* Controller (server/general role) output port */}
      {data.type === 'controller' && (data as ControllerNodeData).role !== 'client' && (
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-primary hover:!border-primary-foreground transition-all cursor-grab shadow-md"
          style={{ right: '-6px', top: '50%', transform: 'translateY(-50%)' }}
        />
      )}
      
      {/* Controller (client role) input and output ports */}
      {data.type === 'controller' && (data as ControllerNodeData).role === 'client' && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="input"
            className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-primary hover:!border-primary-foreground transition-all cursor-grab shadow-md"
            style={{ left: '-6px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="output" 
            className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-primary hover:!border-primary-foreground transition-all cursor-grab shadow-md"
            style={{ right: '-6px', top: '50%', transform: 'translateY(-50%)' }}
          />
        </>
      )}

      {/* Server input and output ports */}
      {data.type === 'server' && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="input"
            className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-primary hover:!border-primary-foreground transition-all cursor-grab shadow-md"
            style={{ left: '-6px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="output"
            className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-primary hover:!border-primary-foreground transition-all cursor-grab shadow-md"
            style={{ right: '-6px', top: '50%', transform: 'translateY(-50%)' }}
          />
        </>
      )}

      {/* Client input and output ports */}
      {data.type === 'client' && (
         <>
          <Handle
            type="target"
            position={Position.Left}
            id="input"
            className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-primary hover:!border-primary-foreground transition-all cursor-grab shadow-md"
            style={{ left: '-6px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="output" 
            className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-primary hover:!border-primary-foreground transition-all cursor-grab shadow-md"
            style={{ right: '-6px', top: '50%', transform: 'translateY(-50%)' }}
          />
        </>
      )}

      {/* Landing input port */}
      {data.type === 'landing' && (
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-primary hover:!border-primary-foreground transition-all cursor-grab shadow-md"
          style={{ left: '-6px', top: '50%', transform: 'translateY(-50%)' }}
        />
      )}
      
      {/* User source output port - NOTE: User nodes are currently not selectable/draggable to canvas based on other requirements */}
      {data.type === 'user' && (
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-primary hover:!border-primary-foreground transition-all cursor-grab shadow-md"
          style={{ right: '-6px', top: '50%', transform: 'translateY(-50%)' }}
        />
      )}
    </div>
  );
});

NodePassFlowNode.displayName = 'NodePassFlowNode';

export default NodePassFlowNode;
