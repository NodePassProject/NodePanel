
"use client";

import type { CreateInstanceFormValues } from '@/zod-schemas/nodepass';
import type { NamedApiConfig, MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';

export function formatHostForUrl(host: string | null | undefined): string {
  if (!host) return '127.0.0.1'; 
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
  tlsMode?: MasterTlsMode | '2'; // tlsMode from form
  certPath?: string;
  keyPath?: string;
}, activeApiConfig: NamedApiConfig | null): string { // Added activeApiConfig
  let url = `${params.instanceType}://${params.tunnelAddress}/${params.targetAddress}`;
  const queryParams = new URLSearchParams();

  if (params.logLevel && params.logLevel !== "master") {
    queryParams.append('log', params.logLevel);
  }

  if (params.instanceType === 'server') {
    let effectiveTlsMode = params.tlsMode;

    if (effectiveTlsMode === 'master') {
      if (activeApiConfig?.masterDefaultTlsMode && activeApiConfig.masterDefaultTlsMode !== 'master') {
        effectiveTlsMode = activeApiConfig.masterDefaultTlsMode;
      } else {
        effectiveTlsMode = '1'; // Default to '1' (self-signed) for servers if master default is also 'master' or undefined
      }
    }
    
    if (effectiveTlsMode && effectiveTlsMode !== "master") { // Should not be master after resolution
      queryParams.append('tls', effectiveTlsMode);
      if (effectiveTlsMode === '2') {
        // Cert/Key paths are taken directly from params, which should be from the form
        if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
        if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
      }
    }
  }
  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}

