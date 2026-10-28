/** Kind of account chosen at registration. Platform admin is a separate flag, never self-assigned. */
export const ACCOUNT_TYPES = ['student', 'tutor', 'parent'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Role a user holds inside an organization (tutor workspace or school). */
export const ORG_ROLES = ['owner', 'tutor', 'student', 'parent'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const SCHOOL_LEVELS = ['primary', 'secondary', 'vocational', 'higher', 'adult'] as const;
export type SchoolLevel = (typeof SCHOOL_LEVELS)[number];

export const SCHOOL_LEVEL_LABELS: Record<SchoolLevel, string> = {
  primary: 'Szkoła podstawowa',
  secondary: 'Szkoła średnia (liceum, technikum)',
  vocational: 'Szkoła branżowa / zawodowa',
  higher: 'Studia',
  adult: 'Dorosły / poza szkołą',
};

/** Highest grade per level; used to validate the optional "klasa" field. */
export const SCHOOL_LEVEL_MAX_GRADE: Record<SchoolLevel, number | null> = {
  primary: 8,
  secondary: 5,
  vocational: 3,
  higher: 5,
  adult: null,
};

/** Age (RODO art. 8, Polish implementation) below which a parent must consent. */
export const DIGITAL_CONSENT_AGE = 16;
