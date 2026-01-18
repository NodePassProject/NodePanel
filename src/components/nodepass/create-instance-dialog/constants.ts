"use client";

import type { MasterTlsMode } from '@/hooks/use-api-key';

export const MASTER_TLS_MODE_DISPLAY_MAP: Record<MasterTlsMode | '2', string> = {
  'master': 'Master Configuration',
  '0': '0: No TLS',
  '1': '1: Self-signed',
  '2': '2: Custom',
};