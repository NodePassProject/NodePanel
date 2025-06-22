
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

const API_CONFIGS_LIST_STORAGE_KEY = 'nodepass_api_configs_list';
const ACTIVE_API_CONFIG_ID_STORAGE_KEY = 'nodepass_active_api_config_id';

export type MasterLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'event' | 'master';
export type MasterTlsMode = '0' | '1' | '2' | 'master';

export interface ApiConfig {
  apiUrl: string; 
  token: string;
}

export interface NamedApiConfig extends ApiConfig {
  id: string;
  name: string;
  masterDefaultLogLevel?: MasterLogLevel;
  masterDefaultTlsMode?: MasterTlsMode;
}

export function useApiConfig() {
  const [apiConfigsList, setApiConfigsList] = useState<NamedApiConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getCleanConfig = useCallback((config: NamedApiConfig | null): NamedApiConfig | null => {
    if (!config) return null;
    // Ensures that essential fields are present and default optional fields if necessary.
    // This is safer than destructuring with `...restConfig` if the input `config` might have extra fields
    // not defined in NamedApiConfig, or if some expected fields are missing.
    return {
      id: config.id,
      name: config.name,
      apiUrl: config.apiUrl,
      token: config.token,
      masterDefaultLogLevel: config.masterDefaultLogLevel || 'master',
      masterDefaultTlsMode: config.masterDefaultTlsMode || 'master',
    };
  }, []);


  useEffect(() => {
    try {
      const storedConfigsList = localStorage.getItem(API_CONFIGS_LIST_STORAGE_KEY);
      if (storedConfigsList) {
        const parsedConfigs = JSON.parse(storedConfigsList) as NamedApiConfig[];
        const migratedConfigs = parsedConfigs.map(config => getCleanConfig(config)).filter(Boolean) as NamedApiConfig[];
        setApiConfigsList(migratedConfigs);
      }
      const storedActiveConfigId = localStorage.getItem(ACTIVE_API_CONFIG_ID_STORAGE_KEY);
      if (storedActiveConfigId) {
        setActiveConfigId(storedActiveConfigId);
      }
    } catch (error) {
      console.warn("无法从 localStorage 加载主控配置列表:", error);
    } finally {
      setIsLoading(false);
    }
  }, [getCleanConfig]);

  const saveApiConfigsList = useCallback((configs: NamedApiConfig[]) => {
    try {
      const cleanConfigs = configs.map(config => getCleanConfig(config)).filter(Boolean) as NamedApiConfig[];
      localStorage.setItem(API_CONFIGS_LIST_STORAGE_KEY, JSON.stringify(cleanConfigs));
      setApiConfigsList(cleanConfigs);
    } catch (error) {
      console.error("无法将主控配置列表保存到 localStorage:", error);
    }
  }, [getCleanConfig]);

  const saveActiveConfigId = useCallback((id: string | null) => {
    try {
      if (id) {
        localStorage.setItem(ACTIVE_API_CONFIG_ID_STORAGE_KEY, id);
      } else {
        localStorage.removeItem(ACTIVE_API_CONFIG_ID_STORAGE_KEY);
      }
      setActiveConfigId(id);
    } catch (error) {
      console.error("无法将活动主控 ID 保存到 localStorage:", error);
    }
  }, []);

  const addOrUpdateApiConfig = useCallback((config: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    const newId = config.id || uuidv4();
    const cleanConfig = getCleanConfig({ ...config, id: newId } as NamedApiConfig);
    
    if (!cleanConfig) { // Should not happen if config is valid
        console.error("Failed to clean config during add/update", config);
        return config as NamedApiConfig; // Fallback, though problematic
    }

    setApiConfigsList(prevList => {
      const existingIndex = prevList.findIndex(c => c.id === newId);
      let newList;
      if (existingIndex > -1) {
        newList = [...prevList];
        newList[existingIndex] = cleanConfig;
      } else {
        newList = [...prevList, cleanConfig];
      }
      saveApiConfigsList(newList);
      return newList;
    });
    return cleanConfig;
  }, [saveApiConfigsList, getCleanConfig]);

  const deleteApiConfig = useCallback((id: string) => {
    setApiConfigsList(prevList => {
      const newList = prevList.filter(c => c.id !== id);
      saveApiConfigsList(newList);
      if (activeConfigId === id) {
        saveActiveConfigId(newList.length > 0 ? newList[0].id : null);
      }
      return newList;
    });
  }, [activeConfigId, saveApiConfigsList, saveActiveConfigId]);

  const clearActiveApiConfig = useCallback(() => {
    saveActiveConfigId(null);
  }, [saveActiveConfigId]);

  const activeApiConfig = useMemo(() => {
    if (!activeConfigId) return null;
    const config = apiConfigsList.find(c => c.id === activeConfigId) || null;
    return getCleanConfig(config);
  }, [apiConfigsList, activeConfigId, getCleanConfig]);

  const getApiConfigById = useCallback((id: string): NamedApiConfig | null => {
    const config = apiConfigsList.find(c => c.id === id) || null;
    return getCleanConfig(config);
  }, [apiConfigsList, getCleanConfig]);

  const getApiRootUrl = useCallback((id: string): string | null => {
    const config = getApiConfigById(id);
    if (!config?.apiUrl) return null;
    return config.apiUrl.replace(/\/+$/, '');
  }, [getApiConfigById]);

  const getToken = useCallback((id: string): string | null => {
    const config = getApiConfigById(id);
    return config?.token || null;
  }, [getApiConfigById]);

  return { 
    apiConfigsList,
    activeApiConfig,
    isLoading, 
    addOrUpdateApiConfig,
    deleteApiConfig,
    setActiveApiConfigId: saveActiveConfigId,
    clearActiveApiConfig,
    getApiRootUrl,
    getToken,
    getApiConfigById,
  };
}
