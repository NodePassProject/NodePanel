
"use client";

import type { MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';

export interface ParsedNodePassUrl {
  scheme: 'server' | 'client' | null;
  tunnelAddress: string | null;
  targetAddress: string | null;
  params: URLSearchParams;
  logLevel: MasterLogLevel;
  tlsMode: MasterTlsMode | null;
  certPath: string | null;
  keyPath: string | null;
}

export function parseNodePassUrl(url: string): ParsedNodePassUrl {
  const result: ParsedNodePassUrl = {
    scheme: null,
    tunnelAddress: null,
    targetAddress: null,
    params: new URLSearchParams(),
    logLevel: 'master',
    tlsMode: null,
    certPath: null,
    keyPath: null,
  };

  if (!url) return result;

  try {
    const schemeMatch = url.match(/^([a-zA-Z]+):\/\//);
    if (schemeMatch && (schemeMatch[1] === 'server' || schemeMatch[1] === 'client')) {
      result.scheme = schemeMatch[1] as 'server' | 'client';
    } else {
      // Fallback heuristic for scheme if not present
      if (url.includes("?tls=") || url.includes("&tls=")) {
        result.scheme = "server";
      } else {
        result.scheme = "client";
      }
    }

    const restOfUrl = schemeMatch ? url.substring(schemeMatch[0].length) : url;
    const parts = restOfUrl.split('?');
    const pathPart = parts[0];
    const queryPart = parts[1];

    if (queryPart) {
      result.params = new URLSearchParams(queryPart);
      const log = result.params.get('log');
      if (log && ['debug', 'info', 'warn', 'error', 'event'].includes(log)) {
        result.logLevel = log as MasterLogLevel;
      }

      if (result.scheme === 'server') {
        const tls = result.params.get('tls');
        if (tls && ['0', '1', '2'].includes(tls)) {
          result.tlsMode = tls as MasterTlsMode;
        } else {
           result.tlsMode = 'master';
        }
        if (result.tlsMode === '2') {
          result.certPath = result.params.get('crt') || '';
          result.keyPath = result.params.get('key') || '';
        }
      }
    }


    const addresses = pathPart.split('/');
    if (addresses.length > 0) {
      result.tunnelAddress = addresses[0] || null;
    }
    if (addresses.length > 1) {
      result.targetAddress = addresses.slice(1).join('/') || null;
    }
  } catch (e) {
    console.error("Error parsing NodePass URL:", url, e);
  }
  return result;
}

export function extractHostname(urlOrHostPort: string | null | undefined): string | null {
  if (!urlOrHostPort) return null;
  try {
    const fullUrl = urlOrHostPort.includes('://') ? urlOrHostPort : `http://${urlOrHostPort}`;
    const url = new URL(fullUrl);
    return url.hostname.replace(/^\[|\]$/g, ''); // Remove brackets from IPv6
  } catch (e) {
    const parts = urlOrHostPort.split(':');
    if (parts.length > 0) {
      if (urlOrHostPort.startsWith('[') && urlOrHostPort.includes(']')) {
        const match = urlOrHostPort.match(/^\[(.*?)\]/);
        if (match && match[1]) return match[1];
      }
      return parts[0] || null;
    }
    return null;
  }
}

export function extractPort(addressWithPort: string | null | undefined): string | null {
  if (!addressWithPort) return null;
  try {
    const fullUrl = addressWithPort.includes('://') ? addressWithPort : `http://${addressWithPort}`;
    const url = new URL(fullUrl);
    return url.port || null;
  } catch (e) {
    const lastColonIndex = addressWithPort.lastIndexOf(':');
    if (lastColonIndex !== -1 && lastColonIndex < addressWithPort.length - 1 && lastColonIndex > 0) {
      const portCandidate = addressWithPort.substring(lastColonIndex + 1);
      if (/^\d+$/.test(portCandidate)) {
        const hostPart = addressWithPort.substring(0, lastColonIndex);
        if (hostPart.includes(']:')) { // e.g. [::1]:8080
             return portCandidate;
        }
        if (!hostPart.includes(':') || (hostPart.startsWith('[') && hostPart.endsWith(']'))) { // e.g. localhost:8080 or [::1]:8080
            return portCandidate;
        }
      }
    }
    return null;
  }
}

export function isWildcardHostname(host: string | null | undefined): boolean {
    if (!host) return false; // Consider null/undefined not wildcard for safety, or true depending on desired behavior
    const lowerHost = host.toLowerCase();
    return lowerHost === '0.0.0.0' || lowerHost === '[::]' || lowerHost === '::';
}

export function formatHostForDisplay(host: string | null | undefined): string {
  if (!host) return '未提供主机'; // Placeholder for display purposes
  // If it's an IPv6 address and not bracketed, bracket it for host:port construction.
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }
  return host; // Return IPv4, FQDN, or already bracketed IPv6 as is.
}
