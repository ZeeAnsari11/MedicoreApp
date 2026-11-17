import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/use-auth';
import { useDocumentFile } from '@/features/documents/use-document-file';
import { toQuery } from '@/features/ledgers/use-party-ledger';
import { MIME } from '@/lib/files';
import { spacing } from '@/theme';

/** Export route + the period/branch filters; the server builds the CSV/PDF/statement (20,000-row cap) from `format`. */
export const ledgerExportPath = (path: string, query: Record<string, string | undefined>, format: 'csv' | 'pdf' | 'statement') => {
  const qs = toQuery({ ...query, format });
  return `${path}?${qs}`;
};

/** Web `LedgerExportButtons`: Excel / CSV, Print / PDF and (parties only) Statement; hidden without the export permission. */
export function LedgerExportButtons({ permission, path, query, baseName, statement, disabled }: { permission: string; path: string; query: Record<string, string | undefined>; baseName: string; statement?: boolean; disabled?: boolean }) {
  const { has } = useAuth();
  const doc = useDocumentFile();
  if (!has(permission)) return null;
  const off = disabled || doc.isBusy;
  const csv = () => doc.share({ path: ledgerExportPath(path, query, 'csv'), fileName: `${baseName}.csv`, mimeType: MIME.csv });
  const pdf = () => doc.share({ path: ledgerExportPath(path, query, 'pdf'), fileName: `${baseName}.pdf`, mimeType: MIME.pdf });
  const stmt = () => doc.share({ path: ledgerExportPath(path, query, 'statement'), fileName: `${baseName}-statement.pdf`, mimeType: MIME.pdf });
  return (
    <View style={styles.row}>
      <Button label="Excel / CSV" variant="secondary" disabled={off} onPress={() => void csv()} />
      <Button label="Print / PDF" variant="secondary" disabled={off} onPress={() => void pdf()} />
      {statement ? <Button label="Statement" variant="secondary" disabled={off} onPress={() => void stmt()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm } });
