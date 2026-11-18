import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { radius, spacing, TOUCH_TARGET, useTheme } from '@/theme';

import { Text } from './text';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  /** Red border without a message under the field (the caller shows the message itself). */
  invalid?: boolean;
  /** Adds a show/hide toggle (passwords). */
  secureToggle?: boolean;
}

export function Input({ label, error, invalid, secureToggle, style, ...rest }: Props) {
  const theme = useTheme();
  const [hidden, setHidden] = useState(true);
  return (
    <View style={styles.wrap}>
      <Text variant="label" muted>{label}</Text>
      <View style={[styles.field, { backgroundColor: theme.surface, borderColor: error || invalid ? theme.danger : theme.border }]}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={theme.textMuted}
          {...rest}
          secureTextEntry={secureToggle ? hidden : rest.secureTextEntry}
          style={[styles.input, { color: theme.text }, style]}
        />
        {secureToggle ? (
          <Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Show password' : 'Hide password'} onPress={() => setHidden((h) => !h)} style={styles.toggle}>
            <Text variant="label" color={theme.primary}>{hidden ? 'Show' : 'Hide'}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text variant="caption" color={theme.danger}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, minHeight: TOUCH_TARGET },
  input: { flex: 1, paddingHorizontal: spacing.md, fontSize: 15, minHeight: TOUCH_TARGET },
  toggle: { paddingHorizontal: spacing.md, minHeight: TOUCH_TARGET, justifyContent: 'center' },
});
