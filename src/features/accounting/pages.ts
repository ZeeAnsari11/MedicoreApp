import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface AccountingPage {
  slug: string;
  label: string;
  description: string;
  href: string;
  icon: IconName;
}

/** The web accounting sub-pages (same labels, descriptions and `acc_<slug>:read` gates as the web hub). */
export const ACCOUNTING_PAGES: AccountingPage[] = [
  { slug: 'chart_of_accounts', label: 'Chart of Accounts', description: 'Manage the accounts your business books post to.', href: '/accounting/chart-of-accounts', icon: 'file-tree-outline' },
  { slug: 'customer_ledger', label: 'Customer Ledger', description: 'Per-customer running balance: invoices, payments, advances.', href: '/accounting/customer-ledger', icon: 'account-cash-outline' },
  { slug: 'vendor_ledger', label: 'Vendor Ledger', description: 'Per-vendor payable history and advances.', href: '/accounting/vendor-ledger', icon: 'truck-outline' },
  { slug: 'payments', label: 'Payments', description: 'Record and allocate customer/vendor payments.', href: '/accounting/payments', icon: 'cash-multiple' },
  { slug: 'expenses', label: 'Expenses', description: 'Record operating expenses and bank charges.', href: '/accounting/expenses', icon: 'receipt-outline' },
  { slug: 'returns', label: 'Returns', description: 'Sale and purchase returns with cumulative quantity tracking.', href: '/accounting/returns', icon: 'keyboard-return' },
  { slug: 'general_ledger', label: 'General Ledger', description: 'Transaction history for any account.', href: '/accounting/general-ledger', icon: 'book-open-page-variant-outline' },
  { slug: 'journal_entries', label: 'Journal Entries', description: 'Every posted entry, plus manual adjustments.', href: '/accounting/journal-entries', icon: 'notebook-edit-outline' },
  { slug: 'trial_balance', label: 'Trial Balance', description: 'Debit/credit balance for every account.', href: '/accounting/trial-balance', icon: 'scale-balance' },
  { slug: 'profit_loss', label: 'Profit & Loss', description: 'Revenue vs expenses for a date range.', href: '/accounting/profit-loss', icon: 'chart-line' },
  { slug: 'balance_sheet', label: 'Balance Sheet', description: 'Assets, liabilities, and equity as of a date.', href: '/accounting/balance-sheet', icon: 'file-chart-outline' },
];

export const readKey = (slug: string) => `acc_${slug}:read`;
