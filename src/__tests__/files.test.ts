import { downloadDocument, MIME, printPdf, safeFileName, saveToCache, shareFile, SharingUnavailableError } from '@/lib/files';

const mockWrite = jest.fn();
const mockCreate = jest.fn();
let mockSharing = true;
const mockShare = jest.fn(async () => undefined);
const mockPrint = jest.fn(async () => undefined);
const mockBytes = jest.fn();

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class {
    uri: string;
    constructor(dir: string, name: string) { this.uri = `${dir}${name}`; }
    create(o: unknown) { mockCreate(o); }
    write(b: unknown) { mockWrite(b); }
  },
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => mockSharing, shareAsync: (...a: unknown[]) => (mockShare as (...x: unknown[]) => Promise<void>)(...a) }));
jest.mock('expo-print', () => ({ printAsync: (...a: unknown[]) => (mockPrint as (...x: unknown[]) => Promise<void>)(...a) }));
jest.mock('@/api/client', () => ({ apiFetchBytes: (...a: unknown[]) => mockBytes(...a) }));

beforeEach(() => { jest.clearAllMocks(); mockSharing = true; });

describe('files helper', () => {
  it('makes file names safe and keeps the extension', () => {
    expect(safeFileName('INV/2024:001?.pdf')).toBe('INV-2024-001-.pdf');
    expect(safeFileName('  ..  ', 'doc.pdf')).toBe('doc.pdf');
  });
  it('writes bytes into the cache, overwriting a previous copy', () => {
    const uri = saveToCache(new Uint8Array([1, 2]).buffer, 'a/b.pdf');
    expect(uri).toBe('file:///cache/a-b.pdf');
    expect(mockCreate).toHaveBeenCalledWith({ overwrite: true });
    expect(mockWrite).toHaveBeenCalledWith(new Uint8Array([1, 2]));
  });
  it('downloads through the authenticated client', async () => {
    mockBytes.mockResolvedValue(new Uint8Array([9]).buffer);
    expect(await downloadDocument('/sales/s1/pdf?branchId=b1', 'INV-1.pdf')).toBe('file:///cache/INV-1.pdf');
    expect(mockBytes).toHaveBeenCalledWith('/sales/s1/pdf?branchId=b1', undefined);
  });
  it('shares and prints, and reports when sharing is unavailable', async () => {
    await shareFile('file:///x.pdf', MIME.pdf, 'Invoice');
    expect(mockShare).toHaveBeenCalledWith('file:///x.pdf', { mimeType: 'application/pdf', dialogTitle: 'Invoice' });
    await printPdf('file:///x.pdf');
    expect(mockPrint).toHaveBeenCalledWith({ uri: 'file:///x.pdf' });
    mockSharing = false;
    await expect(shareFile('file:///x.pdf', MIME.pdf)).rejects.toBeInstanceOf(SharingUnavailableError);
  });
});
