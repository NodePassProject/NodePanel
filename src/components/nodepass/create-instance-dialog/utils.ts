
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
  instanceType: "入口(c)" | "出口(s)";
  isSingleEndedForward?: boolean; // Added to indicate the mode
  tunnelAddress: string; // If single-ended client, this is ':localPort'. Otherwise host:port or port.
  targetAddress: string; // If single-ended client, this is 'remoteHost:remotePort'. Otherwise, localForwardPort or serverTarget.
  logLevel: MasterLogLevel;
  tlsMode?: MasterTlsMode | '2'; 
  certPath?: string;
  keyPath?: string;
}, activeApiConfig: NamedApiConfig | null): string { 
  const schemeType = params.instanceType === "出口(s)" ? "server" : "client";
  
  // For single-ended client, tunnelAddress is already formatted as ":port" by the dialog logic
  // and targetAddress is the full remote destination.
  // For other cases, tunnelAddress and targetAddress are as they were.
  let url = `${schemeType}://${params.tunnelAddress}/${params.targetAddress}`;
  
  const queryParams = new URLSearchParams();

  if (params.logLevel && params.logLevel !== "master") {
    queryParams.append('log', params.logLevel);
  }

  // TLS settings apply to 'server' type, or 'client' type if it's single-ended (connecting to target)
  // or if it's a client connecting to an auto-created server (where TLS is defined for that server).
  // For a client connecting to an *existing* server, the TLS mode in the form dictates the client's behavior
  // but the server's TLS is already fixed. The URL query params for TLS (crt, key) are for the *server* side.
  // So, only add tls, crt, key if we are defining a server OR a single-ended client where it might be acting as a simple mTLS client.
  
  let applyServerLikeTlsParams = schemeType === 'server';
  if (schemeType === 'client' && params.isSingleEndedForward) {
      applyServerLikeTlsParams = true; // Single-ended client can have its own certs for mTLS to target
  }
  // If it's a client that auto-created a server, the TLS params are for that *server*.
  // The CreateInstanceDialog handles passing the correct tlsMode for the server instance.
  // This utility just builds the URL with what it's given.

  if (applyServerLikeTlsParams) {
    let effectiveTlsMode = params.tlsMode;

    if (effectiveTlsMode === 'master') {
      if (activeApiConfig?.masterDefaultTlsMode && activeApiConfig.masterDefaultTlsMode !== 'master') {
        effectiveTlsMode = activeApiConfig.masterDefaultTlsMode;
      } else {
        effectiveTlsMode = schemeType === 'server' ? '1' : '0'; // Default for server is 1, for client (single-ended) is 0
      }
    }
    
    if (effectiveTlsMode && effectiveTlsMode !== "master") { 
      queryParams.append('tls', effectiveTlsMode);
      if (effectiveTlsMode === '2') {
        if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
        if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
      }
    }
  } else if (schemeType === 'client' && !params.isSingleEndedForward) { // Client connecting to existing or auto-created server
     // TLS mode on client side dictates connection behavior, not server-side params in URL usually.
     // However, if user explicitly sets TLS '2' for a client form, and provides cert/key,
     // it implies mTLS. NodePass client supports `tls=2&crt=...&key=...` for mTLS.
    let effectiveClientTlsMode = params.tlsMode;
    if (effectiveClientTlsMode === 'master') {
        // Default client connection is non-TLS unless master default says otherwise (rare for client)
        // or if it's connecting to a known secure endpoint. Let's assume '0' if master default is not set.
        effectiveClientTlsMode = (activeApiConfig?.masterDefaultTlsMode && activeApiConfig.masterDefaultTlsMode !== 'master')
                                    ? activeApiConfig.masterDefaultTlsMode
                                    : '0'; 
    }
    if (effectiveClientTlsMode && effectiveClientTlsMode !== "master") {
        queryParams.append('tls', effectiveClientTlsMode);
        if (effectiveClientTlsMode === '2') {
            if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
            if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
        }
    }
  }

  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}
