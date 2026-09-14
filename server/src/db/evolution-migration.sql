-- Applied transactionally by migrate.ts; safe on both existing and fresh installations.
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS evolution_base_url text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS evolution_api_key text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS evolution_instance_name text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS evolution_webhook_secret text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS evolution_connection_state text NOT NULL DEFAULT 'unconfigured';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_ai_enabled boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS wa_clinic_instance ON clinics(evolution_base_url, evolution_instance_name);

ALTER TABLE whatsapp_conversations ALTER COLUMN patient_phone DROP NOT NULL;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS instance_name text;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS remote_jid text;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS ai_paused boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS wa_conversation_identity ON whatsapp_conversations(clinic_id, instance_name, remote_jid);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigserial NOT NULL,
  conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id),
  external_id text NOT NULL,
  direction text NOT NULL,
  text text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reply_text text,
  provider_message_id text,
  delivery_status text,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS wa_message_external ON whatsapp_messages(conversation_id, external_id);
CREATE INDEX IF NOT EXISTS wa_message_pending ON whatsapp_messages(status, available_at);
CREATE TABLE IF NOT EXISTS whatsapp_tool_executions (
  message_id uuid NOT NULL REFERENCES whatsapp_messages(id),
  name text NOT NULL,
  arguments jsonb NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY(message_id, name)
);

-- Preserve histories and notification content. Retire only provider-specific metadata.
ALTER TABLE clinics DROP COLUMN IF EXISTS whatsapp_phone_number_id;
ALTER TABLE clinics DROP COLUMN IF EXISTS whatsapp_access_token;
ALTER TABLE clinics DROP COLUMN IF EXISTS whatsapp_verify_token;
ALTER TABLE notification_templates DROP COLUMN IF EXISTS whatsapp_template_name;
ALTER TABLE notification_templates DROP COLUMN IF EXISTS whatsapp_template_status;
ALTER TABLE notification_templates DROP COLUMN IF EXISTS whatsapp_template_id;
ALTER TABLE whatsapp_conversations DROP COLUMN IF EXISTS window_expires_at;
UPDATE conversation_flows SET nodes = (
  SELECT jsonb_agg(CASE WHEN n->'data'->>'action' = 'send_wa_template'
    THEN jsonb_set(n, '{data}', ((n->'data') - 'waTemplateName') ||
      jsonb_build_object('action', 'send_wa_message', 'label', 'WhatsApp mesajı gönder',
        'message', COALESCE(NULLIF(n->'data'->>'message', ''), 'Talebiniz alındı. Size nasıl yardımcı olabiliriz?')))
    ELSE n END)
  FROM jsonb_array_elements(nodes) n
) WHERE direction = 'whatsapp' AND nodes::text LIKE '%send_wa_template%';
