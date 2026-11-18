import { MaterialCommunityIcons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomBar } from '@/components/ui/bottom-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { parseNumber } from '@/lib/numbers';
import { radius, spacing, useTheme } from '@/theme';
import { PaymentStatus } from '@/types/medicore';

const STATUSES = [
  { value: PaymentStatus.UNPAID, label: 'Unpaid' },
  { value: PaymentStatus.PARTIAL, label: 'Partial' },
  { value: PaymentStatus.PAID, label: 'Paid' },
];

interface Props {
  visible: boolean;
  summary: { customer: string; method: string; orderBooker: string; lineCount: number; units: number };
  grandTotal: number;
  paymentStatus: PaymentStatus;
  onPaymentStatus: (status: PaymentStatus) => void;
  amountPaid: string;
  onAmountPaid: (value: string) => void;
  error: string | null;
  busy: boolean;
  onComplete: () => void;
  onClose: () => void;
}

/** Screen 3 of New Sale: review, payment status and amount paid, then Complete Sale (same rules as the web form). */
export function PaymentSheet({ visible, summary, grandTotal, paymentStatus, onPaymentStatus, amountPaid, onAmountPaid, error, busy, onComplete, onClose }: Props) {
  const theme = useTheme();
  const balance = Math.max(grandTotal - (parseNumber(amountPaid) ?? 0), 0);
  const row = (label: string, value: string) => (
    <View style={styles.summaryRow}>
      <Text muted>{label}</Text>
      <Text variant="label" numberOfLines={1} style={styles.value}>{value}</Text>
    </View>
  );
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} hitSlop={8}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <View style={styles.flex}>
            <Text variant="heading">Payment</Text>
            <Text variant="caption" muted>Review and complete the sale</Text>
          </View>
        </View>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {row('Customer', summary.customer)}
              {row('Payment method', summary.method)}
              {row('Order booker', summary.orderBooker)}
              {row('Items', `${summary.lineCount} ${summary.lineCount === 1 ? 'line' : 'lines'} · ${summary.units} ${summary.units === 1 ? 'unit' : 'units'}`)}
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <View style={styles.summaryRow}>
                <Text muted>Grand total</Text>
                <Text variant="title">{grandTotal.toFixed(2)}</Text>
              </View>
            </View>
            <SegmentedControl label="Payment status" value={paymentStatus} options={STATUSES} onChange={onPaymentStatus} />
            <Input label="Amount paid" value={amountPaid} onChangeText={onAmountPaid} keyboardType="decimal-pad" invalid={!!error} />
            <View style={styles.summaryRow}>
              <Text muted>Balance due</Text>
              <Text variant="label">{balance.toFixed(2)}</Text>
            </View>
            {error ? <Text accessibilityRole="alert" color={theme.danger}>{error}</Text> : null}
            <Text variant="caption" muted>Totals here are estimates from the lines; the server calculates the final invoice total.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
        <BottomBar>
          <View style={styles.cancel}><Button label="Cancel" variant="secondary" disabled={busy} onPress={onClose} /></View>
          <View style={styles.complete}><Button label="Complete Sale" loading={busy} onPress={onComplete} /></View>
        </BottomBar>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  value: { flexShrink: 1, textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
  cancel: { flex: 1 },
  complete: { flex: 2 },
});
