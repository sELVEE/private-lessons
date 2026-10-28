import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  index,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { ACCOUNT_TYPES, ORG_ROLES, SCHOOL_LEVELS } from '@pl/shared';

const citext = customType<{ data: string }>({ dataType: () => 'citext' });

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const accountType = pgEnum('account_type', ACCOUNT_TYPES);
export const orgRole = pgEnum('org_role', ORG_ROLES);
export const schoolLevel = pgEnum('school_level', SCHOOL_LEVELS);
export const userStatus = pgEnum('user_status', ['active', 'locked', 'disabled']);
export const tokenPurpose = pgEnum('token_purpose', [
  'email_verify',
  'password_reset',
  'parent_consent',
  'not_me',
]);

/** A tenant: a single tutor's workspace now, a school / agency later. */
export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const users = pgTable('users', {
  id: id(),
  email: citext('email').notNull().unique(),
  username: citext('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  accountType: accountType('account_type').notNull(),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  status: userStatus('status').notNull().default('active'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  requiresParentConsent: boolean('requires_parent_consent').notNull().default(false),
  parentConsentAt: timestamp('parent_consent_at', { withTimezone: true }),
  /** TOTP secret, encrypted with the data encryption key (see CryptoService). */
  mfaSecretEnc: text('mfa_secret_enc'),
  mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),
  /** Last accepted TOTP time step, prevents code replay. */
  mfaLastStep: bigint('mfa_last_step', { mode: 'number' }),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Only data needed to teach: level, grade and birth year (no full birth date, no address). */
export const studentProfiles = pgTable('student_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  schoolLevel: schoolLevel('school_level').notNull(),
  grade: smallint('grade'),
  birthYear: smallint('birth_year').notNull(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('memberships_org_user_role_uq').on(t.organizationId, t.userId, t.role),
    index('memberships_user_idx').on(t.userId),
  ],
);

/** Server-side sessions. Only an HMAC of the cookie token is stored. */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent'),
    mfaVerified: boolean('mfa_verified').notNull().default(false),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** Single-use tokens sent by e-mail. Only an HMAC of the token is stored. */
export const userTokens = pgTable(
  'user_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: tokenPurpose('purpose').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    /** Non-secret context, e.g. HMAC of the parent's e-mail for a consent token. */
    meta: jsonb('meta').$type<Record<string, string>>(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('user_tokens_user_purpose_idx').on(t.userId, t.purpose)],
);

export const mfaBackupCodes = pgTable(
  'mfa_backup_codes',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [index('mfa_backup_codes_user_idx').on(t.userId)],
);

/** Browsers a user has logged in from, identified by a random long-lived device cookie. */
export const knownDevices = pgTable(
  'known_devices',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceHash: text('device_hash').notNull(),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('known_devices_user_device_uq').on(t.userId, t.deviceHash)],
);

/**
 * Proof of parental consent. The parent's e-mail is kept only as an HMAC, enough to show
 * which address confirmed without storing it in clear text.
 */
export const parentConsents = pgTable('parent_consents', {
  id: id(),
  studentId: uuid('student_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  parentEmailHash: text('parent_email_hash').notNull(),
  consentedAt: timestamp('consented_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only security log. Retained for a limited period (see docs/PLAN.md). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    ip: inet('ip'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_log_actor_idx').on(t.actorId, t.createdAt),
    index('audit_log_action_idx').on(t.action, t.createdAt),
  ],
);
