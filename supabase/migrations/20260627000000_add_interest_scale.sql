-- supabase/migrations/20260627000000_add_interest_scale.sql
ALTER TABLE clients ADD COLUMN interest_scale DECIMAL(3,1) NOT NULL DEFAULT 5.0;
