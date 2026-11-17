import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { ApiError, errorMessage } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useLogin } from '@/features/auth/use-auth';
import { spacing, useTheme } from '@/theme';

const schema = z.object({
  username: z.string().trim().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
  organization: z.string().trim().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const theme = useTheme();
  const login = useLogin();
  // The org field only appears after the server answers 409: the same username exists in several organizations.
  const [needsOrganization, setNeedsOrganization] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '', organization: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login.mutateAsync({
        username: values.username,
        password: values.password,
        organization: values.organization ? values.organization : undefined,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setNeedsOrganization(true);
        setFormError('This username exists in more than one organization. Enter your organization code.');
      } else {
        setFormError(errorMessage(err));
      }
    }
  });

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text variant="title">Medicore</Text>
            <Text muted>Sign in to your account</Text>
          </View>
          <Controller control={control} name="username" render={({ field }) => (
            <Input label="Username" autoCapitalize="none" autoCorrect={false} autoComplete="username" value={field.value} onChangeText={field.onChange} error={errors.username?.message} />
          )} />
          <Controller control={control} name="password" render={({ field }) => (
            <Input label="Password" secureToggle autoCapitalize="none" autoComplete="current-password" value={field.value} onChangeText={field.onChange} error={errors.password?.message} />
          )} />
          {needsOrganization ? (
            <Controller control={control} name="organization" render={({ field }) => (
              <Input label="Organization code" autoCapitalize="none" autoCorrect={false} value={field.value} onChangeText={field.onChange} />
            )} />
          ) : null}
          {formError ? <Text color={theme.danger} accessibilityRole="alert">{formError}</Text> : null}
          <Button label="Sign in" onPress={onSubmit} loading={login.isPending} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  header: { gap: spacing.xs, marginBottom: spacing.lg },
});
