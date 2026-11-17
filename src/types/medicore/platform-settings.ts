import { BaseEntity } from './base';

export interface PlatformSettings extends BaseEntity {
  platformName: string;
  logoUrl: string | null;
  supportEmail: string;
  defaultTrialDays: number;
  defaultPlanId: string | null;
  contactPhone: string | null;
}

export interface UpdatePlatformSettingsRequest {
  platformName?: string;
  logoUrl?: string | null;
  supportEmail?: string;
  defaultTrialDays?: number;
  defaultPlanId?: string | null;
  contactPhone?: string | null;
}
