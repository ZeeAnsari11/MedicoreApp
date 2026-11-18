import type { Pill } from '@/components/document-card';
import { PaymentStatus, ReturnStatus } from '@/types/medicore';

/** Payment pill shared by purchase and sale cards. */
export const PAYMENT_PILL: Record<PaymentStatus, Pill> = {
  [PaymentStatus.PAID]: { label: 'PAID', tone: 'success', icon: 'check-circle-outline' },
  [PaymentStatus.PARTIAL]: { label: 'PARTIALLY PAID', tone: 'warning', icon: 'progress-check' },
  [PaymentStatus.UNPAID]: { label: 'UNPAID', tone: 'warning', icon: 'alert-circle-outline' },
};

/** Returns pill, or null when nothing has been returned. */
export const returnPill = (status?: ReturnStatus | string): Pill | null =>
  status === ReturnStatus.PARTIAL
    ? { label: 'PARTIALLY RETURNED', tone: 'warning', icon: 'undo-variant' }
    : status === ReturnStatus.FULL
      ? { label: 'FULLY RETURNED', tone: 'neutral', icon: 'undo-variant' }
      : null;
