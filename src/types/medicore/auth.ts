import { AuthenticatedUser } from './user';

export interface LoginRequest {
  username: string;
  password: string;
  /** Organization code (tenant slug); only needed if the same username and password exist in several organizations. */
  organization?: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface AuthMeResponse extends AuthenticatedUser {
  permissions: string[];
  /** The signed-in user's display name (used to prefill the Order Booker on a new sale). */
  fullName?: string;
}
