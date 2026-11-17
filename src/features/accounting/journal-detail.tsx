import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { formatDate } from '@/lib/dates';
import { formatRs } from '@/lib/format';
import { spacing } from '@/theme';
import { JournalEntryStatus, type JournalEntry } from '@/types/medicore';

const sourceLabel = (s: string) => s.replace(/_/g, ' ');

/** Read-only entry body shared by the detail screen and the list's detail modal. */
export function JournalEntryBody({ entry }: { entry: JournalEntry }) {
  return (
    <View style={styles.gap}>
      <View style={styles.row}>
        <Text variant="label">{entry.entryNumber}</Text>
        <Badge label={entry.status} tone={entry.status === JournalEntryStatus.REVERSED ? 'warning' : 'neutral'} />
      </View>
      <Text muted>Date: {formatDate(entry.entryDate)}</Text>
      <Text muted>Source: {sourceLabel(entry.sourceType)}</Text>
      <Text>Description: {entry.description}</Text>
      {entry.reversalOfEntryId ? <Text muted>Reverses entry {entry.reversalOfEntryId}</Text> : null}
      {entry.reversedByEntryId ? <Text muted>Reversed by entry {entry.reversedByEntryId}</Text> : null}
      {entry.lines.map((l, i) => (
        <Card key={i}>
          <Text variant="label">{l.accountName ?? l.accountId}</Text>
          <Text variant="caption" muted>{l.partyName ?? '—'}</Text>
          <View style={styles.row}>
            <Text>{l.debit > 0 ? `Debit ${formatRs(l.debit)}` : ''}</Text>
            <Text>{l.credit > 0 ? `Credit ${formatRs(l.credit)}` : ''}</Text>
          </View>
        </Card>
      ))}
      <View style={styles.row}>
        <Text variant="label">Total</Text>
        <Text variant="label">Debit {formatRs(entry.totalDebit)} · Credit {formatRs(entry.totalCredit)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
