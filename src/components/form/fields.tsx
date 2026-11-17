import type { KeyboardTypeOptions } from 'react-native';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { PickerField, type PickerOption } from '@/components/ui/picker-field';

interface TextFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  multiline?: boolean;
}

export function TextField<T extends FieldValues>({ control, name, label, placeholder, keyboardType, autoCapitalize = 'sentences', editable = true, multiline }: TextFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Input
          label={label}
          placeholder={placeholder}
          value={(field.value as string | undefined) ?? ''}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          multiline={multiline}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

interface PickerControllerProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  options: PickerOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  onCreateNew?: () => void;
  createLabel?: string;
  onChangeExtra?: (value: string) => void;
}

export function PickerController<T extends FieldValues>({ control, name, onChangeExtra, ...rest }: PickerControllerProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <PickerField
          {...rest}
          value={(field.value as string | undefined) ?? ''}
          onChange={(v) => {
            field.onChange(v);
            onChangeExtra?.(v);
          }}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}
