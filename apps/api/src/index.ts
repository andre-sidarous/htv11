import type { ApiEnvelope, UserProfile } from '@htv11/types';

export const createUserResponse = (user: UserProfile): ApiEnvelope<UserProfile> => ({
  success: true,
  data: user,
  error: undefined
});
