
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

export interface BuildUrlParams {
  instanceType: "入口(c)" | "出口(s)";
  isSingleEndedForward?: boolean;
  tunnelAddress: string; 
  targetAddress: string; 
  logLevel: MasterLogLevel;
  tlsMode?: MasterTlsMode | '2'; 
  certPath?: string;
  keyPath?: string;
}

export function buildUrlFromFormValues(
  params: BuildUrlParams, 
  masterConfigForInstance: NamedApiConfig | null // The master where this specific instance (client or server) will be created
): string { 
  const schemeType = params.instanceType === "出口(s)" ? "server" : "client";
  
  let url = `${schemeType}://${params.tunnelAddress}/${params.targetAddress}`;
  
  const queryParams = new URLSearchParams();

  if (params.logLevel && params.logLevel !== "master") {
    queryParams.append('log', params.logLevel);
  }
  
  let applyServerLikeTlsParams = schemeType === 'server';
  if (schemeType === 'client' && params.isSingleEndedForward) {
      applyServerLikeTlsParams = true; 
  }

  if (applyServerLikeTlsParams) {
    let effectiveTlsMode = params.tlsMode;

    if (effectiveTlsMode === 'master') {
      // Use the masterDefaultTlsMode of the master where THIS instance is being created
      if (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master') {
        effectiveTlsMode = masterConfigForInstance.masterDefaultTlsMode;
      } else {
        // Fallback defaults if master's default is 'master' or not set
        effectiveTlsMode = schemeType === 'server' ? '1' : '0'; 
      }
    }
    
    if (effectiveTlsMode && effectiveTlsMode !== "master") { 
      queryParams.append('tls', effectiveTlsMode);
      if (effectiveTlsMode === '2') {
        if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
        if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
      }
    }
  } else if (schemeType === 'client' && !params.isSingleEndedForward) { 
    let effectiveClientTlsMode = params.tlsMode;
    if (effectiveClientTlsMode === 'master') {
        effectiveClientTlsMode = (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master')
                                    ? masterConfigForInstance.masterDefaultTlsMode
                                    : '0'; 
    }
    if (effectiveClientTlsMode && effectiveClientTlsMode !== "master") {
        queryParams.append('tls', effectiveClientTlsMode);
        if (effectiveClientTlsMode === '2') { // Client mTLS
            if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
            if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
        }
    }
  }

  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}

