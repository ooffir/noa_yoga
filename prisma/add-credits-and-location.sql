-- Migration: Add credits to users + location to class_instances
-- Run this in Supabase SQL Editor

ALTER TABLE users
ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0;

ALTER TABLE class_instances
ADD COLUMN IF NOT EXISTS location TEXT;
