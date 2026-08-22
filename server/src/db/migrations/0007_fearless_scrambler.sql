CREATE TABLE "patient_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid,
	"phone" text,
	"content" text NOT NULL,
	"source" text DEFAULT 'voice' NOT NULL,
	"status" text DEFAULT 'unread' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "conversation_flows" ADD COLUMN "direction" text DEFAULT 'inbound' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "call_direction" text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_notes" ADD CONSTRAINT "patient_notes_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;