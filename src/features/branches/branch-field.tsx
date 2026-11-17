import { PickerField } from '@/components/ui/picker-field';
import { Input } from '@/components/ui/input';

import type { BranchFieldState } from './use-branch-field';

/** Required Branch field for create forms. Locked (read-only) for branch users and single-branch admins. */
export function BranchField({ field, value, onChange, error }: { field: BranchFieldState; value: string; onChange: (branchId: string) => void; error?: string }) {
  if (field.locked) return <Input label="Branch" value={field.lockedBranchName} editable={false} />;
  return (
    <PickerField
      label="Branch"
      required
      value={value}
      onChange={onChange}
      error={error}
      placeholder="Select branch"
      options={field.branches.map((b) => ({ value: b.id, label: b.isMain ? `${b.name} (Main)` : b.name }))}
    />
  );
}
