
"use client";

import type { CreateInstanceFormValues } from '@/zod-schemas/nodepass';
import type { NamedApiConfig, MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';
import { extractHostname, extractPort, isWildcardHostname } from '@/lib/url-utils';

export function formatHostForUrl(host: string | null | undefined): string {
  if (!host) return '127.0.0.1'; 
  if (host.includes(':') && !host.startsWith('[')) { // IPv6 check
    return `[${host}]`; // Bracket IPv6 addresses for URLs
  }
  return host;
}

export interface BuildUrlParams {
  instanceType: "入口(c)" | "出口(s)";
  isSingleEndedForward?: boolean; // Relevant for client
  tunnelAddress: string; // For Server: listen. For Client: server's listen (remote). For Single-Ended Client: local listen port.
  targetAddress: string; // For Server: forward. For Client: local forward. For Single-Ended Client: remote target.
  logLevel: MasterLogLevel;
  tlsMode?: MasterTlsMode | '2'; // For Server. For Single-Ended Client (connects to target). For Client (connects to server).
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

  // Apply Log Level
  let effectiveLogLevel = params.logLevel;
  if (effectiveLogLevel === 'master') {
    effectiveLogLevel = masterConfigForInstance?.masterDefaultLogLevel || 'master'; // Use master's default if it's set and not 'master'
  }
  if (effectiveLogLevel && effectiveLogLevel !== "master") { // Only append if not 'master' (which means inherit from NodePass global default)
    queryParams.append('log', effectiveLogLevel);
  }
  
  // Determine if server-like TLS params should be applied
  // Server always applies server-like TLS.
  // Client in single-ended mode applies server-like TLS (for its connection to the remote target).
  // Client in normal mode applies client-like TLS (for its connection to the NodePass server).
  let applyServerLikeTlsParams = schemeType === 'server' || (schemeType === 'client' && !!params.isSingleEndedForward);

  if (applyServerLikeTlsParams) {
    let effectiveTlsMode = params.tlsMode;

    // Resolve 'master' TLS mode to actual value from master config or default to '1' for server, '0' for client (single-ended acts like server here)
    if (effectiveTlsMode === 'master' || !effectiveTlsMode) {
      if (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master') {
        effectiveTlsMode = masterConfigForInstance.masterDefaultTlsMode;
      } else {
        effectiveTlsMode = '1'; // Default for server-like TLS if master doesn't specify
      }
    }
    
    // Append TLS param if not 'master' (which means inherit from NodePass global default, or effectively '1' if server)
    // NodePass server defaults to TLS 1 if no tls param. So we only need to append if it's 0 or 2.
    if (effectiveTlsMode === '0' || effectiveTlsMode === '2') { 
      queryParams.append('tls', effectiveTlsMode);
      if (effectiveTlsMode === '2') {
        if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
        if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
      }
    }
  } else if (schemeType === 'client' && !params.isSingleEndedForward) { 
    // Normal client connecting to a NodePass server
    let effectiveClientTlsMode = params.tlsMode;
    if (effectiveClientTlsMode === 'master' || !effectiveClientTlsMode) {
        effectiveClientTlsMode = (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master')
                                    ? masterConfigForInstance.masterDefaultTlsMode
                                    : '0'; // Client defaults to '0' (no TLS) if master does not specify
    }
    // Append TLS param if not 'master' (which means inherit from NodePass global default, or effectively '0' if client)
    // NodePass client defaults to TLS 0 if no tls param. So we only need to append if it's 1 or 2.
    if (effectiveClientTlsMode === '1' || effectiveClientTlsMode === '2') {
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


interface PrepareClientUrlParamsResult {
  clientParams: BuildUrlParams;
  // serverParamsForAutoCreate and serverMasterForAutoCreate removed
}

export function prepareClientUrlParams(
  values: CreateInstanceFormValues,
  activeApiConfig: NamedApiConfig | null, // Master for the client instance itself
  getApiConfigById: (id: string) => NamedApiConfig | null, // No longer needed here
  onLogLocal: (message: string, type: 'INFO' | 'WARN' | 'ERROR') => void
): PrepareClientUrlParamsResult | null {
  if (!activeApiConfig) {
    onLogLocal('当前客户端主控配置无效，无法准备客户端参数。', 'ERROR');
    return null;
  }

  let clientParams: BuildUrlParams;

  const clientLogLevel = values.logLevel;
  const clientTlsParamFromForm = values.tlsMode as MasterTlsMode | '2'; 
  const clientCertPath = values.certPath;
  const clientKeyPath = values.keyPath;

  if (values.isSingleEndedForward) {
    const localListenPort = values.tunnelAddress; 
    const remoteTargetAddress = values.targetAddress;

    if (!remoteTargetAddress) {
      onLogLocal("单端转发模式下，目标地址 (业务数据) 是必需的。", "ERROR");
      return null;
    }
    if (!localListenPort || !/^[0-9]+$/.test(localListenPort)) {
      onLogLocal("单端转发模式下，本地监听端口无效。", "ERROR");
      return null;
    }

    clientParams = {
      instanceType: "入口(c)",
      isSingleEndedForward: true,
      tunnelAddress: `[::]:${localListenPort}`, 
      targetAddress: remoteTargetAddress,       
      logLevel: clientLogLevel,
      tlsMode: clientTlsParamFromForm, 
      certPath: clientCertPath,
      keyPath: clientKeyPath,
    };
  } else {
    // 入口(c) - 连接到已存在的出口(s)
    const connectToServerTunnel = values.tunnelAddress; 
    const clientLocalTargetPort = values.targetAddress; 

    if (!connectToServerTunnel) {
      onLogLocal("连接到现有出口(s)时，出口(s)隧道地址是必需的。", "ERROR");
      return null;
    }
    
    let clientFullLocalForwardTargetAddress = `[::]:${(parseInt(extractPort(connectToServerTunnel) || "0", 10) + 1).toString()}`; // Default
    if (clientLocalTargetPort && clientLocalTargetPort.trim() !== "" && /^[0-9]+$/.test(clientLocalTargetPort.trim())) {
      clientFullLocalForwardTargetAddress = `[::]:${clientLocalTargetPort.trim()}`;
    }

    clientParams = {
      instanceType: "入口(c)",
      isSingleEndedForward: false,
      tunnelAddress: connectToServerTunnel,
      targetAddress: clientFullLocalForwardTargetAddress,
      logLevel: clientLogLevel,
      tlsMode: clientTlsParamFromForm, 
      certPath: clientCertPath,
      keyPath: clientKeyPath,
    };
  }
  return { clientParams };
}


interface PrepareServerUrlParamsResult {
  serverParams: BuildUrlParams;
}

export function prepareServerUrlParams(
  values: CreateInstanceFormValues,
  onLogLocal: (message: string, type: 'INFO' | 'WARN' | 'ERROR') => void
): PrepareServerUrlParamsResult | null {
  const serverTunnelAddress = values.tunnelAddress; 
  const serverTargetAddress = values.targetAddress; 

  if (!serverTargetAddress) {
    onLogLocal("创建出口(s)时，目标地址 (业务数据) 是必需的。", "ERROR");
    return null;
  }
  if (!serverTunnelAddress) {
    onLogLocal("创建出口(s)时，隧道监听地址是必需的。", "ERROR");
    return null;
  }

  const serverParams: BuildUrlParams = {
    instanceType: "出口(s)",
    tunnelAddress: serverTunnelAddress,
    targetAddress: serverTargetAddress,
    logLevel: values.logLevel,
    tlsMode: values.tlsMode as MasterTlsMode | '2', 
    certPath: values.certPath,
    keyPath: values.keyPath,
  };
  return { serverParams };
}
