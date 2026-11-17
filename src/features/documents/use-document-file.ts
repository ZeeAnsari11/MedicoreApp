import { useRef, useState } from 'react';

import { errorMessage } from '@/api/errors';
import { downloadDocument, MIME, printPdf, shareFile } from '@/lib/files';
import { toast } from '@/store/toast';

export interface DocumentRequest {
  /** API path including any `?branchId=` the endpoint needs, e.g. `/sales/:id/pdf?branchId=...`. */
  path: string;
  fileName: string;
  mimeType?: string;
  dialogTitle?: string;
}

/**
 * Download a backend-generated document and share or print it. One action at a time (a second tap while busy is ignored),
 * and failures are reported, never swallowed. Read-only: documents are fetched with GET, so repeating one is harmless.
 */
export function useDocumentFile() {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = async (request: DocumentRequest, action: (uri: string) => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const uri = await downloadDocument(request.path, request.fileName);
      await action(uri);
    } catch (error) {
      toast.error(errorMessage(error) || 'Could not prepare the document');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return {
    isBusy: busy,
    share: (request: DocumentRequest) => run(request, (uri) => shareFile(uri, request.mimeType ?? MIME.pdf, request.dialogTitle ?? request.fileName)),
    print: (request: DocumentRequest) => run(request, printPdf),
  };
}
