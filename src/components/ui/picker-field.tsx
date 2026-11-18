import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

import { Button } from './button';
import { SearchBar } from './search-bar';
import { Text } from './text';

export interface PickerOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  label: string;
  value: string | undefined;
  options: PickerOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  /** Marks the field required in the label. */
  required?: boolean;
  /** Shows a "clear" row (optional fields). */
  clearable?: boolean;
  /** Adds a "Create new …" row (the web's ComboboxWithCreate); the caller opens its own create form. */
  onCreateNew?: () => void;
  createLabel?: string;
  /** Replaces the default labelled field (e.g. a summary row); gets `open` to show the same searchable sheet. */
  renderTrigger?: (trigger: { open: () => void; selectedLabel?: string }) => ReactNode;
}

/** Searchable single-select opened as a full-screen sheet; replaces the web Select / Combobox. */
export function PickerField({ label, value, options, onChange, placeholder = 'Select', disabled, error, required, clearable, onCreateNew, createLabel, renderTrigger }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={styles.wrap}>
      {renderTrigger ? (
        renderTrigger({ open: () => setOpen(true), selectedLabel: selected?.label })
      ) : (
        <>
          <Text variant="label" muted>
            {label}
            {required ? <Text variant="label" color={theme.danger}> *</Text> : null}
          </Text>
          <Pressable
            accessibilityRole="combobox"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !!disabled }}
            disabled={disabled}
            onPress={() => setOpen(true)}
            style={[styles.field, { backgroundColor: theme.surface, borderColor: error ? theme.danger : theme.border, opacity: disabled ? 0.6 : 1 }]}
          >
            <Text color={selected ? theme.text : theme.textMuted} numberOfLines={1} style={styles.flex}>{selected?.label ?? placeholder}</Text>
            <Text color={theme.textMuted}>▾</Text>
          </Pressable>
          {error ? <Text variant="caption" color={theme.danger}>{error}</Text> : null}
        </>
      )}

      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
          <View style={styles.sheetHeader}>
            <Text variant="heading" style={styles.flex}>{label}</Text>
            <Button label="Close" variant="secondary" onPress={close} />
          </View>
          <View style={styles.searchWrap}>
            <SearchBar value={query} onChangeText={setQuery} placeholder={`Search ${label.toLowerCase()}`} />
          </View>
          <FlatList
            data={visible}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View>
                {onCreateNew ? (
                  <Pressable accessibilityRole="button" onPress={() => { close(); onCreateNew(); }} style={[styles.row, { borderColor: theme.border }]}>
                    <Text color={theme.primary} variant="label">+ {createLabel ?? 'Create new'}</Text>
                  </Pressable>
                ) : null}
                {clearable && value ? (
                  <Pressable accessibilityRole="button" onPress={() => { onChange(''); close(); }} style={[styles.row, { borderColor: theme.border }]}>
                    <Text muted>Clear selection</Text>
                  </Pressable>
                ) : null}
              </View>
            }
            ListEmptyComponent={<Text muted style={styles.empty}>No matches</Text>}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.value === value }}
                onPress={() => { onChange(item.value); close(); }}
                style={[styles.row, { borderColor: theme.border, backgroundColor: item.value === value ? theme.surfaceMuted : 'transparent' }]}
              >
                <Text>{item.label}</Text>
                {item.hint ? <Text variant="caption" muted>{item.hint}</Text> : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: spacing.xs },
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, minHeight: TOUCH_TARGET, paddingHorizontal: spacing.md },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  searchWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  row: { minHeight: TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  empty: { padding: spacing.xl, textAlign: 'center' },
});
