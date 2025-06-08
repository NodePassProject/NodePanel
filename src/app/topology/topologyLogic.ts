
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
  }

  const serverListenHost = extractHostname(serverNodeData.tunnelAddress || "");
  const serverListenPort = extractPort(serverNodeData.tunnelAddress || ""); // If only port provided for server, tunnelAddress is port

  let clientEffectiveTunnelHost = serverListenHost;

  if (serverListenHost && isWildcardHostname(serverListenHost) && masterApiHost && masterApiHost.trim() !== "") {
    clientEffectiveTunnelHost = masterApiHost;
  } else if (serverListenHost && !isWildcardHostname(serverListenHost)) {
    // Use server's specific IP
  } else if (!serverListenHost && masterApiHost && masterApiHost.trim() !== "") {
    clientEffectiveTunnelHost = masterApiHost;
  }

  if (serverListenPort && clientEffectiveTunnelHost && clientEffectiveTunnelHost.trim() !== "") {
    return `${formatHostForUrl(clientEffectiveTunnelHost)}:${serverListenPort}`;
  }
  
  // Fallback if port or host couldn't be determined for construction, return original or empty.
  // This case might happen if serverNodeData.tunnelAddress is only a port number.
  if (serverListenPort && (!clientEffectiveTunnelHost || clientEffectiveTunnelHost.trim() === "")) {
    // If we have a port but no host, it implies a local server, usually represented as [::]:port or 0.0.0.0:port
    // However, for a client connecting, this isn't enough.
    // If the original tunnelAddress was just a port, this function might not be able to resolve it to a full address
    // without more context or assumptions. Returning the original tunnelAddress in such edge cases.
    return serverNodeData.tunnelAddress || "";
  }
  
  return serverNodeData.tunnelAddress || "";
}

