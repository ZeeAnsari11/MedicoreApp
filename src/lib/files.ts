import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { apiFetchBytes, type ApiRequestOptions } from '@/api/client';

/** Reusable file helpers for every module that hands a backend document (PDF, CSV, XLSX) to the user. */

export const MIME = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

/** Makes a name safe to use as a file name (no path separators or reserved characters), keeping the extension. */
export function safeFileName(name: string, fallback = 'document'): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  return cleaned || fallback;
}

/** Writes bytes to the app cache (overwriting a previous copy) and returns the file URI. */
export function saveToCache(bytes: ArrayBuffer | Uint8Array, fileName: string): string {
  const file = new File(Paths.cache, safeFileName(fileName));
  file.create({ overwrite: true });
  file.write(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return file.uri;
}

/** Downloads a backend document (authenticated, with the active branch header rules) into the cache. */
export async function downloadDocument(path: string, fileName: string, options?: ApiRequestOptions): Promise<string> {
  const bytes = await apiFetchBytes(path, options);
  return saveToCache(bytes, fileName);
}

export class SharingUnavailableError extends Error {
  constructor() {
    super('Sharing is not available on this device.');
    this.name = 'SharingUnavailableError';
  }
}

/** Opens the system share sheet for a local file. */
export async function shareFile(uri: string, mimeType: string, dialogTitle?: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new SharingUnavailableError();
  await Sharing.shareAsync(uri, { mimeType, dialogTitle });
}

/** Opens the system print dialog for a local PDF. */
export async function printPdf(uri: string): Promise<void> {
  await Print.printAsync({ uri });
}
