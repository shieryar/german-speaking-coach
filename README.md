# German Speaking Coach

A no-login iPhone-friendly German B1/B2 speaking coach for job communication.

## Features

- Opening `/` goes directly to Live Conversation, with no login. `/live` also opens the conversation screen.
- Live Conversation uses GPT-Live-1 with a scenario selector, microphone mute, session timer, and separate live transcripts for both speakers.
- The latest 20 live transcripts are saved locally in this browser; each can be deleted. No audio recording is requested (`store: false`). Audio is still sent to OpenAI to run the conversation.
- Live starts only after pressing Start. Voice costs US$0.05/minute; WebRTC initialization bills 15 seconds credited toward session duration. Muting does not end billing. Press End to close the session.
- Live uses the existing server `OPENAI_API_KEY`; that project must have GPT-Live-1 access and API billing. No backend model or external tools are configured.
- Microphone access requires HTTPS or localhost. On iPhone, use **Play coach audio** if Safari blocks playback.

Live integration follows the [OpenAI WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live) and [session/transcript guide](https://developers.openai.com/api/docs/guides/live-conversations). The server creates sessions through `POST /api/live/session`; API credentials never go to the browser. The app remains no-login: the origin check is not authentication, and anyone with access to the deployment can start billable sessions.

Manual release check: on desktop and iPhone Safari, open the home page, start Live, allow the microphone, speak German, interrupt the coach, verify both transcripts, mute/unmute, end, and revisit saved history. Also test denied microphone permission, audio playback recovery, network loss, and leaving an active session. Mocked tests cannot verify account access or real device audio.

- Ten workplace/job scenarios: interviews, meetings, email phrasing, small talk, project explanations, presentations, professional phone calls, customer support, giving constructive feedback, professional networking

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
3. Deploy.
4. Open the Vercel URL on iPhone Safari and choose **Share → Add to Home Screen**.

## Important

ChatGPT Plus does not provide API access for this custom app. You need an OpenAI API key with separate pay-as-you-go billing.
