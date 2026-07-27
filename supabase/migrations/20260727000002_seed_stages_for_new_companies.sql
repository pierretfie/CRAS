-- Seed default conversion stages for any company that has none.
DO $$
DECLARE
  company RECORD;
BEGIN
  FOR company IN
    SELECT c.id FROM public.companies c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.conversion_stage_config s WHERE s.company_id = c.id
    )
  LOOP
    INSERT INTO public.conversion_stage_config (stage_number, label, description, company_id) VALUES
      (1, 'Lead',      'Initial contact established',         company.id),
      (2, 'Engaged',   'Active discussion or proposal stage', company.id),
      (3, 'Onboarded', 'Client converted and onboarded',      company.id);
  END LOOP;
END $$;
