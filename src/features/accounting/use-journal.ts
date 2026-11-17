import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/api/client';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useTenantCache, useTenantQuery } from '@/lib/tenant-query';
import { toast } from '@/store/toast';
import { PartyType, type CreateManualJournalEntryRequest, type CreateOpeningBalanceRequest, type JournalEntry } from '@/types/medicore';

export const JOURNAL_QUERY_KEY = ['accounting', 'journal-entries'] as const;

/** `GET /accounting/journal-entries`: every posted entry (viewing-branch scoped). */
export function useJournalEntries(branchId: string | null) {
  const cache = useTenantCache();
  const query = useTenantQuery<JournalEntry[]>({
    queryKey: [...JOURNAL_QUERY_KEY, 'list', branchId],
    queryFn: () => apiFetch<JournalEntry[]>(`/accounting/journal-entries${branchId ? `?branchId=${branchId}` : ''}`),
    staleTime: 30_000,
  });
  const done = () => {
    void cache.invalidate(['accounting']);
    void cache.invalidate(['dashboard']);
    void cache.invalidate(['customers']);
    void cache.invalidate(['vendors']);
  };
  /** One request each, never retried; the backend validates the balance and posts. */
  const create = useMutation({
    mutationFn: (dto: CreateManualJournalEntryRequest) => apiFetch<JournalEntry>('/accounting/journal-entries', { method: 'POST', body: dto }),
    onSuccess: () => { done(); toast.success('Journal entry posted'); },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to post journal entry')),
  });
  const createOpening = useMutation({
    mutationFn: (dto: CreateOpeningBalanceRequest) => apiFetch<JournalEntry>('/accounting/opening-balances', { method: 'POST', body: dto }),
    onSuccess: () => { done(); toast.success('Opening balance posted'); },
    onError: (error) => toast.error(mutationErrorMessage(error, 'Failed to post opening balance')),
  });
  return { entries: query.data ?? [], isLoading: query.isLoading, isFetching: query.isFetching, error: query.error, refetch: query.refetch, create: create.mutateAsync, createOpening: createOpening.mutateAsync };
}

/** `GET /accounting/journal-entries/:id` for the detail screen (ledger rows link here). */
export function useJournalEntry(id: string | null) {
  const query = useTenantQuery<JournalEntry>({
    queryKey: [...JOURNAL_QUERY_KEY, 'detail', id],
    queryFn: () => apiFetch<JournalEntry>(`/accounting/journal-entries/${id}`),
    enabled: !!id,
  });
  return { entry: query.data, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

export interface LineDraft { accountId: string; debit: string; credit: string; partyType: '' | PartyType; partyId: string; description: string }
export const EMPTY_LINE: LineDraft = { accountId: '', debit: '', credit: '', partyType: '', partyId: '', description: '' };

export const lineTotals = (lines: LineDraft[]) => ({
  debit: lines.reduce((s, l) => s + (Number(l.debit) || 0), 0),
  credit: lines.reduce((s, l) => s + (Number(l.credit) || 0), 0),
});
/** Web enable rule only; the backend is the authority on the balance. */
export function canPostEntry(type: 'manual' | 'opening', description: string, lines: LineDraft[]) {
  const t = lineTotals(lines);
  const balanced = Math.abs(t.debit - t.credit) < 0.01 && t.debit > 0;
  return balanced && (type === 'manual' ? description.trim().length > 0 : true) && lines.every((l) => l.accountId && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0));
}
export const toRequestLines = (lines: LineDraft[]) =>
  lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, partyType: l.partyType || undefined, partyId: l.partyType ? l.partyId || undefined : undefined, description: l.description || undefined }));
