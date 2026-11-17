import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useAccountingOverview, useDashboardSummary } from '@/features/dashboard/use-dashboard';
import { formatInt, formatRs } from '@/lib/format';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { spacing, useTheme } from '@/theme';
import { SystemRole } from '@/types/medicore';

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.kpi}>
      <Text variant="caption" muted>{label}</Text>
      <Text variant="heading">{value}</Text>
    </Card>
  );
}

export default function DashboardScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { user, has, hasAnyModule } = useAuth();
  const { branchId } = useBranchFilter();
  const [refreshing, setRefreshing] = useState(false);

  const isPlatformAdmin = user?.systemRole === SystemRole.SUPER_ADMIN;
  const canView = has('dashboard:read') && !isPlatformAdmin;
  const summary = useDashboardSummary(branchId);
  const finance = useAccountingOverview(has('acc_overview:read') && !isPlatformAdmin);

  const refresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setRefreshing(false);
  };

  if (isPlatformAdmin) {
    return <EmptyState title="Platform administration" message="Platform admin screens (tenants, plans, subscriptions) are not available in this build yet." />;
  }
  if (!hasAnyModule) return <EmptyState title="No modules assigned" message="Contact your administrator to get access." />;
  if (!canView) return <EmptyState title="No access" message="You don't have permission to view the dashboard." />;
  if (summary.isLoading) return <LoadingState />;
  if (summary.isError && !summary.data) return <ErrorState error={summary.error} onRetry={() => summary.refetch()} />;
  const data = summary.data;
  if (!data) return null;

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Text variant="title">Welcome back, {user?.fullName ?? user?.username}</Text>
      <BranchFilter />

      <Text variant="heading">Overview</Text>
      <View style={styles.grid}>
        <Kpi label="Sales orders" value={formatInt(data.totals.salesOrders)} />
        <Kpi label="Today's sales" value={formatRs(data.totals.salesAmountToday)} />
        <Kpi label="Purchase orders" value={formatInt(data.totals.purchaseOrders)} />
        <Kpi label="Open invoices" value={formatInt(data.totals.openInvoices)} />
        <Kpi label="Customers" value={formatInt(data.catalog.customers)} />
        <Kpi label="Vendors" value={formatInt(data.catalog.vendors)} />
        <Kpi label="Products" value={formatInt(data.catalog.products)} />
        <Kpi label="Manufacturers" value={formatInt(data.catalog.manufacturers)} />
        <Kpi label="Branches" value={formatInt(data.catalog.branches)} />
      </View>

      {finance.data ? (
        <>
          <Text variant="heading">Finance</Text>
          <View style={styles.grid}>
            <Kpi label="Accounts receivable" value={formatRs(finance.data.totalReceivable)} />
            <Kpi label="Accounts payable" value={formatRs(finance.data.totalPayable)} />
            <Kpi label="Cash + bank" value={formatRs(finance.data.cashAndBankBalance)} />
            <Kpi label="Net income (this month)" value={formatRs(finance.data.netIncomeThisMonth)} />
          </View>
        </>
      ) : null}

      {data.branches.length > 0 ? (
        <>
          <Text variant="heading">By branch</Text>
          {data.branches.map((b) => (
            <Card key={b.branchId}>
              <Text variant="label">{b.branchName}</Text>
              <Text muted>Sales: {formatInt(b.salesOrders)} orders · {formatRs(b.salesAmount)}</Text>
              <Text muted>Today: {formatInt(b.salesOrdersToday)} orders · {formatRs(b.salesAmountToday)}</Text>
              <Text muted>Purchases: {formatInt(b.purchaseOrders)} ({formatInt(b.purchaseOrdersToday)} today)</Text>
            </Card>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kpi: { flexBasis: '48%', flexGrow: 1 },
});
