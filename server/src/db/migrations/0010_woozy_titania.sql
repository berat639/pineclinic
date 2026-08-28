CREATE TABLE "appointment_treatments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"treatment_plan_id" uuid NOT NULL,
	"session_number" integer DEFAULT 1 NOT NULL,
	"session_status" text DEFAULT 'planned' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "treatment_groups" ADD COLUMN "created_by_id" uuid;--> statement-breakpoint
ALTER TABLE "treatment_groups" ADD COLUMN "updated_by_id" uuid;--> statement-breakpoint
ALTER TABLE "appointment_treatments" ADD CONSTRAINT "appointment_treatments_appointment_id_dental_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."dental_appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_treatments" ADD CONSTRAINT "appointment_treatments_treatment_plan_id_treatment_plans_id_fk" FOREIGN KEY ("treatment_plan_id") REFERENCES "public"."treatment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_groups" ADD CONSTRAINT "treatment_groups_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_groups" ADD CONSTRAINT "treatment_groups_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;