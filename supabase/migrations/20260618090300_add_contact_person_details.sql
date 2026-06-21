-- Add optional contact person detail columns to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_person_email text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_person_phone text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_person_role text;
