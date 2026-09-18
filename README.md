# German Speaking Coach

A no-login iPhone-friendly German B1/B2 speaking coach for job communication.

## Features

- Five modes: conversation first, strict tutor, guided practice, interview simulation, fluency practice
- Ten workplace/job scenarios: interviews, meetings, email phrasing, small talk, project explanations, presentations, professional phone calls, customer support, giving constructive feedback, professional networking
- iPhone microphone recording in the browser
- Transcript of what you said
- Corrected German, better professional version, short English explanation
- German tutor reply shown on screen and spoken aloud
- Progress saved locally in the browser with no account/login

Guided practice offers a German sentence starter and a simple question for each step. Interview simulation asks realistic interview questions about the selected scenario. Fluency practice encourages longer answers with reasons and examples, while keeping corrections in the written feedback.

## Local setup

```bash
npm install
cp .env.example .env.local
# edit .env.local and add OPENAI_API_KEY
npm run dev
```

Open `http://localhost:3000`. For iPhone testing on the same Wi-Fi, deploy to Vercel first or configure HTTPS locally; Safari microphone access is easiest on HTTPS.

## Vercel deployment

1. Create/import this folder as a Vercel project.
2. Add Environment Variable: `OPENAI_API_KEY`.
3. Optional env vars:
   - `OPENAI_TEXT_MODEL=gpt-4o-mini`
   - `OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe`
   - `OPENAI_TTS_MODEL=gpt-4o-mini-tts`
   - `OPENAI_TTS_VOICE=alloy`
4. Deploy.
5. Open the Vercel URL on iPhone Safari and choose **Share → Add to Home Screen**.

## Important

ChatGPT Plus does not provide API access for this custom app. You need an OpenAI API key with separate pay-as-you-go billing.
