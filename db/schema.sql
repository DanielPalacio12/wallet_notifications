-- Ejecutar una vez en Supabase (SQL Editor) antes de arrancar el servicio.
CREATE TABLE IF NOT EXISTS notifications (
  id            SERIAL PRIMARY KEY,
  to_email      VARCHAR(255) NOT NULL,
  subject       VARCHAR(255) NOT NULL,
  body          TEXT         NOT NULL,
  status        VARCHAR(10)  NOT NULL CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  topic         VARCHAR(255),
  error_message TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ
);

-- Bloquea el acceso con las keys públicas (anon/authenticated) de Supabase.
-- El servicio se conecta como postgres (dueño de la tabla), así que no le afecta.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Idempotencia: un registro por evento de Users ya procesado (eventId).
CREATE TABLE IF NOT EXISTS processed_events (
  event_id     VARCHAR(100) PRIMARY KEY,
  topic        VARCHAR(255) NOT NULL,
  processed_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE processed_events ENABLE ROW LEVEL SECURITY;

-- Directorio de contactos (proyección local de Users): userId -> nombre y email.
-- Se llena con users.created / users.updated y se usa para los eventos de Accounts,
-- que solo traen el userId.
CREATE TABLE IF NOT EXISTS user_contacts (
  user_id    VARCHAR(100) PRIMARY KEY,
  name       VARCHAR(255),
  email      VARCHAR(255) NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE user_contacts ENABLE ROW LEVEL SECURITY;
