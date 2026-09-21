# German Speaking Coach

A no-login iPhone-friendly German B1/B2 speaking coach for job communication.

## Features

- Opening `/` offers Classic Practice (`/classic`) or Live Conversation (`/live`), with no login.
- Live Conversation uses GPT-Live-1 with a scenario selector, microphone mute, session timer, and separate live transcripts for both speakers.
- The latest 20 live transcripts are saved only in this browser under a separate storage key; each can be deleted. No audio recording is requested (`store: false`). Audio is still sent to OpenAI to run the conversation.
- Live starts only after pressing Start. Voice costs US$0.05/minute; WebRTC initialization bills 15 seconds credited toward session duration. Muting does not end billing. Press End to close the session.
- Live uses the existing server `OPENAI_API_KEY`; that project must have GPT-Live-1 access and API billing. No backend model or external tools are configured.
- Microphone access requires HTTPS or localhost. On iPhone, use **Play coach audio** if Safari blocks playback.

Live integration follows the [OpenAI WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live) and [session/transcript guide](https://developers.openai.com/api/docs/guides/live-conversations). The server creates sessions through `POST /api/live/session`; API credentials never go to the browser. The app remains no-login: the origin check is not authentication, and anyone with access to the deployment can start billable sessions.

Manual release check: on desktop and iPhone Safari, open both choices, start Live, allow the microphone, speak German, interrupt the coach, verify both transcripts, mute/unmute, end, and revisit saved history. Also test denied microphone permission, audio playback recovery, network loss, and leaving an active session. Mocked tests cannot verify account access or real device audio.

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
