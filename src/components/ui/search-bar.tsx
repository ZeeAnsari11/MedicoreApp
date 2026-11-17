import { StyleSheet, TextInput, View } from 'react-native';

import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}

export function SearchBar({ value, onChangeText, placeholder }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[styles.input, { color: theme.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: radius.md, minHeight: TOUCH_TARGET },
  input: { flex: 1, paddingHorizontal: spacing.md, fontSize: 15, minHeight: TOUCH_TARGET },
});
