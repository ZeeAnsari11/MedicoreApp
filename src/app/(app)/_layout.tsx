import { Stack } from 'expo-router';

import { PlatformOnlyScreen } from '@/features/auth/platform-only-screen';
import { useAuth } from '@/features/auth/use-auth';
import { useTheme } from '@/theme';
import { SystemRole } from '@/types/medicore';

export default function AppLayout() {
  const theme = useTheme();
  const { user, logout } = useAuth();
  // Same rule as the web shell: the platform super admin never sees pharmacy screens (no routes, no deep links).
  if (user?.systemRole === SystemRole.SUPER_ADMIN) return <PlatformOnlyScreen username={user.username} onSignOut={logout} />;
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: theme.surface }, headerTintColor: theme.text, contentStyle: { backgroundColor: theme.background } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="manufacturers/index" options={{ title: 'Manufacturers' }} />
      <Stack.Screen name="vendors/index" options={{ title: 'Vendors' }} />
      <Stack.Screen name="vendors/pricing/index" options={{ title: 'Vendor Product Pricing' }} />
      <Stack.Screen name="products/index" options={{ title: 'Products' }} />
      <Stack.Screen name="customers/index" options={{ title: 'Customers' }} />
      <Stack.Screen name="sales/index" options={{ title: 'Sales' }} />
      <Stack.Screen name="sales/new" options={{ title: 'New Sale' }} />
      <Stack.Screen name="sales/edit" options={{ title: 'Edit Sale' }} />
      <Stack.Screen name="sales/detail" options={{ title: 'Sale' }} />
      <Stack.Screen name="sales/return" options={{ title: 'Sale Return' }} />
      <Stack.Screen name="sales/process-orders" options={{ title: 'Process Orders' }} />
      <Stack.Screen name="sales/cash-receipt" options={{ title: 'Cash Receipt' }} />
      <Stack.Screen name="sales/cash-receipt-transactions" options={{ title: 'Cash Receipt Transactions' }} />
      <Stack.Screen name="purchases/index" options={{ title: 'Purchases' }} />
      <Stack.Screen name="purchases/new" options={{ title: 'Receive Purchase' }} />
      <Stack.Screen name="purchases/edit" options={{ title: 'Edit Purchase' }} />
      <Stack.Screen name="purchases/detail" options={{ title: 'Purchase' }} />
      <Stack.Screen name="purchases/return" options={{ title: 'Purchase Return' }} />
      <Stack.Screen name="accounting/index" options={{ title: 'Accounting' }} />
      <Stack.Screen name="accounting/chart-of-accounts" options={{ title: 'Chart of Accounts' }} />
      <Stack.Screen name="accounting/payments" options={{ title: 'Payments' }} />
      <Stack.Screen name="accounting/expenses" options={{ title: 'Expenses' }} />
      <Stack.Screen name="accounting/journal-entries" options={{ title: 'Journal Entries' }} />
      <Stack.Screen name="accounting/journal-detail" options={{ title: 'Journal Entry' }} />
      <Stack.Screen name="accounting/customer-ledger" options={{ title: 'Customer Ledger' }} />
      <Stack.Screen name="accounting/vendor-ledger" options={{ title: 'Vendor Ledger' }} />
      <Stack.Screen name="accounting/general-ledger" options={{ title: 'General Ledger' }} />
      <Stack.Screen name="accounting/trial-balance" options={{ title: 'Trial Balance' }} />
      <Stack.Screen name="accounting/profit-loss" options={{ title: 'Profit & Loss' }} />
      <Stack.Screen name="accounting/balance-sheet" options={{ title: 'Balance Sheet' }} />
      <Stack.Screen name="accounting/returns" options={{ title: 'Returns' }} />
      <Stack.Screen name="reports/ssr" options={{ title: 'SSR' }} />
      <Stack.Screen name="administration/branches" options={{ title: 'Branches' }} />
      <Stack.Screen name="administration/roles" options={{ title: 'Roles' }} />
      <Stack.Screen name="administration/users" options={{ title: 'Users' }} />
      <Stack.Screen name="administration/permissions" options={{ title: 'Permissions' }} />
      <Stack.Screen name="inventory/index" options={{ title: 'Inventory' }} />
      <Stack.Screen name="inventory/transfers/index" options={{ title: 'Stock Transfers' }} />
      <Stack.Screen name="inventory/expiring" options={{ title: 'Expiring Stock' }} />
    </Stack>
  );
}
