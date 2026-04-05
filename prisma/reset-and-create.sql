-- ═══════════════════════════════════════════════════════════════════════════════
--  Noa Yogis — Fresh Database Schema for Supabase
--  Run this in the Supabase SQL Editor.
--  WARNING: This drops ALL existing tables and data. Clean slate.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Drop existing tables (reverse dependency order) ─────────────────────────
DROP TABLE IF EXISTS waitlist_entries    CASCADE;
DROP TABLE IF EXISTS bookings            CASCADE;
DROP TABLE IF EXISTS class_instances     CASCADE;
DROP TABLE IF EXISTS class_definitions   CASCADE;
DROP TABLE IF EXISTS punch_cards         CASCADE;
DROP TABLE IF EXISTS payments            CASCADE;
DROP TABLE IF EXISTS sessions            CASCADE;
DROP TABLE IF EXISTS accounts            CASCADE;
DROP TABLE IF EXISTS verification_tokens CASCADE;
DROP TABLE IF EXISTS users               CASCADE;

-- ─── Drop existing enums ─────────────────────────────────────────────────────
DROP TYPE IF EXISTS user_role        CASCADE;
DROP TYPE IF EXISTS day_of_week      CASCADE;
DROP TYPE IF EXISTS booking_status   CASCADE;
DROP TYPE IF EXISTS waitlist_status   CASCADE;
DROP TYPE IF EXISTS punch_card_status CASCADE;
DROP TYPE IF EXISTS payment_type     CASCADE;
DROP TYPE IF EXISTS payment_status   CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
--  ENUMS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE user_role         AS ENUM ('STUDENT', 'ADMIN');
CREATE TYPE day_of_week       AS ENUM ('SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY');
CREATE TYPE booking_status    AS ENUM ('CONFIRMED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE waitlist_status   AS ENUM ('WAITING', 'PROMOTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE punch_card_status AS ENUM ('ACTIVE', 'EXHAUSTED', 'EXPIRED');
CREATE TYPE payment_type      AS ENUM ('SINGLE_CLASS', 'PUNCH_CARD');
CREATE TYPE payment_status    AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- ═══════════════════════════════════════════════════════════════════════════════
--  USERS  (synced from Clerk via webhook / upsert)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE users (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email                       TEXT        NOT NULL UNIQUE,
    email_verified              TIMESTAMPTZ,
    name                        TEXT,
    phone                       TEXT,
    password_hash               TEXT,
    image                       TEXT,
    role                        user_role   NOT NULL DEFAULT 'STUDENT',
    has_signed_health_declaration BOOLEAN   NOT NULL DEFAULT FALSE,
    health_decl_signed_at       TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role ON users (role);

-- ═══════════════════════════════════════════════════════════════════════════════
--  NEXTAUTH LEGACY TABLES  (kept for Prisma schema compatibility)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE accounts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                 TEXT NOT NULL,
    provider             TEXT NOT NULL,
    provider_account_id  TEXT NOT NULL,
    refresh_token        TEXT,
    access_token         TEXT,
    expires_at           INTEGER,
    token_type           TEXT,
    scope                TEXT,
    id_token             TEXT,
    session_state        TEXT,
    UNIQUE (provider, provider_account_id)
);

CREATE INDEX idx_accounts_user_id ON accounts (user_id);

CREATE TABLE sessions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token TEXT        NOT NULL UNIQUE,
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires       TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);

CREATE TABLE verification_tokens (
    identifier TEXT        NOT NULL,
    token      TEXT        NOT NULL UNIQUE,
    expires    TIMESTAMPTZ NOT NULL,
    UNIQUE (identifier, token)
);

-- ═══════════════════════════════════════════════════════════════════════════════
--  CLASS DEFINITIONS  (the "template" for a recurring/one-time class)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE class_definitions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT        NOT NULL,
    description  TEXT,
    instructor   TEXT        NOT NULL,
    day_of_week  day_of_week NOT NULL,
    start_time   TEXT        NOT NULL,
    end_time     TEXT        NOT NULL,
    max_capacity INTEGER     NOT NULL,
    location     TEXT,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    is_recurring BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_class_defs_active_day ON class_definitions (is_active, day_of_week);

-- ═══════════════════════════════════════════════════════════════════════════════
--  CLASS INSTANCES  (a specific occurrence of a class on a date)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE class_instances (
    id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    class_def_id     UUID    NOT NULL REFERENCES class_definitions(id) ON DELETE CASCADE,
    date             DATE    NOT NULL,
    start_time       TEXT    NOT NULL,
    end_time         TEXT    NOT NULL,
    max_capacity     INTEGER NOT NULL,
    current_bookings INTEGER NOT NULL DEFAULT 0,
    is_cancelled     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (class_def_id, date)
);

CREATE INDEX idx_class_instances_date ON class_instances (date, is_cancelled);
CREATE INDEX idx_class_instances_def  ON class_instances (class_def_id);

-- ═══════════════════════════════════════════════════════════════════════════════
--  PAYMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE payments (
    id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_session_id TEXT           UNIQUE,
    stripe_payment_id TEXT,
    amount            INTEGER        NOT NULL,
    currency          TEXT           NOT NULL DEFAULT 'ILS',
    type              payment_type   NOT NULL,
    status            payment_status NOT NULL DEFAULT 'PENDING',
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_user    ON payments (user_id);
CREATE INDEX idx_payments_status  ON payments (status, created_at);

-- ═══════════════════════════════════════════════════════════════════════════════
--  PUNCH CARDS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE punch_cards (
    id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_credits     INTEGER           NOT NULL DEFAULT 10,
    remaining_credits INTEGER           NOT NULL DEFAULT 10,
    status            punch_card_status NOT NULL DEFAULT 'ACTIVE',
    payment_id        UUID              UNIQUE REFERENCES payments(id),
    purchased_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ
);

CREATE INDEX idx_punch_cards_user ON punch_cards (user_id, status, purchased_at);

-- ═══════════════════════════════════════════════════════════════════════════════
--  BOOKINGS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE bookings (
    id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_instance_id UUID           NOT NULL REFERENCES class_instances(id) ON DELETE CASCADE,
    status            booking_status NOT NULL DEFAULT 'CONFIRMED',
    punch_card_id     UUID           REFERENCES punch_cards(id),
    credit_refunded   BOOLEAN        NOT NULL DEFAULT FALSE,
    attended_at       TIMESTAMPTZ,
    marked_by         UUID,
    booked_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    cancelled_at      TIMESTAMPTZ,
    UNIQUE (user_id, class_instance_id)
);

CREATE INDEX idx_bookings_instance ON bookings (class_instance_id, status);
CREATE INDEX idx_bookings_user     ON bookings (user_id, status);

-- ═══════════════════════════════════════════════════════════════════════════════
--  WAITLIST
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE waitlist_entries (
    id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_instance_id UUID            NOT NULL REFERENCES class_instances(id) ON DELETE CASCADE,
    position          INTEGER         NOT NULL,
    status            waitlist_status NOT NULL DEFAULT 'WAITING',
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
    promoted_at       TIMESTAMPTZ,
    notified_at       TIMESTAMPTZ,
    UNIQUE (user_id, class_instance_id)
);

CREATE INDEX idx_waitlist_instance ON waitlist_entries (class_instance_id, status, position);

-- ═══════════════════════════════════════════════════════════════════════════════
--  SEED: Admin user
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO users (email, name, role, has_signed_health_declaration)
VALUES ('omer609994@gmail.com', 'עומר', 'ADMIN', TRUE)
ON CONFLICT (email) DO UPDATE SET role = 'ADMIN';

-- ═══════════════════════════════════════════════════════════════════════════════
--  DONE
--  Table names match Prisma @@map exactly:
--    users, accounts, sessions, verification_tokens,
--    class_definitions, class_instances,
--    bookings, waitlist_entries,
--    punch_cards, payments
-- ═══════════════════════════════════════════════════════════════════════════════
