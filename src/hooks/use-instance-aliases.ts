
"use client";

import { useState, useEffect, useCallback } from 'react';

const INSTANCE_ALIASES_STORAGE_KEY = 'nodepass_instance_aliases';

export interface InstanceAliases {
  [instanceId: string]: string;
}

export function useInstanceAliases() {
  const [aliases, setAliases] = useState<InstanceAliases>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedAliases = localStorage.getItem(INSTANCE_ALIASES_STORAGE_KEY);
      if (storedAliases) {
        setAliases(JSON.parse(storedAliases));
      }
    } catch (error) {
      console.warn("无法从 localStorage 加载实例别名:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveAliases = useCallback((updatedAliases: InstanceAliases) => {
    try {
      localStorage.setItem(INSTANCE_ALIASES_STORAGE_KEY, JSON.stringify(updatedAliases));
      setAliases(updatedAliases);
    } catch (error) {
      console.error("无法将实例别名保存到 localStorage:", error);
    }
  }, []);

  const getAlias = useCallback((instanceId: string): string | undefined => {
    return aliases[instanceId];
  }, [aliases]);

  const removeAlias = useCallback((instanceId: string) => {
    if (!instanceId) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [instanceId]: _, ...restAliases } = aliases;
    saveAliases(restAliases);
  }, [aliases, saveAliases]);

  const setAlias = useCallback((instanceId: string, alias: string) => {
    if (!instanceId) return;
    const trimmedAlias = alias.trim();
    if (!trimmedAlias) { 
      removeAlias(instanceId);
      return;
    }
    const updatedAliases = { ...aliases, [instanceId]: trimmedAlias };
    saveAliases(updatedAliases);
  }, [aliases, saveAliases, removeAlias]);

  const getAllAliases = useCallback((): InstanceAliases => {
    return aliases;
  }, [aliases]);

  return {
    aliases,
    isLoadingAliases: isLoading,
    getAlias,
    setAlias,
    removeAlias,
    getAllAliases,
  };
}
