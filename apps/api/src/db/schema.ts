import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  integer,
  boolean,
  check,
  customType,
  date,
  index,
  inet,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ACCOUNT_TYPES,
  ASSESSMENT_KINDS,
  ATTENDANCE,
  ENROLLMENT_STATUSES,
  HOMEWORK_STATUSES,
  LEDGER_KINDS,
  LESSON_STATUSES,
  ORG_ROLES,
  PAYMENT_METHODS,
  SCHOOL_LEVELS,
  TOPIC_STATUSES,
} from '@pl/shared';

const citext = customType<{ data: string }>({ dataType: () => 'citext' });

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const accountType = pgEnum('account_type', ACCOUNT_TYPES);
export const orgRole = pgEnum('org_role', ORG_ROLES);
export const schoolLevel = pgEnum('school_level', SCHOOL_LEVELS);
export const enrollmentStatus = pgEnum('enrollment_status', ENROLLMENT_STATUSES);
export const lessonStatus = pgEnum('lesson_status', LESSON_STATUSES);
export const attendance = pgEnum('attendance', ATTENDANCE);
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

// ---------------------------------------------------------------- stage 2: tenants' teaching data
// Tables below are protected by Postgres row-level security (see the migration); the API reaches
// them only through RlsService, which runs queries as the restricted `pl_app` role.

export const subjects = pgTable(
  'subjects',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('subjects_org_name_uq').on(t.organizationId, t.name)],
);

export const topics = pgTable(
  'topics',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => topics.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('topics_subject_idx').on(t.subjectId)],
);

/** Invitation to start lessons with a tutor: a typeable code/link or a personal e-mail. */
export const invites = pgTable(
  'invites',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tutorId: uuid('tutor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull().unique(),
    /** HMAC of the invited address for e-mail invites; only that account may accept. */
    emailHash: text('email_hash'),
    maxUses: smallint('max_uses').notNull().default(1),
    uses: smallint('uses').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('invites_tutor_idx').on(t.tutorId)],
);

/** Tutor × student × subject: the unit of cooperation (goals, status, history). */
export const enrollments = pgTable(
  'enrollments',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tutorId: uuid('tutor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    status: enrollmentStatus('status').notNull().default('active'),
    goals: text('goals'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('enrollments_tutor_student_subject_uq').on(t.tutorId, t.studentId, t.subjectId),
    index('enrollments_student_idx').on(t.studentId),
  ],
);

export const enrollmentEvents = pgTable(
  'enrollment_events',
  {
    id: id(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('enrollment_events_enrollment_idx').on(t.enrollmentId, t.createdAt)],
);

/** One-time code a student gives to their parent to link accounts (24 h). */
export const parentLinkCodes = pgTable('parent_link_codes', {
  id: id(),
  studentId: uuid('student_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const parentLinks = pgTable(
  'parent_links',
  {
    id: id(),
    parentId: uuid('parent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('parent_links_parent_student_uq').on(t.parentId, t.studentId),
    index('parent_links_student_idx').on(t.studentId),
  ],
);

// ---------------------------------------------------------------- stage 3+: data scoped to one enrollment
// Every such table carries organization, tutor and student ids so RLS policies can stay simple.

const scoped = () => ({
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  enrollmentId: uuid('enrollment_id')
    .notNull()
    .references(() => enrollments.id, { onDelete: 'cascade' }),
  tutorId: uuid('tutor_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const orgSettings = pgTable('org_settings', {
  organizationId: uuid('organization_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  autoChargeLateCancellation: boolean('auto_charge_late_cancellation').notNull().default(false),
  cancellationWindowHours: smallint('cancellation_window_hours').notNull().default(24),
  defaultLessonMinutes: smallint('default_lesson_minutes').notNull().default(60),
  /** Booking step in minutes: lessons start at multiples of it. */
  slotMinutes: smallint('slot_minutes').notNull().default(30),
});

/** Individual lessons. Group lessons (several students) are planned for later. */
export const lessons = pgTable(
  'lessons',
  {
    id: id(),
    ...scoped(),
    seriesId: uuid('series_id'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    durationMin: smallint('duration_min').notNull(),
    status: lessonStatus('status').notNull().default('scheduled'),
    attendance: attendance('attendance'),
    location: text('location'),
    topic: text('topic'),
    cancelledBy: uuid('cancelled_by').references(() => users.id, { onDelete: 'set null' }),
    cancelReason: text('cancel_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    /** For cancelled lessons: true = paid, false = free, null = late, waiting for tutor's decision. */
    chargeable: boolean('chargeable'),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('lessons_tutor_time_idx').on(t.tutorId, t.startsAt),
    index('lessons_student_time_idx').on(t.studentId, t.startsAt),
    index('lessons_enrollment_idx').on(t.enrollmentId, t.startsAt),
  ],
);

export const lessonChanges = pgTable(
  'lesson_changes',
  {
    id: id(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    fromStartsAt: timestamp('from_starts_at', { withTimezone: true }),
    toStartsAt: timestamp('to_starts_at', { withTimezone: true }),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('lesson_changes_lesson_idx').on(t.lessonId, t.createdAt)],
);

/** Shared lesson note: editable by the lesson's tutor and student only (not parents). Encrypted. */
export const lessonNotes = pgTable('lesson_notes', {
  id: id(),
  ...scoped(),
  lessonId: uuid('lesson_id')
    .notNull()
    .unique()
    .references(() => lessons.id, { onDelete: 'cascade' }),
  contentEnc: text('content_enc').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
});

export const noteRevisions = pgTable(
  'note_revisions',
  {
    id: id(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => lessonNotes.id, { onDelete: 'cascade' }),
    contentEnc: text('content_enc').notNull(),
    editedBy: uuid('edited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('note_revisions_note_idx').on(t.noteId, t.createdAt)],
);

/** Tutor's report after a lesson; visible to the student and linked parents. */
export const lessonReports = pgTable(
  'lesson_reports',
  {
    id: id(),
    ...scoped(),
    lessonId: uuid('lesson_id')
      .notNull()
      .unique()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    summary: text('summary').notNull(),
    covered: text('covered').notNull().default(''),
    nextSteps: text('next_steps').notNull().default(''),
    engagement: smallint('engagement'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('lesson_reports_enrollment_idx').on(t.enrollmentId)],
);

// ---------------------------------------------------------------- stage 5: billing (amounts in grosze)

export const ledgerKind = pgEnum('ledger_kind', LEDGER_KINDS);
export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);

export const enrollmentRates = pgTable(
  'enrollment_rates',
  {
    id: id(),
    ...scoped(),
    hourlyRate: integer('hourly_rate').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('enrollment_rates_enrollment_uq').on(t.enrollmentId)],
);

/** Prepaid package of lessons; completed lessons consume it before the hourly rate applies. */
export const lessonPackages = pgTable(
  'lesson_packages',
  {
    id: id(),
    ...scoped(),
    lessonsTotal: smallint('lessons_total').notNull(),
    lessonsUsed: smallint('lessons_used').notNull().default(0),
    price: integer('price').notNull(),
    note: text('note'),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('lesson_packages_enrollment_idx').on(t.enrollmentId)],
);

/** Append-mostly ledger. Corrections void an entry instead of deleting it. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: id(),
    ...scoped(),
    kind: ledgerKind('kind').notNull(),
    amount: integer('amount').notNull(),
    description: text('description').notNull(),
    method: paymentMethod('method'),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    packageId: uuid('package_id').references(() => lessonPackages.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('ledger_enrollment_time_idx').on(t.enrollmentId, t.occurredAt),
    index('ledger_tutor_time_idx').on(t.tutorId, t.occurredAt),
    index('ledger_lesson_idx').on(t.lessonId),
  ],
);

// ---------------------------------------------------------------- stage 6: materials and homework

export const homeworkStatus = pgEnum('homework_status', HOMEWORK_STATUSES);

/** A tutor's library item (Markdown + KaTeX). Students see it once shared with them. */
export const materials = pgTable(
  'materials',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tutorId: uuid('tutor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('materials_tutor_idx').on(t.tutorId, t.subjectId)],
);

export const materialShares = pgTable(
  'material_shares',
  {
    id: id(),
    ...scoped(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('material_shares_uq').on(t.materialId, t.enrollmentId),
    index('material_shares_student_idx').on(t.studentId),
  ],
);

export const homework = pgTable(
  'homework',
  {
    id: id(),
    ...scoped(),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    instructions: text('instructions').notNull().default(''),
    dueAt: timestamp('due_at', { withTimezone: true }),
    status: homeworkStatus('status').notNull().default('assigned'),
    submission: text('submission'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    feedback: text('feedback'),
    grade: text('grade'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('homework_enrollment_idx').on(t.enrollmentId, t.createdAt),
    index('homework_student_idx').on(t.studentId, t.status),
  ],
);

// ---------------------------------------------------------------- stage 7: progress

export const assessmentKind = pgEnum('assessment_kind', ASSESSMENT_KINDS);
export const topicStatus = pgEnum('topic_status', TOPIC_STATUSES);

export const assessments = pgTable(
  'assessments',
  {
    id: id(),
    ...scoped(),
    title: text('title').notNull(),
    kind: assessmentKind('kind').notNull(),
    score: numeric('score', { precision: 8, scale: 2, mode: 'number' }),
    maxScore: numeric('max_score', { precision: 8, scale: 2, mode: 'number' }),
    grade: text('grade'),
    takenAt: date('taken_at').notNull(),
    topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('assessments_enrollment_idx').on(t.enrollmentId, t.takenAt)],
);

export const topicProgress = pgTable(
  'topic_progress',
  {
    id: id(),
    ...scoped(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    status: topicStatus('status').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('topic_progress_uq').on(t.enrollmentId, t.topicId)],
);

export const learningGoals = pgTable(
  'learning_goals',
  {
    id: id(),
    ...scoped(),
    title: text('title').notNull(),
    targetDate: date('target_date'),
    achievedAt: timestamp('achieved_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('learning_goals_enrollment_idx').on(t.enrollmentId)],
);

// ---------------------------------------------------------------- stage 8: Web Push

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);

/**
 * Godziny pracy korepetytora: tygodniowy szablon (weekday) i wyjątki na konkretne dni (on_date).
 * Wiersz bez start/end przy on_date oznacza dzień wolny.
 */
export const availability = pgTable(
  'availability',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tutorId: uuid('tutor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekday: smallint('weekday'),
    onDate: date('on_date', { mode: 'string' }),
    startMin: smallint('start_min'),
    endMin: smallint('end_min'),
    note: text('note'),
  },
  (t) => [
    index('availability_tutor_idx').on(t.tutorId),
    check('availability_kind', sql`(${t.weekday} IS NULL) <> (${t.onDate} IS NULL)`),
    check(
      'availability_range',
      sql`(${t.startMin} IS NULL AND ${t.endMin} IS NULL AND ${t.onDate} IS NOT NULL) OR (${t.startMin} >= 0 AND ${t.endMin} <= 1440 AND ${t.endMin} > ${t.startMin})`,
    ),
  ],
);
