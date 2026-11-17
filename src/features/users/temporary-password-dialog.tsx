import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormModal } from '@/components/ui/form-modal';
import { Text } from '@/components/ui/text';
import { spacing } from '@/theme';

/**
 * Shown once after a user is created: the server returns the temporary password only in that response. It lives in this
 * component's props only, never in the query cache, the toast or storage.
 */
export function TemporaryPasswordDialog({ username, password, onDone }: { username: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(password);
    setCopied(true);
  };
  return (
    <FormModal visible title="User Created Successfully" onClose={onDone}>
      <View style={styles.body}>
        <Text>Share this temporary password with {username}. It is shown only once and cannot be retrieved later.</Text>
        <Text variant="title" selectable accessibilityLabel="Temporary password" style={styles.password}>{password}</Text>
        <Button label={copied ? 'Copied' : 'Copy password'} variant="secondary" onPress={() => void copy()} />
        <Button label="Done" onPress={onDone} />
      </View>
    </FormModal>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.lg },
  password: { fontFamily: 'monospace', textAlign: 'center' },
});
