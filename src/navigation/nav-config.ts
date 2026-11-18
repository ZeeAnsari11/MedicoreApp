import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface NavItem {
  label: string;
  /** Expo Router path. Items whose screen isn't built yet are omitted from this list until their module ships. */
  href: string;
  icon: IconName;
  /** Visible if the user holds ANY of these (same semantics as the web `requires.anyOf`). Omitted = always visible. */
  anyOf?: string[];
}
export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Mirrors apps/web/src/components/layout/nav-config.ts. New modules are appended here as they are implemented. */
export const navSections: NavSection[] = [
  { title: 'Overview', items: [{ label: 'Dashboard', href: '/', icon: 'view-dashboard-outline', anyOf: ['dashboard:read'] }] },
  {
    title: 'Catalog',
    items: [
      { label: 'Manufacturers', href: '/manufacturers', icon: 'factory', anyOf: ['manufacturers:read'] },
      { label: 'Vendors', href: '/vendors', icon: 'truck-outline', anyOf: ['vendors:read'] },
      { label: 'Products', href: '/products', icon: 'pill', anyOf: ['products:read'] },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Inventory', href: '/inventory', icon: 'warehouse', anyOf: ['inventory:read'] },
      { label: 'Sales', href: '/sales', icon: 'receipt-text-outline', anyOf: ['sales:read'] },
      { label: 'Purchases', href: '/purchases', icon: 'cart-arrow-down', anyOf: ['purchases:read'] },
      { label: 'Process Orders', href: '/sales/process-orders', icon: 'clipboard-check-outline', anyOf: ['process_orders:read'] },
      { label: 'Cash Receipt', href: '/sales/cash-receipt', icon: 'hand-coin-outline', anyOf: ['cash_receipt:read'] },
      { label: 'Cash Receipt Transactions', href: '/sales/cash-receipt-transactions', icon: 'format-list-checks', anyOf: ['cash_receipt:read'] },
      { label: 'Customers', href: '/customers', icon: 'account-group-outline', anyOf: ['customers:read'] },
    ],
  },
  {
    title: 'Accounting',
    items: [
      { label: 'Overview', href: '/accounting', icon: 'calculator-variant-outline', anyOf: ['acc_overview:read'] },
      { label: 'Chart of Accounts', href: '/accounting/chart-of-accounts', icon: 'file-tree-outline', anyOf: ['acc_chart_of_accounts:read'] },
      { label: 'Payments', href: '/accounting/payments', icon: 'cash-multiple', anyOf: ['acc_payments:read'] },
      { label: 'Expenses', href: '/accounting/expenses', icon: 'receipt-outline', anyOf: ['acc_expenses:read'] },
      { label: 'Journal Entries', href: '/accounting/journal-entries', icon: 'book-open-page-variant-outline', anyOf: ['acc_journal_entries:read'] },
      { label: 'Customer Ledger', href: '/accounting/customer-ledger', icon: 'account-cash-outline', anyOf: ['acc_customer_ledger:read'] },
      { label: 'Vendor Ledger', href: '/accounting/vendor-ledger', icon: 'truck-outline', anyOf: ['acc_vendor_ledger:read'] },
      { label: 'General Ledger', href: '/accounting/general-ledger', icon: 'book-open-page-variant-outline', anyOf: ['acc_general_ledger:read'] },
      { label: 'Trial Balance', href: '/accounting/trial-balance', icon: 'scale-balance', anyOf: ['acc_trial_balance:read'] },
      { label: 'Profit & Loss', href: '/accounting/profit-loss', icon: 'chart-line', anyOf: ['acc_profit_loss:read'] },
      { label: 'Balance Sheet', href: '/accounting/balance-sheet', icon: 'file-chart-outline', anyOf: ['acc_balance_sheet:read'] },
      { label: 'Returns', href: '/accounting/returns', icon: 'keyboard-return', anyOf: ['acc_returns:read'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Branches', href: '/administration/branches', icon: 'source-branch', anyOf: ['branches:read'] },
      { label: 'Roles', href: '/administration/roles', icon: 'shield-account-outline', anyOf: ['roles:read'] },
      { label: 'Users', href: '/administration/users', icon: 'account-multiple-outline', anyOf: ['users:read'] },
    ],
  },
  { title: 'Insights', items: [{ label: 'SSR', href: '/reports/ssr', icon: 'chart-bar', anyOf: ['ssr:read'] }] },
  { title: 'Workspace', items: [{ label: 'Settings', href: '/settings', icon: 'cog-outline' }] },
];
