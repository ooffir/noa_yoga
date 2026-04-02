-- Migration: Add is_recurring column to class_definitions
-- Run this in Supabase SQL Editor if you DON'T want to reset all data.

ALTER TABLE class_definitions
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT TRUE;
