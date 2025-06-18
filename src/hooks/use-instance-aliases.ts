
"use client";

import { useState, useEffect, useCallback } from 'react';

const INSTANCE_ALIASES_STORAGE_KEY = 'nodepass_instance_aliases';
const CUSTOM_ALIASES_UPDATED_EVENT = 'nodepassCustomAliasesUpdatedEvent';


export interface InstanceAliases {
  [instanceId: string]: string;
}

export function useInstanceAliases() {
  const [aliases, setAliases] = useState<InstanceAliases>({});
  const [isLoading, setIsLoading] = useState(true);

  const loadAliasesFromStorage = useCallback(() => {
    setIsLoading(true); // Set loading to true when starting to load
    try {
      const storedAliases = localStorage.getItem(INSTANCE_ALIASES_STORAGE_KEY);
      if (storedAliases) {
        setAliases(JSON.parse(storedAliases));
      } else {
        setAliases({}); // Initialize to empty object if nothing is in storage
      }
    } catch (error) {
      console.warn("无法从 localStorage 加载实例别名:", error);
      setAliases({}); // Fallback to empty object on error
    } finally {
      setIsLoading(false); // Set loading to false after attempting to load
    }
  }, []);

  useEffect(() => {
    loadAliasesFromStorage(); // Initial load

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === INSTANCE_ALIASES_STORAGE_KEY) {
        loadAliasesFromStorage();
      }
    };

    const handleCustomEvent = () => {
      loadAliasesFromStorage();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(CUSTOM_ALIASES_UPDATED_EVENT, handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(CUSTOM_ALIASES_UPDATED_EVENT, handleCustomEvent);
    };
  }, [loadAliasesFromStorage]);

  const saveAliases = useCallback((updatedAliases: InstanceAliases) => {
    try {
      const currentAliasesString = localStorage.getItem(INSTANCE_ALIASES_STORAGE_KEY);
      const newAliasesString = JSON.stringify(updatedAliases);

      // Only update and dispatch if the content has actually changed
      if (currentAliasesString !== newAliasesString) {
        localStorage.setItem(INSTANCE_ALIASES_STORAGE_KEY, newAliasesString);
        // Update current hook instance's state immediately
        // This is important for the hook instance that initiated the save
        setAliases(updatedAliases);
        // Notify other hook instances (in the same window/tab)
        window.dispatchEvent(new CustomEvent(CUSTOM_ALIASES_UPDATED_EVENT));
      } else if (JSON.stringify(aliases) !== newAliasesString) {
        // If localStorage was same but internal state was different, still update internal state.
        // This case is less common if loadAliasesFromStorage keeps state in sync.
        setAliases(updatedAliases);
      }
    } catch (error) {
      console.error("无法将实例别名保存到 localStorage:", error);
    }
  }, [aliases]); // Include aliases in dependency array for comparison

  const removeAlias = useCallback((instanceId: string) => {
    if (!instanceId) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [instanceId]: _, ...restAliases } = aliases;
    saveAliases(restAliases);
  }, [aliases, saveAliases]);

  const setAlias = useCallback((instanceId: string, aliasValue: string) => {
    if (!instanceId) return;
    const trimmedAlias = aliasValue.trim();
    if (!trimmedAlias) {
      removeAlias(instanceId);
      return;
    }
    const updatedAliases = { ...aliases, [instanceId]: trimmedAlias };
    saveAliases(updatedAliases);
  }, [aliases, saveAliases, removeAlias]);

  const getAlias = useCallback((instanceId: string): string | undefined => {
    return aliases[instanceId];
  }, [aliases]);

  const getAllAliases = useCallback((): InstanceAliases => {
    return aliases;
  }, [aliases]);


  return {
    aliases, // This is the reactive state object
    isLoadingAliases: isLoading,
    getAlias,
    setAlias,
    removeAlias,
    getAllAliases,
  };
}
    