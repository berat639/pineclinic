ALTER TABLE "patients" ADD COLUMN "tc_identity" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "birth_date" timestamp with time zone;