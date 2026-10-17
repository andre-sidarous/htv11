import type { ApiEnvelope, UserProfile } from '@htv11/types';

export interface UserRecord extends UserProfile {
  lastLoginAt: string | null;
}

export const getUserEnvelope = (user: UserRecord): ApiEnvelope<UserRecord> => ({
  success: true,
  data: user
});
