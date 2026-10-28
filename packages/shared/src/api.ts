import type { AccountType, OrgRole, SchoolLevel } from './enums.js';

/** Shape of `GET /api/auth/me`. */
export interface MeResponse {
  id: string;
  email: string;
  username: string;
  displayName: string;
  accountType: AccountType;
  isPlatformAdmin: boolean;
  mfaEnabled: boolean;
  /** True when the account must enrol MFA before using anything else (admins). */
  mfaSetupRequired: boolean;
  student: { schoolLevel: SchoolLevel; grade: number | null; birthYear: number } | null;
  memberships: { organizationId: string; organizationName: string; role: OrgRole }[];
}

export type LoginResponse =
  { status: 'ok'; user: MeResponse } | { status: 'mfa_required'; challengeId: string };

export interface SessionInfo {
  id: string;
  current: boolean;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export interface MfaSetupResponse {
  secret: string;
  otpauthUri: string;
}

export interface MfaEnableResponse {
  backupCodes: string[];
}

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  issues?: { path: string; message: string }[];
}
