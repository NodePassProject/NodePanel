
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
  tlsMode?: MasterTlsMode | '2' | undefined; // For Server. For Single-Ended Client (connects to target). For Client (connects to server).
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

  let effectiveTlsMode = params.tlsMode;

  // For Server (出口(s))
  if (params.instanceType === "出口(s)") {
    if (effectiveTlsMode === 'master' || !effectiveTlsMode) {
      effectiveTlsMode = (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master')
                            ? masterConfigForInstance.masterDefaultTlsMode
                            : '1'; // Server defaults to TLS 1
    }
    // Append server TLS params if needed
    if (effectiveTlsMode === '0' || effectiveTlsMode === '2') {
      queryParams.append('tls', effectiveTlsMode);
      if (effectiveTlsMode === '2') {
        if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
        if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
      }
    }
  }
  // For Client (入口(c))
  else if (params.instanceType === "入口(c)") {
    if (params.isSingleEndedForward) {
      // Single-ended client: NO TLS parameters in the URL.
      // The connection to the remote target is plain TCP/TLS handled by the application the client forwards to.
      // NodePass client scheme's tls params are for client-to-NodePass-server connection.
    } else {
      // Normal client connecting to a NodePass server
      if (effectiveTlsMode === 'master' || !effectiveTlsMode) {
          effectiveTlsMode = (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master')
                                  ? masterConfigForInstance.masterDefaultTlsMode
                                  : '0'; // Client defaults to TLS 0 if master does not specify for client-server connection
      }
      // Append client TLS params if needed (for connecting to NodePass server)
      if (effectiveTlsMode === '1' || effectiveTlsMode === '2') {
          queryParams.append('tls', effectiveTlsMode);
          if (effectiveTlsMode === '2') { // Client mTLS
              if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
              if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
          }
      }
    }
  }

  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}


interface PrepareClientUrlParamsResult {
  clientParams: BuildUrlParams;
}

export function prepareClientUrlParams(
  values: CreateInstanceFormValues,
  activeApiConfig: NamedApiConfig | null, // Master for the client instance itself
  onLogLocal: (message: string, type: 'INFO' | 'WARN' | 'ERROR') => void
): PrepareClientUrlParamsResult | null {
  if (!activeApiConfig) {
    onLogLocal('当前客户端主控配置无效，无法准备客户端参数。', 'ERROR');
    return null;
  }

  let clientParams: BuildUrlParams;

  const clientLogLevel = values.logLevel;
  const clientTlsParamFromForm = values.tlsMode as MasterTlsMode | '2' | undefined; // Can be undefined if hidden
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
      tlsMode: '0', // Effectively no TLS for URL building for single-ended
      certPath: '', // Not used for single-ended URL
      keyPath: '', // Not used for single-ended URL
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
