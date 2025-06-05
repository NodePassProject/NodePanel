
import { CogIcon, ServerIcon, SmartphoneIcon, Globe, UserCircle2, Network } from 'lucide-react';
import type { TopologyNodeData, ServerNodeData, ClientNodeData, LandingNodeData, UserNodeData, ControllerNodeData } from './topology-types';
import type { Node, Edge } from 'reactflow';
import type { MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';

let nodeIdCounter = 0;
export const getId = (prefix = 'npnode_') => `${prefix}${nodeIdCounter++}_${Date.now()}`;

export const getNodeIcon = (nodeType: TopologyNodeData['type'] | undefined): React.ElementType => {
    switch (nodeType) {
        case 'controller': return CogIcon;
        case 'server': return ServerIcon;
        case 'client': return SmartphoneIcon;
        case 'landing': return Globe;
        case 'user': return UserCircle2;
        default: return Network;
    }
};

export const getNodeIconColorClass = (nodeType: TopologyNodeData['type'] | undefined): string => {
    switch (nodeType) {
        case 'controller': return 'text-yellow-500';
        case 'server': return 'text-primary';
        case 'client': return 'text-accent';
        case 'landing': return 'text-purple-500';
        case 'user': return 'text-green-500';
        default: return 'text-muted-foreground';
    }
};

export const getNodeBorderColorClass = (nodeType: TopologyNodeData['type'] | undefined, selected: boolean = false, isChainHighlighted: boolean = false, statusInfo?: string): string => {
    if (statusInfo?.includes('失败')) return 'border-destructive ring-1 ring-destructive/50';
    if (statusInfo?.includes('已提交')) return 'border-green-500 ring-1 ring-green-400/50';
    if (isChainHighlighted && !selected) return 'border-green-500 ring-1 ring-green-400/50';

    switch (nodeType) {
        case 'controller': return 'border-yellow-500';
        case 'server': return 'border-primary';
        case 'client': return 'border-accent';
        case 'landing': return 'border-purple-500';
        case 'user': return 'border-green-500';
        default: return 'border-border';
    }
};

export const getSelectedNodeBgClass = (nodeType: TopologyNodeData['type'] | undefined): string => {
    switch (nodeType) {
        case 'controller': return 'bg-yellow-500';
        case 'server': return 'bg-primary';
        case 'client': return 'bg-accent';
        case 'landing': return 'bg-purple-500';
        case 'user': return 'bg-green-500';
        default: return 'bg-muted';
    }
};


export function extractHostname(urlOrHostPort: string): string | null {
  if (!urlOrHostPort) return null;
  try {
    const fullUrl = urlOrHostPort.includes('://') ? urlOrHostPort : `http://${urlOrHostPort}`;
    const url = new URL(fullUrl);
    return url.hostname.replace(/^\[|\]$/g, '');
  } catch (e) {
    const parts = urlOrHostPort.split(':');
    if (parts.length > 0) {
        let hostCandidate = parts[0];
        // Handle IPv6 address in brackets without a scheme
        if (urlOrHostPort.includes('[') && urlOrHostPort.includes(']')) {
            const match = urlOrHostPort.match(/^\[(.*?)\]/);
            if (match && match[1]) {
                hostCandidate = match[1];
            }
        }
        return hostCandidate.length > 0 ? hostCandidate : null;
    }
    return null;
  }
}

export function extractPort(addressWithPort: string): string | null {
  if (!addressWithPort) return null;
  try {
    // If it has a scheme, use URL parser
    if (addressWithPort.includes('://')) {
      const url = new URL(addressWithPort);
      return url.port || null;
    }
    // Otherwise, simple split for host:port or [ipv6]:port
    const lastColonIndex = addressWithPort.lastIndexOf(':');
    // Ensure colon is not part of an IPv6 address without brackets if there's no scheme
    // And ensure it's not the only character or the first character
    if (lastColonIndex !== -1 && lastColonIndex < addressWithPort.length - 1 && lastColonIndex > 0) {
      // Check if the part before the last colon contains other colons (likely IPv6)
      // and if it's not enclosed in brackets
      const hostPart = addressWithPort.substring(0, lastColonIndex);
      if (hostPart.includes(':') && !(hostPart.startsWith('[') && hostPart.endsWith(']'))) {
         // This could be an IPv6 address without brackets where lastColonIndex is for the port
         // or it could be an IPv6 address where lastColonIndex is part of the address.
         // This heuristic might not be perfect without scheme.
         // For [ipv6]:port, this works. For ipv6:port, it assumes the last segment is port.
      }
      const portCandidate = addressWithPort.substring(lastColonIndex + 1);
      if (/^\d+$/.test(portCandidate)) {
        return portCandidate;
      }
    }
    return null; // No port found or invalid format
  } catch (e) {
    // Fallback for cases where URL constructor fails (e.g. "0.0.0.0:1234")
    const parts = addressWithPort.split(':');
     if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart)) {
        return lastPart;
      }
    }
    return null;
  }
}

export function isTunnelPortWildcard(host: string | null): boolean {
  return host === '0.0.0.0' || host === '::';
}


export function buildNodePassUrlFromNode(
  instanceNode: Node<ServerNodeData | ClientNodeData | TopologyNodeData>,
  allNodesInner: Node<TopologyNodeData>[],
  allEdgesInner: Edge[]
): string | null {
  const { data } = instanceNode;
  if (!data || !data.type || data.type === 'landing' || data.type === 'user' || data.type === 'controller') return null;

  const typedData = data as ServerNodeData | ClientNodeData;
  if (!typedData.instanceType || !typedData.tunnelAddress || !typedData.targetAddress) return null;

  let actualTargetAddress = typedData.targetAddress;

  const landingEdge = allEdgesInner.find(edge =>
    edge.source === instanceNode.id &&
    allNodesInner.find(n => n.id === edge.target)?.data?.type === 'landing'
  );

  if (landingEdge) {
    const landingNode = allNodesInner.find(n => n.id === landingEdge.target) as Node<LandingNodeData> | undefined;
    if (landingNode?.data.landingIp && landingNode.data.landingPort) {
      let landingHost = landingNode.data.landingIp;
      if (landingHost.includes(':') && !landingHost.startsWith('[')) {
        landingHost = `[${landingHost}]`;
      }
      actualTargetAddress = `${landingHost}:${landingNode.data.landingPort}`;
    }
  }

  let url = `${typedData.instanceType}://${typedData.tunnelAddress}/${actualTargetAddress}`;
  const queryParams = new URLSearchParams();

  if (typedData.logLevel && typedData.logLevel !== "master") {
    queryParams.append('log', typedData.logLevel);
  }

  if (typedData.instanceType === 'server') {
    const serverData = typedData as ServerNodeData;
    if (serverData.tlsMode && serverData.tlsMode !== "master") {
      queryParams.append('tls', serverData.tlsMode);
      if (serverData.tlsMode === '2') {
        if (serverData.crtPath && serverData.crtPath.trim() !== '') queryParams.append('crt', serverData.crtPath.trim());
        if (serverData.keyPath && serverData.keyPath.trim() !== '') queryParams.append('key', serverData.keyPath.trim());
      }
    }
  }
  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}

interface ParsedTopologyUrlData {
  instanceType: 'server' | 'client' | null;
  tunnelAddress: string | null;
  targetAddress: string | null;
  logLevel: MasterLogLevel;
  tlsMode: MasterTlsMode | null;
  certPath: string | null;
  keyPath: string | null;
}

export function parseNodePassUrlForTopology(url: string): ParsedTopologyUrlData {
  const result: ParsedTopologyUrlData = {
    instanceType: null,
    tunnelAddress: '',
    targetAddress: '',
    logLevel: 'master',
    tlsMode: null,
    certPath: '',
    keyPath: '',
  };

  if (!url) return result;

  try {
    const schemeMatch = url.match(/^([a-zA-Z]+):\/\//);
    if (schemeMatch && (schemeMatch[1] === 'server' || schemeMatch[1] === 'client')) {
      result.instanceType = schemeMatch[1] as 'server' | 'client';
    } else {
      console.warn("Could not parse instance type from URL for topology:", url);
      // Fallback heuristic: if 'tls' param exists, assume server, else client.
      // This is imperfect but might cover some edge cases where scheme is missing/malformed.
      if (url.includes("?tls=") || url.includes("&tls=")) {
        result.instanceType = "server";
      } else {
        result.instanceType = "client";
      }
    }

    const restOfUrl = schemeMatch ? url.substring(schemeMatch[0].length) : url;
    const parts = restOfUrl.split('?');
    const pathPart = parts[0];
    const queryPart = parts[1];

    const addresses = pathPart.split('/');
    if (addresses.length > 0) {
      result.tunnelAddress = addresses[0] || '';
    }
    if (addresses.length > 1) {
      result.targetAddress = addresses.slice(1).join('/') || '';
    }

    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      const log = params.get('log');
      if (log && ['debug', 'info', 'warn', 'error', 'fatal'].includes(log)) {
        result.logLevel = log as MasterLogLevel;
      } else {
        result.logLevel = 'master'; // Default if param is missing or invalid
      }

      if (result.instanceType === 'server') {
        const tls = params.get('tls');
        if (tls && ['0', '1', '2'].includes(tls)) {
          result.tlsMode = tls as MasterTlsMode;
        } else {
           result.tlsMode = 'master'; // Default if param is missing or invalid
        }
        if (result.tlsMode === '2') {
          result.certPath = params.get('crt') || '';
          result.keyPath = params.get('key') || '';
        }
      }
    } else {
      // Default query params if not present
      result.logLevel = 'master';
      if (result.instanceType === 'server') {
        result.tlsMode = 'master';
      }
    }
  } catch (e) {
    console.error("Error parsing NodePass URL for topology:", url, e);
    // Return partially parsed or default result on error
  }
  return result;
}

    