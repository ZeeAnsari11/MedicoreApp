import { useState } from 'react';

/**
 * Filters edited in a panel and applied together: `draft` changes as the user picks, `applied` (what the query uses)
 * changes only on `apply`. Opening the panel starts from the applied values, so closing it discards unapplied picks.
 */
export function useDraftFilters<T extends Record<string, string>>(defaults: T) {
  const [applied, setApplied] = useState<T>(defaults);
  const [draft, setDraft] = useState<T>(defaults);
  const [open, setOpen] = useState(false);

  return {
    applied,
    draft,
    open,
    setField: <K extends keyof T>(key: K) => (value: T[K]) => setDraft((d) => ({ ...d, [key]: value })),
    toggle: () => {
      if (!open) setDraft(applied);
      setOpen(!open);
    },
    close: () => setOpen(false),
    apply: () => {
      setApplied(draft);
      setOpen(false);
    },
    reset: () => {
      setDraft(defaults);
      setApplied(defaults);
    },
    /** True when any applied filter differs from its default. */
    isActive: (Object.keys(defaults) as (keyof T)[]).some((k) => applied[k] !== defaults[k]),
  };
}
