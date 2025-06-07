
"use client";

import type { CreateInstanceFormValues } from '@/zod-schemas/nodepass';
import type { NamedApiConfig, MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';
import { extractHostname, extractPort, isWildcardHostname } from '@/lib/url-utils';

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
      if (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master') {
        effectiveTlsMode = masterConfigForInstance.masterDefaultTlsMode;
      } else {
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


interface PrepareClientUrlParamsResult {
  clientParams: BuildUrlParams;
  serverParamsForAutoCreate?: BuildUrlParams;
  serverMasterForAutoCreate?: NamedApiConfig | null;
}

export function prepareClientUrlParams(
  values: CreateInstanceFormValues,
  activeApiConfig: NamedApiConfig | null,
  getApiConfigById: (id: string) => NamedApiConfig | null,
  onLogLocal: (message: string, type: 'INFO' | 'WARN' | 'ERROR') => void
): PrepareClientUrlParamsResult | null {
  if (!activeApiConfig) {
    onLogLocal('当前客户端主控配置无效，无法准备客户端参数。', 'ERROR');
    return null;
  }

  let clientParams: BuildUrlParams;
  let serverParamsForAutoCreate: BuildUrlParams | undefined = undefined;
  let serverMasterForAutoCreate: NamedApiConfig | null = undefined;

  const clientLogLevel = values.logLevel;
  const clientTlsMode = values.tlsMode as MasterTlsMode | '2';
  const clientCertPath = values.certPath;
  const clientKeyPath = values.keyPath;

  if (values.isSingleEndedForward) {
    // 入口(c) - 单端转发模式
    const localListenPort = values.tunnelAddress; // This is just the port number
    const remoteTargetAddress = values.targetAddress; // This is the full remote host:port

    if (!remoteTargetAddress) {
      onLogLocal("单端转发模式下，目标地址 (业务数据) 是必需的。", "ERROR");
      return null;
    }

    clientParams = {
      instanceType: "入口(c)",
      isSingleEndedForward: true,
      tunnelAddress: `[::]:${localListenPort}`, // Client listens locally on all interfaces
      targetAddress: remoteTargetAddress,
      logLevel: clientLogLevel,
      tlsMode: clientTlsMode, // For connection to remote target
      certPath: clientCertPath,
      keyPath: clientKeyPath,
    };
  } else if (values.autoCreateServer) {
    // 入口(c) - 自动创建出口(s)
    const serverListenPortForAutoCreate = values.tunnelAddress; // This is just the port for the server
    const serverTargetForAutoCreate = values.serverTargetAddressForAutoCreate;

    if (!serverListenPortForAutoCreate) {
      onLogLocal("自动创建出口(s)时，出口(s)监听端口是必需的。", "ERROR");
      return null;
    }
    if (!serverTargetForAutoCreate) {
      onLogLocal("自动创建出口(s)时，出口(s)目标地址 (业务数据) 是必需的。", "ERROR");
      return null;
    }

    const serverMasterId = values.serverApiId || activeApiConfig.id;
    serverMasterForAutoCreate = getApiConfigById(serverMasterId);

    if (!serverMasterForAutoCreate) {
      onLogLocal(`选择的出口(s)主控 (ID: ${serverMasterId}) 未找到。`, "ERROR");
      return null;
    }
    
    const serverApiHost = extractHostname(serverMasterForAutoCreate.apiUrl);
    if (!serverApiHost) {
        onLogLocal(`无法从出口(s)主控 "${serverMasterForAutoCreate.name}" API URL提取主机名。`, "ERROR");
        return null;
    }

    // Client connects to the server's master API host and the specified port
    const clientConnectToFullTunnelAddr = `${formatHostForUrl(serverApiHost)}:${serverListenPortForAutoCreate}`;
    // Client's local forward target will be [::]:(server_listen_port + 1)
    const clientActualLocalForwardPort = (parseInt(serverListenPortForAutoCreate, 10) + 1).toString();
    const clientFullLocalForwardTargetAddress = `[::]:${clientActualLocalForwardPort}`;

    clientParams = {
      instanceType: "入口(c)",
      tunnelAddress: clientConnectToFullTunnelAddr,
      targetAddress: clientFullLocalForwardTargetAddress,
      logLevel: clientLogLevel,
      tlsMode: clientTlsMode, // For client's connection behavior to server
      certPath: clientCertPath,
      keyPath: clientKeyPath,
    };

    serverParamsForAutoCreate = {
      instanceType: "出口(s)",
      tunnelAddress: `[::]:${serverListenPortForAutoCreate}`, // Server listens on all its interfaces
      targetAddress: serverTargetForAutoCreate,
      logLevel: clientLogLevel, // Server inherits client's log level choice
      tlsMode: clientTlsMode,   // Server inherits client's TLS mode choice
      certPath: clientCertPath,
      keyPath: clientKeyPath,
    };

  } else {
    // 入口(c) - 连接到已存在的出口(s)
    const connectToServerTunnel = values.tunnelAddress; // Full host:port of existing server
    const clientLocalTargetPort = values.targetAddress; // Optional local port

    if (!connectToServerTunnel) {
      onLogLocal("连接到现有出口(s)时，出口(s)隧道地址是必需的。", "ERROR");
      return null;
    }
    
    let clientFullLocalForwardTargetAddress = `[::]:${(parseInt(extractPort(connectToServerTunnel) || "0", 10) + 1).toString()}`; // Default
    if (clientLocalTargetPort && clientLocalTargetPort.trim() !== "") {
      clientFullLocalForwardTargetAddress = `[::]:${clientLocalTargetPort.trim()}`;
    }


    clientParams = {
      instanceType: "入口(c)",
      tunnelAddress: connectToServerTunnel,
      targetAddress: clientFullLocalForwardTargetAddress,
      logLevel: clientLogLevel,
      tlsMode: clientTlsMode,
      certPath: clientCertPath,
      keyPath: clientKeyPath,
    };
  }
  return { clientParams, serverParamsForAutoCreate, serverMasterForAutoCreate };
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

    