CREATE TABLE "whatsapp_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_phone" text NOT NULL,
	"patient_id" uuid,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now(),
	"window_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "whatsapp_phone_number_id" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "whatsapp_access_token" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "whatsapp_verify_token" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "whatsapp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD COLUMN "whatsapp_template_name" text;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD COLUMN "whatsapp_template_status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "notification_templates" ADD COLUMN "whatsapp_template_id" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "whatsapp_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "sms_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "email_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;