# German Speaking Coach

A responsive German voice practice app with five real-life missions, session reviews, saved corrections, vocabulary and voice retries.

## Architecture and API approach

- **Next.js frontend:** mission selection, WebRTC voice conversation, review, retry and notebook. The app silently creates a Supabase anonymous session on first use, so there is no sign-in screen. Supabase keeps each browser's data separate through the existing row-level security policies.
- **Supabase Postgres:** migration in `supabase/migrations/001_learning.sql` creates profiles, missions, sessions, transcript turns, learning targets, target occurrences, vocabulary and practice attempts. Every user-owned table has row-level security tied to `auth.uid()`. The server uses the caller's JWT, never a service-role key.
- **Live voice:** the browser requests microphone access after a click, negotiates WebRTC, and sends its SDP offer to `/api/live/session`. The server creates a `gpt-live-1` session with `store: false` and returns the SDP answer. Transcript deltas are grouped into turns. This follows the [OpenAI GPT-Live WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc) and [session/transcript guide](https://developers.openai.com/api/docs/guides/live-conversations).
- **Review:** after the connection closes, `/api/review` calls the OpenAI Responses API with a strict JSON schema, then validates it with Zod and checks references against actual learner turns before saving. It saves at most three clear corrections and keeps mission results separate from language feedback. The format follows [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
- **Personalisation:** each mission selects at most three due corrections and three due vocabulary items. The voice prompt asks for natural opportunities to use them, preferably without the coach saying the target expression first. Later learner use is analysed from transcript evidence.
- **Retry:** “Practise that moment” starts a separate voice recreation with the previous prompt. During a live mission, its original connection remains open and muted, so the mission context survives. The retry is separately analysed and recorded as assisted or independent. This temporarily uses two billable voice connections.

The app uses raw Supabase Auth and PostgREST HTTPS endpoints, so no additional client library is needed. The Supabase REST calls use the project's publishable key plus the user's JWT. The [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security) and [PostgREST upsert semantics](https://docs.postgrest.org/en/v13/references/api/tables_views.html) describe the policy and retry-safe insert approach.

## Local setup

1. Use Node.js 22.6 or later. Run `npm ci`.
2. Create a Supabase project and enable anonymous sign-ins in its Authentication settings.
3. Run `supabase/migrations/001_learning.sql` in the Supabase SQL Editor. It creates and seeds all five missions.
4. Copy `.env.example` to `.env.local`. Set `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The latter is a publishable/anon key, **not** a service-role or secret key.
5. Run `npm run dev`, open `http://localhost:3000`, and choose a mission. The app creates the anonymous session automatically.

The OpenAI project must have GPT-Live-1 and Responses API access. Browser microphone permission requires localhost or HTTPS.

## Deployment

Deploy as a Next.js app, for example on Vercel. Add the four environment variables from `.env.example` to the deployment. Apply the SQL migration to the production Supabase project and enable anonymous sign-ins before opening the app. Use HTTPS. Do a real desktop and mobile voice check: microphone grant and denial, streaming both speakers' text, hint, retry, end, review, notebook save, second mission focus, disconnection and page exit.

OpenAI API usage is billed separately from ChatGPT Plus. Check [current OpenAI API pricing](https://developers.openai.com/api/docs/pricing) and your project limits. Starting a GPT-Live WebRTC session incurs initialization usage, as described in the [WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc). Muting does not close a paid session; use **End session**.

## Privacy and review rules

- The browser requests the microphone only when the user starts a voice conversation or retry. The app does not save raw audio, and GPT-Live is created with `store: false`.
- The app creates an anonymous Supabase user for this browser so row-level security can protect its data; it does not ask for an email or password. Clearing this browser's site data or switching browsers creates a different anonymous user, so the existing learning history will no longer be available there.
- The user chooses whether full transcript turns are retained. When off, full turns are sent to the review endpoint and discarded after analysis; brief learner excerpts supporting objective results and saved corrections remain in the learning space. The same is explained before starting.
- Session reviews and learning data can be deleted separately. Deleting a session cascades transcript turns; saved corrections and vocabulary remain but their source-session reference is cleared. The notebook can edit, dismiss or delete a correction, edit or delete vocabulary, and delete all learning data.
- Analysis selects only high-value clear errors; acceptable style and uncertain transcription are not saved as mistakes. Text does not support pronunciation assessment.
- Session IDs and attempt IDs are stable across request retries. Unique constraints and conflict-safe inserts prevent duplicate transcript turns, target occurrences, practice attempts and vocabulary saves.

## Spaced review

This is a simple scheduling rule, not a proficiency claim. New vocabulary is due now. A recognition exercise checks a meaning choice; tutor speech never counts as recognition. A failed exercise is due in 1 day. Assisted use is due in 2 days. Recognition is due in 3 days. Independent use advances through stages due in 3, 7, 14, 30, then 60 days. Assisted use lowers the stage by one. No item is labelled mastered after one attempt. Corrections are selected by due date and can be practised through mission prompts and voice retry.

## Verification and limits

Run `npm run lint`, `npm test`, `npx tsc --noEmit`, and `npm run build`. The automated tests cover scheduling, evidence validation, correction persistence, mission completion and retry-state handling. A Supabase project, OpenAI credentials and real browser audio are required for full end-to-end validation. No live API calls or production migration have been run in this repository.
