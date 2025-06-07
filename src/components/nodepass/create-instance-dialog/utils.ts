
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
  instanceType: "入口(c)" | "出口(s)"; // Updated to use new terminology
  tunnelAddress: string;
  targetAddress: string;
  logLevel: MasterLogLevel;
  tlsMode?: MasterTlsMode | '2'; 
  certPath?: string;
  keyPath?: string;
}, activeApiConfig: NamedApiConfig | null): string { 
  const schemeType = params.instanceType === "出口(s)" ? "server" : "client"; // Map to API expected values
  let url = `${schemeType}://${params.tunnelAddress}/${params.targetAddress}`;
  const queryParams = new URLSearchParams();

  if (params.logLevel && params.logLevel !== "master") {
    queryParams.append('log', params.logLevel);
  }

  if (schemeType === 'server') { // Use mapped schemeType for logic
    let effectiveTlsMode = params.tlsMode;

    if (effectiveTlsMode === 'master') {
      if (activeApiConfig?.masterDefaultTlsMode && activeApiConfig.masterDefaultTlsMode !== 'master') {
        effectiveTlsMode = activeApiConfig.masterDefaultTlsMode;
      } else {
        effectiveTlsMode = '1'; 
      }
    }
    
    if (effectiveTlsMode && effectiveTlsMode !== "master") { 
      queryParams.append('tls', effectiveTlsMode);
      if (effectiveTlsMode === '2') {
        if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
        if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
      }
    }
  }
  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}

