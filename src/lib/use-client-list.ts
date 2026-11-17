import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

export interface ClientListOptions<T> {
  /** Everything searchable about an item, as one lowercase-able string (the web DataTable searches all columns). */
  searchText: (item: T) => string;
  sorters: Record<string, (a: T, b: T) => number>;
  defaultSort: string;
  pageSize?: number;
}

/** Pure part of the hook, exported for tests: filter by query, then stable-sort. */
export function filterAndSort<T>(items: T[], query: string, opts: Pick<ClientListOptions<T>, 'searchText' | 'sorters'>, sortKey: string, dir: SortDir): T[] {
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((i) => opts.searchText(i).toLowerCase().includes(q)) : items.slice();
  const cmp = opts.sorters[sortKey];
  if (!cmp) return filtered;
  const sign = dir === 'asc' ? 1 : -1;
  return filtered
    .map((item, index) => ({ item, index }))
    .sort((a, b) => cmp(a.item, b.item) * sign || a.index - b.index)
    .map((x) => x.item);
}

export const compareText = (a: string | undefined, b: string | undefined) => (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base' });
export const compareNumber = (a: number | undefined, b: number | undefined) => (a ?? 0) - (b ?? 0);

/** Search + sort + "load more" paging over an in-memory list (the API returns these lists unpaginated). */
export function useClientList<T>(items: T[], opts: ClientListOptions<T>) {
  const pageSize = opts.pageSize ?? 30;
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState(opts.defaultSort);
  const [dir, setDir] = useState<SortDir>('asc');
  const [shown, setShown] = useState(pageSize);

  const sorted = useMemo(
    () => filterAndSort(items, query, opts, sortKey, dir),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, query, sortKey, dir],
  );

  return {
    query,
    setQuery: (q: string) => {
      setQuery(q);
      setShown(pageSize);
    },
    sortKey,
    dir,
    setSort: (key: string) => {
      if (key === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      else {
        setSortKey(key);
        setDir('asc');
      }
      setShown(pageSize);
    },
    visible: sorted.slice(0, shown),
    total: sorted.length,
    hasMore: shown < sorted.length,
    loadMore: () => setShown((n) => n + pageSize),
  };
}
