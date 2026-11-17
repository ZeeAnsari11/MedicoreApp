import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { SearchBar } from '@/components/ui/search-bar';
import { SwitchRow } from '@/components/ui/switch-row';
import { Text } from '@/components/ui/text';
import { useOrderBookers } from '@/features/sales/use-sales';
import { spacing } from '@/theme';

/** Web `UserFilter` + `MultiSelect`: pick order bookers; only mounted for users who can view every sale. */
export function OrderBookerFilter({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { orderBookers } = useOrderBookers(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const options = orderBookers.filter((o) => !needle || o.name.toLowerCase().includes(needle));
  const label = value.length ? `Order Booker (${value.length})` : 'All order bookers';
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <View>
      <Button label={label} variant="secondary" onPress={() => setOpen(true)} />
      {open ? (
        <FormModal visible title="Order Booker" onClose={() => setOpen(false)}>
          <View style={styles.pad}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search..." />
            {value.length ? <Button label="Clear" variant="secondary" onPress={() => onChange([])} /> : null}
            <FlatList
              data={options}
              keyExtractor={(o) => o.id}
              ListEmptyComponent={<Text muted>Nothing found.</Text>}
              renderItem={({ item }) => <SwitchRow label={item.name} value={value.includes(item.id)} onValueChange={() => toggle(item.id)} />}
            />
          </View>
        </FormModal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ pad: { flex: 1, padding: spacing.lg, gap: spacing.md } });
