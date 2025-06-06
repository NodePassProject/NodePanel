
"use client";

import type { CreateInstanceFormValues } from '@/zod-schemas/nodepass';
import type { MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';


export function formatHostForUrl(host: string | null | undefined): string {
  if (!host) return '127.0.0.1'; // Default or handle as appropriate
  // Check if it's an IPv6 address and not already bracketed
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }
  return host;
}

export function buildUrlFromFormValues(params: {
  instanceType: 'server' | 'client';
  tunnelAddress: string;
  targetAddress: string;
  logLevel: MasterLogLevel;
  tlsMode?: MasterTlsMode | '2'; // Make tlsMode optional as it's not always used by client
  certPath?: string;
  keyPath?: string;
}): string {
  let url = `${params.instanceType}://${params.tunnelAddress}/${params.targetAddress}`;
  const queryParams = new URLSearchParams();

  if (params.logLevel && params.logLevel !== "master") {
    queryParams.append('log', params.logLevel);
  }

  // Only add TLS parameters if the instance type is server
  if (params.instanceType === 'server') {
    if (params.tlsMode && params.tlsMode !== "master") {
      queryParams.append('tls', params.tlsMode);
      if (params.tlsMode === '2') {
        if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
        if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
      }
    }
  }
  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}
