import type { Instance as NodelessInstance, CreateInstanceRequest, UpdateInstanceRequest, MasterInfo } from '@/types/nodepass';

// Re-export Instance to avoid direct dependency on types/nodepass elsewhere if not needed.
export type Instance = NodelessInstance;


async function request<T>(
  fullRequestUrl: string,
  options: RequestInit = {},
  token: string | null
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.append('Content-Type', 'application/json');
  if (token) {
    headers.append('X-API-Key', token);
  }

  let response;
  try {
    response = await fetch(fullRequestUrl, {
      ...options,
      headers,
      cache: 'no-store',
      mode: 'cors', 
      credentials: 'omit', 
    });
  } catch (networkError: any) {
    console.error(`Network error while requesting ${fullRequestUrl}:`, networkError);
    
    let errorMessage = `Network request failed (${networkError.message || 'Unknown error'}).`;
    const lowerCaseErrorMessage = networkError.message?.toLowerCase() || "";

    if (lowerCaseErrorMessage.includes('failed to fetch')) {
      let specificErrorHandled = false;
      try {
        const targetUrl = new URL(fullRequestUrl); // Check if fullRequestUrl is a valid URL first
        const isFrontendSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';

        if (targetUrl.protocol === 'http:' && isFrontendSecure) {
          errorMessage = `Detected mixed content request (HTTPS page requesting HTTP resource). Your browser may have blocked this request. Please refer to the "HTTP Master Connection Issues (Mixed Content)" section in the in-app help documentation for browser settings.`;
          specificErrorHandled = true;
        } else if (targetUrl.protocol === 'https:') {
          errorMessage = `Failed to connect to ${fullRequestUrl} (HTTPS). If the target API uses a self-signed SSL certificate, please try accessing this API address directly in a new browser tab and accept the security warning. For details, please refer to the "HTTPS (Self-signed Certificate) Master Connection Issues" section in the in-app help documentation. If not a certificate issue, please check CORS configuration, network connection, or server status.`;
          specificErrorHandled = true;
        }
      } catch (urlParseError) {
        // fullRequestUrl might not be a valid URL, proceed with generic error
        console.warn("Could not parse fullRequestUrl for specific error diagnosis:", fullRequestUrl, urlParseError);
      }

      if (!specificErrorHandled) {
        errorMessage = `Network request to ${fullRequestUrl} failed. This is usually caused by the target server's CORS policy blocking the request (missing Access-Control-Allow-Origin header), network connection issues, or the server not running. Please check your network connection and the target server's CORS configuration.`;
        try {
            const urlObject = new URL(fullRequestUrl);
            const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
            if (ipv4Regex.test(urlObject.hostname)) {
                errorMessage += ` For IPv4 address (${urlObject.hostname}), please additionally confirm that the NodePass service is listening on that IPv4 address and port (${urlObject.port || 'default'}). Ensure the service listens on '0.0.0.0:${urlObject.port || 'default port'}' (all network interfaces) or specifically on '${urlObject.hostname}:${urlObject.port || 'default port'}'.`;
            }
        } catch (e) { /* ignore parsing error if fullRequestUrl is malformed */ }
      }
    } else {
      // Other network errors not "Failed to fetch"
      errorMessage = `Network request to ${fullRequestUrl} encountered an error: ${networkError.message || 'Unknown network error'}. Please check your network connection and the target server status.`;
    }

    const error = new Error(errorMessage);
    (error as any).cause = networkError; 
    throw error;
  }

  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch (e) {
      errorBody = { message: response.statusText };
    }
    const error = new Error(`API error: ${response.status} ${errorBody?.message || response.statusText}`);
    (error as any).status = response.status; 
    (error as any).body = errorBody; 
    throw error;
  }

  if (response.status === 204) { // No Content
    return null as T; 
  }

  return response.json();
}

const checkApiRootUrl = (apiRootUrl: string | null | undefined, operation: string): void => {
  if (!apiRootUrl || typeof apiRootUrl !== 'string' || apiRootUrl.trim() === '') {
    throw new Error(`Cannot ${operation}: API root URL (apiRootUrl) is not configured or invalid.`);
  }
};

export const nodePassApi = {
  getInstances: (apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, 'fetch instance list');
    return request<Instance[]>(`${apiRootUrl}/instances`, {}, token);
  },
  
  createInstance: (data: CreateInstanceRequest, apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, 'create instance');
    return request<Instance>(`${apiRootUrl}/instances`, { method: 'POST', body: JSON.stringify(data) }, token);
  },
  
  getInstance: (id: string, apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, `fetch instance ${id}`);
    return request<Instance>(`${apiRootUrl}/instances/${id}`, {}, token);
  },
  
  updateInstance: (id: string, data: UpdateInstanceRequest, apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, `update instance ${id}`);
    return request<Instance>(`${apiRootUrl}/instances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token);
  },
  
  deleteInstance: (id: string, apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, `delete instance ${id}`);
    return request<void>(`${apiRootUrl}/instances/${id}`, { method: 'DELETE' }, token);
  },

  getMasterInfo: (apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, 'fetch master info');
    return request<MasterInfo>(`${apiRootUrl}/info`, {}, token);
  },
};

export const getEventsUrl = (apiRootUrl: string | null): string => {
  if (!apiRootUrl) throw new Error("API root URL (apiRootUrl) is not configured, cannot get events URL.");
  return `${apiRootUrl}/events`;
};