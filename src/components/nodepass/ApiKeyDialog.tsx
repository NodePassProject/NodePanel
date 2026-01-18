"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import type { AppLogEntry } from './EventLog';

interface ApiConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: Omit<NamedApiConfig, 'id'> & { id?: string }) => void;
  currentConfig?: NamedApiConfig | null;
  isEditing?: boolean;
  onLog?: (message: string, type: AppLogEntry['type']) => void;
}

export function ApiConfigDialog({ open, onOpenChange, onSave, currentConfig, isEditing = false, onLog }: ApiConfigDialogProps) {
  const [nameInput, setNameInput] = useState('');
  const [apiUrlInput, setApiUrlInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (open) {
      setNameInput(currentConfig?.name || '');
      setApiUrlInput(currentConfig?.apiUrl || 'http://localhost:3000/api/v1');
      setTokenInput(currentConfig?.token || '');
      setShowToken(false);
    } else {
      // Reset fields when dialog is closed
      setNameInput('');
      setApiUrlInput('http://localhost:3000/api/v1');
      setTokenInput('');
      setShowToken(false);
    }
  }, [open, currentConfig]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim() && apiUrlInput.trim() && tokenInput.trim()) {
      const configToSave: Omit<NamedApiConfig, 'id'> & { id?: string } = {
        id: currentConfig?.id,
        name: nameInput.trim(),
        apiUrl: apiUrlInput.trim(),
        token: tokenInput.trim(),
        // masterDefaultLogLevel and masterDefaultTlsMode are intentionally omitted.
        // The useApiConfig hook will default them to 'master' if they're not present.
      };
      onSave(configToSave);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center font-title">
              <KeyRound className="mr-2 h-5 w-5 text-primary" />
              {isEditing ? 'Edit Master Control Connection' : 'Add New Master Control Connection'}
            </DialogTitle>
            <DialogDescription className="font-sans">
              {isEditing ? `Modify the connection configuration of master control "${currentConfig?.name}".` : 'Configure the connection for this NodePass master control. Information will be saved locally in your browser.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
            <div className="space-y-1">
              <Label htmlFor="config-name" className="font-sans">Master Control Name</Label>
              <Input
                id="config-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g., Local Master Control"
                required
                className="font-sans"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="api-url" className="font-sans">Master Control API URL</Label>
              <Input
                id="api-url"
                value={apiUrlInput}
                onChange={(e) => setApiUrlInput(e.target.value)}
                placeholder="e.g., http://localhost:3000/api/v1"
                required
                className="font-sans"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="token" className="font-sans">Token (API Key)</Label>
              <div className="relative">
                <Input
                  id="token"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Enter token"
                  type={showToken ? 'text' : 'password'}
                  required
                  className="pr-10 font-sans"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowToken(!showToken)}
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="font-sans">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!nameInput.trim() || !apiUrlInput.trim() || !tokenInput.trim()}>Save Configuration</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}