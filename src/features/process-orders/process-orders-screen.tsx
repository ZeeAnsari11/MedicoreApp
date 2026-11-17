import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { BranchFilter } from '@/components/branch-filter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormModal } from '@/components/ui/form-modal';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/use-auth';
import { useBranchFilter } from '@/features/branches/use-branch-filter';
import { confirmAction } from '@/lib/confirm';
import { isValidIsoDate } from '@/lib/dates';
import { formatInt, formatRs } from '@/lib/format';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { spacing, useTheme } from '@/theme';
import type { PendingOrderRow } from '@/types/medicore';

import { pakistanToday, processDialog, pruneSelection, selectionState, toggleAll, toggleOrder, type ProcessAction } from './logic';
import { usePendingOrderSummary, usePendingOrders, usePendingOrdersPreview, useProcessOrders } from './use-process-orders';

/** Port of the web Process Orders page: pick a day (and branch), pick an Order Booker, then confirm or reject their pending orders. */
export function ProcessOrdersScreen() {
  const { has, user, isLoading: authLoading, profileError, refetchProfile } = useAuth();
  const { branchId } = useBranchFilter();
  const [date, setDate] = useState(() => pakistanToday());
  const [bookerId, setBookerId] = useState<string | null>(null);

  // Web: the date input has max=today and a plain yyyy-mm-dd is what the server expects.
  const dateError = !isValidIsoDate(date) ? 'Enter a valid date as YYYY-MM-DD' : date > pakistanToday() ? 'The date cannot be in the future' : undefined;
  const activeDate = dateError ? '' : date;

  // Permissions arrive with /auth/me; until then "no permission" would be a false answer.
  if (authLoading) return <LoadingState />;
  // A failed profile load is not the same as having no permission: say so and let the user retry.
  if (profileError && !user) return <ErrorState error={profileError} onRetry={() => void refetchProfile()} />;
  if (!has('process_orders:read')) return <EmptyState title="No access" message="You do not have permission to process orders." />;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Input
          label="Date (YYYY-MM-DD)"
          value={date}
          onChangeText={(v) => { setDate(v.trim()); setBookerId(null); }}
          autoCapitalize="none"
          error={dateError}
        />
        <BranchFilter />
      </View>
      {dateError ? null : bookerId ? (
        <BookerOrders key={`${activeDate}|${bookerId}`} date={activeDate} bookerId={bookerId} branchId={branchId} onBack={() => setBookerId(null)} />
      ) : (
        <BookerSummary date={activeDate} branchId={branchId} onPick={setBookerId} />
      )}
    </View>
  );
}

function BookerSummary({ date, branchId, onPick }: { date: string; branchId: string | null; onPick: (id: string) => void }) {
  const { summary, isLoading, isFetching, error, refetch } = usePendingOrderSummary(date, branchId);
  if (isLoading) return <LoadingState />;
  if (error && summary.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={summary}
      keyExtractor={(s) => s.orderBookerId}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refetch()} />}
      ListEmptyComponent={<EmptyState title="No pending orders for this date." />}
      ListHeaderComponent={<Text variant="caption" muted>{isFetching ? 'Refreshing…' : 'Choose an Order Booker to review their pending orders.'}</Text>}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`Orders of ${item.orderBookerName}`} onPress={() => onPick(item.orderBookerId)}>
          <Card>
            <View style={styles.between}>
              <Text variant="heading" style={styles.flex}>{item.orderBookerName}</Text>
              <Text variant="label">{formatInt(item.count)} {item.count === 1 ? 'order' : 'orders'}</Text>
            </View>
          </Card>
        </Pressable>
      )}
    />
  );
}

function BookerOrders({ date, bookerId, branchId, onBack }: { date: string; bookerId: string; branchId: string | null; onBack: () => void }) {
  const theme = useTheme();
  const { summary } = usePendingOrderSummary(date, branchId);
  const { orders, isLoading, error, refetch } = usePendingOrders(date, bookerId, branchId);
  const api = useProcessOrders(branchId);
  const guard = useSubmitGuard();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [running, setRunning] = useState<ProcessAction | null>(null);
  const preview = usePendingOrdersPreview(date, bookerId, branchId, previewOpen);

  const selected = useMemo(() => pruneSelection(picked, orders), [picked, orders]);
  const state = selectionState(selected, orders);
  const busy = guard.busy || api.isProcessing;
  const bookerName = summary.find((s) => s.orderBookerId === bookerId)?.orderBookerName;

  const run = (action: ProcessAction) =>
    guard.run(async () => {
      const ids = [...selected];
      if (ids.length === 0) return;
      if (!(await confirmAction(processDialog(action, ids.length)))) return;
      setRunning(action);
      try {
        await (action === 'confirm' ? api.confirm(ids) : api.reject(ids));
        setPicked(new Set());
      } catch {
        // toasted by the mutation; the selection is kept so it can be retried
      } finally {
        setRunning(null);
      }
    });

  if (isLoading) return <LoadingState />;
  if (error && orders.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <>
      <FlatList
        contentContainerStyle={styles.list}
        data={orders}
        keyExtractor={(o) => o.id}
        extraData={selected}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refetch()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button label="← All Order Bookers" variant="secondary" onPress={onBack} />
            <Text variant="heading">{bookerName ?? 'Order Booker'}</Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel="Select all orders"
              accessibilityState={{ checked: state === 'all' ? true : state === 'some' ? 'mixed' : false, disabled: orders.length === 0 }}
              disabled={orders.length === 0 || busy}
              onPress={() => setPicked(toggleAll(selected, orders))}
              style={styles.row}
            >
              <MaterialCommunityIcons name={state === 'all' ? 'checkbox-marked' : state === 'some' ? 'minus-box' : 'checkbox-blank-outline'} size={24} color={theme.primary} />
              <Text>{selected.size} {selected.size === 1 ? 'order' : 'orders'} selected</Text>
            </Pressable>
            <Button label="Confirm Selected" loading={running === 'confirm'} disabled={selected.size === 0 || busy} onPress={() => void run('confirm')} />
            <Button label="Reject Selected" variant="danger" loading={running === 'reject'} disabled={selected.size === 0 || busy} onPress={() => void run('reject')} />
            <Button label="Preview" variant="secondary" disabled={orders.length === 0 || busy} onPress={() => setPreviewOpen(true)} />
          </View>
        }
        ListEmptyComponent={<EmptyState title="No pending orders left for this Order Booker." />}
        renderItem={({ item }) => <OrderRow order={item} checked={selected.has(item.id)} disabled={busy} onToggle={() => setPicked(toggleOrder(selected, item.id))} branchId={branchId} />}
      />
      <FormModal visible={previewOpen} title="Pending orders preview" onClose={() => setPreviewOpen(false)}>
        {preview.isLoading ? <LoadingState /> : preview.error ? <ErrorState error={preview.error} onRetry={() => preview.refetch()} /> : (
          <ScrollView contentContainerStyle={styles.list}>
            {preview.orders.map((o) => (
              <Card key={o.id}>
                <View style={styles.between}>
                  <Text variant="label">{o.orderNumber}</Text>
                  <Text variant="label">{formatRs(o.grandTotal)}</Text>
                </View>
                <Text muted>{o.customerName ?? 'Walk-in customer'}</Text>
                {o.items.map((i, idx) => (
                  <Text key={`${i.productId}-${idx}`} variant="caption" muted>{i.productName} · {i.quantity} × {formatRs(i.unitPrice)} = {formatRs(i.lineTotal)}</Text>
                ))}
              </Card>
            ))}
            <Text variant="label">Total: {formatRs(preview.orders.reduce((sum, o) => sum + o.grandTotal, 0))}</Text>
          </ScrollView>
        )}
      </FormModal>
    </>
  );
}

function OrderRow({ order, checked, disabled, onToggle, branchId }: { order: PendingOrderRow; checked: boolean; disabled: boolean; onToggle: () => void; branchId: string | null }) {
  const theme = useTheme();
  return (
    <Card>
      <View style={styles.row}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`Select ${order.orderNumber}`} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onToggle} hitSlop={8}>
          <MaterialCommunityIcons name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={theme.primary} />
        </Pressable>
        <Pressable
          style={styles.flex}
          accessibilityRole="link"
          accessibilityLabel={`Open ${order.orderNumber}`}
          onPress={() => router.push({ pathname: '/sales/detail', params: { id: order.id, ...(branchId ? { branchId } : {}) } } as never)}
        >
          <Text variant="label">{order.orderNumber}</Text>
        </Pressable>
        <Text variant="label">{formatRs(order.grandTotal)}</Text>
      </View>
      <Text muted>{order.customerName ?? 'Walk-in customer'} · {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}</Text>
      <Text variant="caption" muted>{new Date(order.placedAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' })}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
