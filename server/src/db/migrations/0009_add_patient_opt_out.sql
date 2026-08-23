ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "whatsapp_opt_out" boolean DEFAULT false NOT NULL;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "sms_opt_out" boolean DEFAULT false NOT NULL;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "email_opt_out" boolean DEFAULT false NOT NULL;
