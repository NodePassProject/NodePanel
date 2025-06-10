
"use client";

import type { CreateInstanceFormValues } from '@/zod-schemas/nodepass';
import type { NamedApiConfig, MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';
import { extractHostname, extractPort } from '@/lib/url-utils'; // isWildcardHostname removed

export function formatHostForUrl(host: string | null | undefined): string {
  if (!host) return '127.0.0.1';
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }
  return host;
}

export interface BuildUrlParams {
  instanceType: "客户端" | "服务端";
  isSingleEndedForward?: boolean;
  tunnelAddress: string;
  targetAddress: string;
  logLevel: MasterLogLevel; // This will be 'debug', 'info', 'warn', or 'error' from the form
  tlsMode?: MasterTlsMode | '2' | undefined;
  certPath?: string;
  keyPath?: string;
}

export function buildUrlFromFormValues(
  params: BuildUrlParams,
  masterConfigForInstance: NamedApiConfig | null
): string {
  const schemeType = params.instanceType === "服务端" ? "server" : "client";

  let url = `${schemeType}://${params.tunnelAddress}/${params.targetAddress}`;

  const queryParams = new URLSearchParams();

  let effectiveLogLevel = params.logLevel;
  // If params.logLevel is one of the four explicit types, it will be used.
  // The 'master' check for effectiveLogLevel is based on masterConfig, not instance param, which is correct.
  if (effectiveLogLevel === 'master') { // This will only be true if masterConfigForInstance.masterDefaultLogLevel is 'master'
    effectiveLogLevel = masterConfigForInstance?.masterDefaultLogLevel || 'master';
  }
  // Only append log if it's not 'master' (which means inherit from NodePass global default)
  // or if it's one of the 4 explicit levels which should always be appended.
  if (effectiveLogLevel && effectiveLogLevel !== "master") {
    queryParams.append('log', effectiveLogLevel);
  }


  let effectiveTlsMode = params.tlsMode;

  if (params.instanceType === "服务端") {
    if (effectiveTlsMode === 'master' || !effectiveTlsMode) {
      effectiveTlsMode = (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master')
                            ? masterConfigForInstance.masterDefaultTlsMode
                            : '1';
    }
    if (effectiveTlsMode === '0' || effectiveTlsMode === '2') {
      queryParams.append('tls', effectiveTlsMode);
      if (effectiveTlsMode === '2') {
        if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
        if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
      }
    }
  }
  else if (params.instanceType === "客户端") {
    if (params.isSingleEndedForward) {
      // No TLS params in URL for single-ended client
    } else {
      if (effectiveTlsMode === 'master' || !effectiveTlsMode) {
          effectiveTlsMode = (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master')
                                  ? masterConfigForInstance.masterDefaultTlsMode
                                  : '0';
      }
      if (effectiveTlsMode === '1' || effectiveTlsMode === '2') {
          queryParams.append('tls', effectiveTlsMode);
          if (effectiveTlsMode === '2') {
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
  activeApiConfig: NamedApiConfig | null,
  onLogLocal: (message: string, type: 'INFO' | 'WARN' | 'ERROR') => void
): PrepareClientUrlParamsResult | null {
  if (!activeApiConfig) {
    onLogLocal('当前客户端主控配置无效，无法准备客户端参数。', 'ERROR');
    return null;
  }

  let clientParams: BuildUrlParams;

  const clientLogLevel = values.logLevel as MasterLogLevel; // Cast is safe due to Zod schema change
  const clientTlsParamFromForm = values.tlsMode as MasterTlsMode | '2' | undefined;
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
      instanceType: "客户端",
      isSingleEndedForward: true,
      tunnelAddress: `[::]:${localListenPort}`,
      targetAddress: remoteTargetAddress,
      logLevel: clientLogLevel,
      tlsMode: '0',
      certPath: '',
      keyPath: '',
    };
  } else {
    const connectToServerTunnel = values.tunnelAddress;
    const clientLocalTargetPort = values.targetAddress;

    if (!connectToServerTunnel) {
      onLogLocal("连接到现有服务端时，服务端隧道地址是必需的。", "ERROR");
      return null;
    }

    let clientFullLocalForwardTargetAddress = `[::]:${(parseInt(extractPort(connectToServerTunnel) || "0", 10) + 1).toString()}`;
    if (clientLocalTargetPort && clientLocalTargetPort.trim() !== "" && /^[0-9]+$/.test(clientLocalTargetPort.trim())) {
      clientFullLocalForwardTargetAddress = `[::]:${clientLocalTargetPort.trim()}`;
    }

    clientParams = {
      instanceType: "客户端",
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
    onLogLocal("创建服务端时，目标地址 (业务数据) 是必需的。", "ERROR");
    return null;
  }
  if (!serverTunnelAddress) {
    onLogLocal("创建服务端时，隧道监听地址是必需的。", "ERROR");
    return null;
  }

  const serverParams: BuildUrlParams = {
    instanceType: "服务端",
    tunnelAddress: serverTunnelAddress,
    targetAddress: serverTargetAddress,
    logLevel: values.logLevel as MasterLogLevel, // Cast is safe due to Zod schema change
    tlsMode: values.tlsMode as MasterTlsMode | '2',
    certPath: values.certPath,
    keyPath: values.keyPath,
  };
  return { serverParams };
}
