import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { mutationErrorMessage } from '@/lib/api-error-message';
import { useSubmitGuard } from '@/lib/use-submit-guard';
import { radius, spacing, useTheme } from '@/theme';

/**
 * Submit wrapper for the Administration dialogs. A second tap while a request is in flight is ignored, and a failure
 * keeps the dialog open with the backend's message (the toast from the mutation can sit behind a modal).
 * Resolves true only when the request succeeded.
 */
export function useDialogSubmit() {
  const guard = useSubmitGuard();
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (action: () => Promise<unknown>, fallback = 'Something went wrong'): Promise<boolean> => {
      const outcome = await guard.run(async () => {
        setError(null);
        try {
          await action();
          return true;
        } catch (e) {
          setError(mutationErrorMessage(e, fallback));
          return false;
        }
      });
      return outcome === true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guard.run],
  );
  return { run, busy: guard.busy, error };
}

export function DialogError({ message }: { message: string | null }) {
  const theme = useTheme();
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={[styles.box, { borderColor: theme.danger }]}>
      <Text color={theme.danger}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
});
