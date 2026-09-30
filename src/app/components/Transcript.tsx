"use client";

import { useEffect, useRef } from "react";
import type { TranscriptFragment } from "@/lib/live";

export default function Transcript({ fragments, autoScroll = false }: { fragments: TranscriptFragment[]; autoScroll?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const messages: { id: string; speaker: TranscriptFragment["speaker"]; text: string }[] = [];
  for (const fragment of fragments) {
    if (!fragment.text) continue;
    const previous = messages.at(-1);
    if (previous?.speaker === fragment.speaker) previous.text += fragment.text;
    else messages.push({ id: fragment.eventId, speaker: fragment.speaker, text: fragment.text });
  }

  useEffect(() => {
    if (autoScroll && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [fragments, autoScroll]);

  return <section className={`panel transcriptChat ${autoScroll ? "liveTranscript" : "savedTranscript"}`} aria-label={autoScroll ? "Live transcript" : "Saved transcript"}>
    <div className="transcriptHeading"><div><span className="sectionIndex">{autoScroll ? "02 / THE CONVERSATION" : "TRANSCRIPT"}</span><h2>Conversation</h2></div>{autoScroll && <span className="transcriptLiveTag"><span /> Live text</span>}</div>
    <div className="transcriptViewport" ref={viewport} role="log" aria-label="Conversation messages" aria-live={autoScroll ? "polite" : "off"} tabIndex={0}>
      {!messages.length && <div className="transcriptEmpty"><span className="emptyIcon" aria-hidden="true">✳</span><p>Every great conversation<br />starts with a hello.</p><span>Your words will appear here as you speak.</span></div>}
      {messages.map((message) => <div className={`transcriptMessage ${message.speaker === "user" ? "fromUser" : "fromCoach"}`} key={message.id}>
        <span className="transcriptSpeaker">{message.speaker === "user" ? "You" : "Coach"}</span>
        <p className="transcriptBubble" lang="de">{message.text}</p>
      </div>)}
    </div>
  </section>;
}
