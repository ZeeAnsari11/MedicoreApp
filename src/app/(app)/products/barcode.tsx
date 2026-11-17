import * as Print from 'expo-print';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormScreen } from '@/components/ui/form-screen';
import { Input } from '@/components/ui/input';
import { PickerField } from '@/components/ui/picker-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { BarcodeSvg } from '@/features/products/barcode-svg';
import {
  barcodeValueFor,
  buildLabelsHtml,
  clampLabelCount,
  tryEncodeBarcode,
  MAX_LABELS,
  type BarcodeFormat,
} from '@/features/products/barcode';
import { useProducts } from '@/features/products/use-products';
import { errorMessage } from '@/api/errors';
import { toast } from '@/store/toast';
import { spacing, useTheme } from '@/theme';

/** On-screen previews are capped; the printed page carries all requested labels. */
const PREVIEW_LIMIT = 6;

export default function BarcodeLabelScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { products, isLoading, error, refetch } = useProducts();
  const product = products.find((p) => p.id === id);
  const [format, setFormat] = useState<BarcodeFormat>('CODE128');
  const [countText, setCountText] = useState('1');
  const [printing, setPrinting] = useState(false);
  const count = clampLabelCount(Number(countText));

  const { value, usingFallback } = product ? barcodeValueFor(product) : { value: '', usingFallback: false };
  const encoded = value ? tryEncodeBarcode(value, format) : null;

  if (isLoading) return <LoadingState />;
  if (error && !product) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!product) return <EmptyState title="Product not found" />;

  const print = async () => {
    if (!encoded?.ok || printing) return;
    setPrinting(true);
    try {
      await Print.printAsync({ html: buildLabelsHtml(product, encoded.data, count) });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Print barcode labels' }} />
      <FormScreen>
        <Text variant="heading">{product.name}</Text>
        {usingFallback ? <Text color={theme.warning}>This product has no barcode set; labels will encode its internal product ID instead.</Text> : null}
        {encoded && !encoded.ok ? <Text color={theme.danger} accessibilityRole="alert">{encoded.message}</Text> : null}

        <PickerField
          label="Format"
          value={format}
          onChange={(v) => setFormat(v as BarcodeFormat)}
          options={[{ value: 'CODE128', label: 'Code 128' }, { value: 'EAN13', label: 'EAN-13 (12 digits)' }]}
        />
        <Input
          label={`Number of labels (1-${MAX_LABELS})`}
          value={countText}
          onChangeText={(t) => setCountText(t.replace(/[^0-9]/g, ''))}
          onBlur={() => setCountText(String(count))}
          keyboardType="number-pad"
        />

        {encoded?.ok ? (
          <>
            <View style={styles.grid}>
              {Array.from({ length: Math.min(count, PREVIEW_LIMIT) }, (_, i) => (
                <Card key={i} style={styles.label}>
                  <Text variant="caption" style={styles.center}>{product.name}</Text>
                  <BarcodeSvg encoded={encoded.data} />
                  <Text variant="caption" style={styles.center}>{encoded.data.text}</Text>
                  <Text variant="caption" muted style={styles.center}>{product.tp.toFixed(2)}</Text>
                </Card>
              ))}
            </View>
            {count > PREVIEW_LIMIT ? <Text variant="caption" muted>Previewing {PREVIEW_LIMIT} of {count} labels; all {count} will print.</Text> : null}
          </>
        ) : null}

        <Button label="Print" disabled={!encoded?.ok} loading={printing} onPress={print} />
      </FormScreen>
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  label: { flexBasis: '48%', flexGrow: 1, backgroundColor: '#FFFFFF', gap: spacing.xs },
  center: { textAlign: 'center', color: '#000000' },
});
