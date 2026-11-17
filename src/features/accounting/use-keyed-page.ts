import { useState } from 'react';

/** A page number that falls back to 1 whenever the filters (`key`) change, without an effect. */
export function useKeyedPage(key: string) {
  const [state, setState] = useState({ key, page: 1 });
  const page = state.key === key ? state.page : 1;
  return [page, (p: number) => setState({ key, page: p })] as const;
}
