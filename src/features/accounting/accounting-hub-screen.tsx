import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useAccountingOverview } from '@/features/dashboard/use-dashboard';
import { formatRs } from '@/lib/format';
import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

import { ACCOUNTING_PAGES, readKey } from './pages';

/** Port of the web Accounting hub: four KPI cards (needs acc_overview:read) and a card per sub-page the user may read. */
export function AccountingHubScreen() {
  const theme = useTheme();
  const { has, hasAny, isLoading, user, profileError, refetchProfile } = useAuth();
  const canOverview = has('acc_overview:read');
  const pages = ACCOUNTING_PAGES.filter((p) => has(readKey(p.slug)));
  const overview = useAccountingOverview(canOverview);

  if (isLoading) return <LoadingState />;
  if (profileError && !user) return <ErrorState error={profileError} onRetry={() => void refetchProfile()} />;
  if (!hasAny('acc_overview:read', ...ACCOUNTING_PAGES.map((p) => readKey(p.slug)))) return <EmptyState title="No access" message="You do not have permission to view accounting." />;

  const o = overview.data;
  const kpis = [
    { label: 'Accounts Receivable', value: o?.totalReceivable, href: '/accounting/customer-ledger?view=list&bal=1' },
    { label: 'Accounts Payable', value: o?.totalPayable, href: '/accounting/vendor-ledger?view=list&bal=1' },
    { label: 'Cash + Bank', value: o?.cashAndBankBalance, href: undefined },
    { label: 'Net Income (this month)', value: o?.netIncomeThisMonth, href: undefined },
  ];

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Text muted>Double-entry ledger, payments, and financial statements.</Text>
      {canOverview ? (
        overview.error && !o ? (
          <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
        ) : (
          <View style={styles.kpis}>
            {kpis.map((k) => {
              const body = (
                <Card>
                  <Text variant="caption" muted>{k.label}</Text>
                  <Text variant="heading">{k.value === undefined ? '-' : formatRs(k.value)}</Text>
                </Card>
              );
              return (
                <View key={k.label} style={styles.kpi}>
                  {k.href ? (
                    <Link href={k.href as never} asChild>
                      <Pressable accessibilityRole="button" accessibilityLabel={k.label}>{body}</Pressable>
                    </Link>
                  ) : (
                    body
                  )}
                </View>
              );
            })}
          </View>
        )
      ) : null}
      {pages.map((p) => (
        <Link key={p.slug} href={p.href as never} asChild>
          <Pressable accessibilityRole="button" accessibilityLabel={p.label} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MaterialCommunityIcons name={p.icon} size={22} color={theme.primary} />
            <View style={styles.flex}>
              <Text variant="label">{p.label}</Text>
              <Text variant="caption" muted>{p.description}</Text>
            </View>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  kpi: { width: '47%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TOUCH_TARGET, padding: spacing.md, borderWidth: 1, borderRadius: radius.md },
});
