ALTER TABLE "consultations" DROP CONSTRAINT "consultations_from_doctor_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_to_doctor_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "doctor_id" uuid;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "consultation_note" text NOT NULL;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "disease_note" text;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" DROP COLUMN "from_doctor_id";--> statement-breakpoint
ALTER TABLE "consultations" DROP COLUMN "to_doctor_id";--> statement-breakpoint
ALTER TABLE "consultations" DROP COLUMN "notes";--> statement-breakpoint
ALTER TABLE "consultations" DROP COLUMN "status";