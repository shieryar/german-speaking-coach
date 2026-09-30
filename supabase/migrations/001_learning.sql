create extension if not exists pgcrypto;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  retain_transcripts boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.missions (
  id text primary key,
  title text not null,
  situation text not null,
  ai_role text not null,
  learner_role text not null,
  default_level text not null check (default_level in ('A1','A2','B1','B2','C1')),
  objectives jsonb not null,
  complications jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}'
);
create table public.sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mission_id text not null references public.missions(id),
  difficulty text not null check (difficulty in ('A1','A2','B1','B2','C1')),
  retain_transcript boolean not null,
  focus_target_ids uuid[] not null default '{}',
  focus_vocab_ids uuid[] not null default '{}',
  status text not null default 'created' check (status in ('created','live','ended','reviewed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  review jsonb
);
create index sessions_user_started on public.sessions(user_id, started_at desc);
create table public.transcript_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  turn_index integer not null check (turn_index >= 0),
  speaker text not null check (speaker in ('user','assistant')),
  text text not null,
  start_ms integer not null default 0,
  end_ms integer not null default 0,
  unique (session_id, turn_index)
);
create table public.learning_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_session_id uuid references public.sessions(id) on delete set null,
  source_turn_index integer,
  original text not null,
  correction text not null,
  natural_alternative text,
  explanation text not null,
  category text not null,
  fingerprint text not null,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  independent_uses integer not null default 0,
  assisted_uses integer not null default 0,
  next_review_at timestamptz not null default now(),
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);
create index targets_due on public.learning_targets(user_id, next_review_at) where not dismissed;
create table public.learning_target_occurrences (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_id uuid not null references public.learning_targets(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  turn_index integer not null,
  primary key (target_id, session_id, turn_index)
);
create table public.vocabulary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_session_id uuid references public.sessions(id) on delete set null,
  expression text not null,
  meaning text not null,
  article text,
  plural text,
  usage_pattern text,
  example text not null,
  tags text[] not null default '{}',
  recognition_count integer not null default 0,
  assisted_uses integer not null default 0,
  independent_uses integer not null default 0,
  later_uses integer not null default 0,
  review_stage integer not null default 0,
  next_review_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, expression)
);
create index vocabulary_due on public.vocabulary(user_id, next_review_at);
create table public.practice_attempts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  target_id uuid references public.learning_targets(id) on delete set null,
  vocabulary_id uuid references public.vocabulary(id) on delete set null,
  source_turn_index integer,
  kind text not null check (kind in ('retry','vocabulary','target')),
  result text not null check (result in ('recognised','assisted','independent','later_independent','needs_work')),
  utterance text,
  feedback text,
  created_at timestamptz not null default now(),
  check (target_id is null or vocabulary_id is null)
);

alter table public.profiles enable row level security;
alter table public.missions enable row level security;
alter table public.sessions enable row level security;
alter table public.transcript_turns enable row level security;
alter table public.learning_targets enable row level security;
alter table public.learning_target_occurrences enable row level security;
alter table public.vocabulary enable row level security;
alter table public.practice_attempts enable row level security;

create policy profiles_own on public.profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy missions_read on public.missions for select to authenticated using (true);
create policy sessions_own on public.sessions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy turns_own on public.transcript_turns for all to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy targets_own on public.learning_targets for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (source_session_id is null or exists (select 1 from public.sessions s where s.id = source_session_id and s.user_id = auth.uid())));
create policy occurrences_own on public.learning_target_occurrences for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.learning_targets t where t.id = target_id and t.user_id = auth.uid())
    and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy vocabulary_own on public.vocabulary for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (source_session_id is null or exists (select 1 from public.sessions s where s.id = source_session_id and s.user_id = auth.uid())));
create policy attempts_own on public.practice_attempts for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (session_id is null or exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()))
    and (target_id is null or exists (select 1 from public.learning_targets t where t.id = target_id and t.user_id = auth.uid()))
    and (vocabulary_id is null or exists (select 1 from public.vocabulary v where v.id = vocabulary_id and v.user_id = auth.uid()))
  );

revoke all on public.profiles, public.missions, public.sessions, public.transcript_turns,
  public.learning_targets, public.learning_target_occurrences, public.vocabulary, public.practice_attempts from anon;
grant select on public.missions to authenticated;
grant select, insert, update, delete on public.profiles, public.sessions, public.transcript_turns,
  public.learning_targets, public.learning_target_occurrences, public.vocabulary, public.practice_attempts to authenticated;

insert into public.missions (id,title,situation,ai_role,learner_role,default_level,objectives,complications,tags) values
('apartment-viewing','Apartment viewing','View an apartment and decide what to ask before applying.','landlord or letting agent','prospective tenant','B1','["Ask about the monthly rent.","Ask whether heating costs are included.","Ask about the deposit.","Arrange the next step."]','{"A2":"The viewing time must change.","B1":"Heating costs are billed separately.","B2":"Several applicants are interested.","C1":"The contract has an unusual notice period."}',array['housing','rent','appointment']),
('doctor-appointment','Doctor''s appointment','Call a medical practice to arrange an appointment.','receptionist','patient','A2','["Explain why an appointment is needed without unnecessary private detail.","Ask for an available time.","Confirm the date and time.","Ask what to bring."]','{"B1":"The first available time conflicts with your schedule.","B2":"The receptionist offers a telephone appointment.","C1":"The practice needs a referral."}',array['health','appointment','time']),
('job-interview','Job interview','Interview for a role that fits your experience.','interviewer','candidate','B1','["Introduce your experience.","Give a concrete example of a strength.","Ask a question about the role.","Discuss availability or next steps."]','{"B2":"The interviewer asks about a challenging project.","C1":"The interviewer asks you to address a gap in experience."}',array['work','interview','experience']),
('returning-purchase','Returning a purchase','Return an item to a shop and resolve the issue politely.','shop assistant','customer','A2','["Say what you bought and what went wrong.","Ask about a return or exchange.","Answer a question about the receipt.","Confirm the agreed solution."]','{"B1":"The receipt is missing.","B2":"The store offers only store credit.","C1":"The policy is ambiguous."}',array['shopping','return','receipt']),
('meeting-someone','Meeting someone new','Meet a new person at a local event.','another guest','new acquaintance','A1','["Introduce yourself.","Ask the other person''s name.","Exchange a few details about interests or work.","Suggest a natural way to continue or end the conversation."]','{"B1":"The other person speaks quickly about an unfamiliar hobby.","B2":"You discover a shared interest and plan to meet again.","C1":"The conversation shifts to a nuanced local topic."}',array['social','introductions','interests'])
on conflict (id) do update set title=excluded.title, situation=excluded.situation, ai_role=excluded.ai_role, learner_role=excluded.learner_role, default_level=excluded.default_level, objectives=excluded.objectives, complications=excluded.complications, tags=excluded.tags;
