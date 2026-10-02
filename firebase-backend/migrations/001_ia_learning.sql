-- Memoria de aprendizaje de IA. Ejecutar en Neon con una conexión directa/unpooled.
create table if not exists ia_generation_events (
  event_id text primary key,
  carrera text not null default '',
  numero_propuesta smallint not null default 0 check (numero_propuesta between 0 and 3),
  opciones jsonb not null default '[]'::jsonb,
  source text not null default 'student_ia',
  created_at timestamptz not null default now()
);
create table if not exists ia_learning_feedback (
  id bigint generated always as identity primary key,
  event_id text null,
  titulo text not null,
  outcome text not null check (outcome in ('student_selection','final_approved','final_corrected','returned')),
  carrera text not null default '',
  source text not null default 'workflow',
  created_at timestamptz not null default now()
);
create index if not exists ia_learning_feedback_carrera_created_idx on ia_learning_feedback (lower(carrera), created_at desc);
create index if not exists ia_learning_feedback_outcome_created_idx on ia_learning_feedback (outcome, created_at desc);
create index if not exists ia_generation_events_created_idx on ia_generation_events (created_at desc);
