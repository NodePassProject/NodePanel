
'use client';

import type { CustomNodeData, Node } from './topologyTypes';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { extractHostname, isWildcardHostname, formatHostForUrl } from '@/lib/url-utils';

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
  const serverListenPort = extractHostname(serverNodeData.tunnelAddress || "") ? extractPort(serverNodeData.tunnelAddress || "") : serverNodeData.tunnelAddress; // If only port provided for server, tunnelAddress is port

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
  
  return serverNodeData.tunnelAddress || "";
}
