ALTER TABLE "dental_appointments" ADD COLUMN "complaint" text;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD COLUMN "doctor_id" uuid;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;