
'use client';

import type { CustomNodeData, Node } from './topologyTypes';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { extractHostname, extractPort, isWildcardHostname, formatHostForUrl } from '@/lib/url-utils';

// Helper function to determine the effective master config for a server node
export function getEffectiveServerMasterConfig(
  serverNodeData: CustomNodeData,
  getNodeById: (id: string) => Node | undefined,
  getApiConfigById: (id: string) => NamedApiConfig | null
): NamedApiConfig | null {
  if (serverNodeData.representedMasterId) {
    return getApiConfigById(serverNodeData.representedMasterId);
  }
  if (serverNodeData.parentNode) {
    const parentMNode = getNodeById(serverNodeData.parentNode);
    if (parentMNode && parentMNode.data.masterId) {
      return getApiConfigById(parentMNode.data.masterId);
    }
  }
  return null;
}

// Helper function to calculate the client's tunnel address when connecting to a server
export function calculateClientTunnelAddressForServer(
  serverNodeData: CustomNodeData,
  effectiveServerMasterConfig: NamedApiConfig | null
): string {
  let masterApiHost: string | null = null;
  if (effectiveServerMasterConfig?.apiUrl) {
    masterApiHost = extractHostname(effectiveServerMasterConfig.apiUrl);
  } else {
    console.warn(`Cannot determine master API host for server ${serverNodeData.label}: effectiveServerMasterConfig or its apiUrl is missing.`);
  }

  const serverListenHost = extractHostname(serverNodeData.tunnelAddress || "");
  const serverListenPort = extractPort(serverNodeData.tunnelAddress || "");

  if (!serverListenPort) {
    console.warn(`Cannot determine listen port for server ${serverNodeData.label} from tunnelAddress: ${serverNodeData.tunnelAddress}`);
    return ""; // Cannot form address without a port
  }

  let clientEffectiveTunnelHost = serverListenHost;

  if (serverListenHost && isWildcardHostname(serverListenHost)) {
    if (masterApiHost && masterApiHost.trim() !== "") {
      clientEffectiveTunnelHost = masterApiHost;
    } else {
      // Server listening on wildcard, but master API host is unknown. Client cannot connect reliably.
      console.warn(`Server ${serverNodeData.label} listens on wildcard, but its master API host is unknown. Cannot form reliable client tunnel address.`);
      return "";
    }
  } else if (serverListenHost && !isWildcardHostname(serverListenHost)) {
    // Server listens on a specific IP, client should use that.
    // clientEffectiveTunnelHost is already serverListenHost.
  } else if (!serverListenHost) { // serverListenHost is null or empty (e.g. tunnelAddress was just ":port")
    if (masterApiHost && masterApiHost.trim() !== "") {
      clientEffectiveTunnelHost = masterApiHost;
    } else {
      // Server listen address has no host, and master API host is unknown.
      console.warn(`Server ${serverNodeData.label} listen address has no host part, and its master API host is unknown. Cannot form client tunnel address.`);
      return "";
    }
  }
  // At this point, clientEffectiveTunnelHost should be determined if possible.

  if (clientEffectiveTunnelHost && clientEffectiveTunnelHost.trim() !== "") {
    return `${formatHostForUrl(clientEffectiveTunnelHost)}:${serverListenPort}`;
  }
  
  // Fallback: if clientEffectiveTunnelHost is still empty or null, something went wrong.
  console.warn(`Failed to determine a valid host for client tunnel address to server ${serverNodeData.label}.`);
  return ""; 
}
