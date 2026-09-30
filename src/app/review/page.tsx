"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGate from "@/app/components/AuthGate";
import RetryPanel from "@/app/components/RetryPanel";
import SiteNav from "@/app/components/SiteNav";
import { appPost, db } from "@/lib/backend";
import type { Review, Turn } from "@/lib/learning";
import { missionById, type Difficulty } from "@/lib/scenarios";

type Session = { id: string; mission_id: string; difficulty: Difficulty; started_at: string; retain_transcript: boolean; review: Review | null };
type Vocab = Review["vocabulary"][number];

export default function ReviewPage() { return <AuthGate>{() => <ReviewInner />}</AuthGate>; }
function ReviewInner() {
  const [session, setSession] = useState<Session | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [retryIndex, setRetryIndex] = useState<number | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [analysing, setAnalysing] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      const id = new URLSearchParams(window.location.search).get("id");
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { setNotice("Choose a session from Session reviews."); setLoading(false); return; }
      void Promise.all([
        db<Session[]>(`sessions?id=eq.${id}&select=*`),
        db<Turn[]>(`transcript_turns?session_id=eq.${id}&select=turn_index,speaker,text,start_ms,end_ms&order=turn_index.asc`),
      ]).then(([sessions, transcript]) => { setSession(sessions[0] || null); setTurns(transcript); })
        .catch((error) => setNotice(error.message)).finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const review = session?.review;
  const mission = session && missionById[session.mission_id];
  async function saveVocabulary(item: Vocab) {
    if (!session || !mission) return;
    try {
      await db("vocabulary?on_conflict=user_id,expression", { method: "POST", prefer: "resolution=ignore-duplicates,return=representation",
        body: { expression: item.expression, meaning: item.meaning, article: item.article, plural: item.plural, usage_pattern: item.usage_pattern,
          example: item.example, source_session_id: session.id, tags: mission.tags } });
      setSaved((items) => [...items, item.expression]);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Vocabulary could not be saved."); }
  }
  async function analyseSaved() {
    if (!session || !turns.length) return;
    setAnalysing(true); setNotice("");
    try {
      const result = await appPost<{ review: Review }>("/api/review", { sessionId: session.id, turns, hintAfterTurns: [] });
      setSession({ ...session, review: result.review });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Review failed."); }
    finally { setAnalysing(false); }
  }
  const original = retryIndex === null ? "" : turns.find((turn) => turn.turn_index === retryIndex)?.text ||
    review?.improvements.find((item) => item.turn_index === retryIndex)?.original || "";
  const preceding = retryIndex === null ? "" : turns.filter((turn) => turn.turn_index < retryIndex && turn.speaker === "assistant").at(-1)?.text ||
    review?.improvements.find((item) => item.turn_index === retryIndex)?.preceding_prompt || "";
  const correction = review?.improvements.find((item) => item.turn_index === retryIndex);
  return <main className="siteShell"><SiteNav current="history" />
    <header className="pageHeader"><span className="sectionIndex">AFTER THE CONVERSATION</span><h1>{mission?.title || "Session review"}</h1>
      {session && <p>{new Date(session.started_at).toLocaleString()} · Approximate {session.difficulty} practice difficulty, not an official CEFR assessment.</p>}</header>
    {notice && <p role="alert" className="errorBox">{notice}</p>}
    {loading && <p>Loading review…</p>}
    {!loading && !session && <Link href="/history">Back to session reviews</Link>}
    {session && !review && <section className="panel reviewCard"><h2>Review unavailable</h2><p>Analysis may have failed or the conversation ended early.</p>
      {turns.length > 0 ? <button className="ghost" disabled={analysing} onClick={() => void analyseSaved()}>{analysing ? "Analysing…" : "Generate review from saved transcript"}</button>
        : <p>No transcript turns were retained for analysis.</p>}<p><Link href="/">Choose a mission</Link></p></section>}
    {session && review && mission && <div className="reviewStack">
      <section className="panel reviewCard"><span className="sectionIndex">01 / TASK COMPLETION</span><h2>Mission outcome</h2>
        <p>{review.objectives.filter((item) => item.complete).length} of {mission.objectives.length} objectives completed from your turns.</p>
        <ul className="outcomeList">{mission.objectives.map((objective, index) => <li key={objective}><strong>{review.objectives[index]?.complete ? "✓ Completed" : "○ Not shown yet"}</strong><span>{objective}</span>
          {review.objectives[index]?.evidence && <blockquote lang="de">“{review.objectives[index].evidence}”</blockquote>}</li>)}</ul></section>
      <section className="panel reviewCard"><span className="sectionIndex">02 / LANGUAGE USE</span><h2>What to work on</h2><p>{review.language_summary}</p>
        {!review.improvements.length && <p>No clear correction was selected from this transcript. Recognition errors and optional style changes are not counted as learner mistakes.</p>}
        {review.improvements.map((item) => <article className="improvementCard" key={`${item.turn_index}-${item.category}`}>
          <span className="categoryTag">{item.category}</span><p><strong>You said:</strong> <span lang="de">{item.original}</span></p>
          <p><strong>Minimal correction:</strong> <span lang="de">{item.correction}</span></p>
          {item.natural_alternative && <p><strong>Natural alternative:</strong> <span lang="de">{item.natural_alternative}</span></p>}
          <p>{item.explanation}</p><button className="ghost" onClick={() => setRetryIndex(item.turn_index)}>Practise that moment</button>
        </article>)}</section>
      <section className="panel reviewCard"><span className="sectionIndex">03 / VOCABULARY</span><h2>Save useful expressions</h2>
        {!review.vocabulary.length && <p>No vocabulary suggestions from this session.</p>}
        <div className="vocabGrid">{review.vocabulary.map((item) => <article className="vocabSuggestion" key={item.expression}><strong lang="de">{item.article ? `${item.article} ` : ""}{item.expression}{item.plural ? `, ${item.plural}` : ""}</strong>
          <p>{item.meaning}</p>{item.usage_pattern && <p>Pattern: {item.usage_pattern}</p>}<p lang="de">{item.example}</p>
          <button className="ghost" disabled={saved.includes(item.expression)} onClick={() => void saveVocabulary(item)}>{saved.includes(item.expression) ? "Saved" : "Save to notebook"}</button></article>)}</div>
      </section>
      {!!turns.length && <section className="panel reviewCard"><span className="sectionIndex">04 / TRANSCRIPT</span><h2>Choose another moment</h2>
        <p>Transcript text can be imperfect. Select one of your turns to retry by voice.</p>
        <div className="turnList">{turns.filter((turn) => turn.speaker === "user").map((turn) => <button key={turn.turn_index} className="turnButton" onClick={() => setRetryIndex(turn.turn_index)} lang="de">{turn.text} <span>Practise ↗</span></button>)}</div></section>}
      {retryIndex !== null && <RetryPanel key={retryIndex} missionId={session.mission_id} difficulty={session.difficulty} sourceSessionId={session.id}
        turnIndex={retryIndex} original={original} prompt={preceding} correction={correction?.correction} alternative={correction?.natural_alternative}
        explanation={correction?.explanation} onClose={() => setRetryIndex(null)} />}
      <div className="reviewFooter"><Link className="record startLink" href="/">Choose another mission <span>↗</span></Link><Link className="ghost linkButton" href="/notebook">Open learning notebook</Link></div>
    </div>}
  </main>;
}
