import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { ErrorState, LoadingState } from '@/components/ui/states';
import { RequirePermission } from '@/features/auth/require-permission';
import { spacing } from '@/theme';

import { JournalEntryBody } from './journal-detail';
import { useJournalEntry } from './use-journal';

/** One entry by id, the target of every ledger/journal link. */
export function JournalDetailScreen() {
  return (
    <RequirePermission permission="acc_journal_entries:read" what="view journal entries">
      <Detail />
    </RequirePermission>
  );
}

function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { entry, isLoading, error, refetch } = useJournalEntry(id ?? null);
  if (isLoading) return <LoadingState />;
  if (error || !entry) return <ErrorState error={error ?? new Error('Journal entry not found')} onRetry={() => void refetch()} />;
  return <ScrollView contentContainerStyle={styles.pad}><JournalEntryBody entry={entry} /></ScrollView>;
}

const styles = StyleSheet.create({ pad: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 } });
