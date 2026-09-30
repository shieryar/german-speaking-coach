"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGate from "@/app/components/AuthGate";
import SiteNav from "@/app/components/SiteNav";
import { db } from "@/lib/backend";
import { missionById } from "@/lib/scenarios";
import type { Review } from "@/lib/learning";

type Session = { id: string; mission_id: string; difficulty: string; started_at: string; status: string; review: Review | null; retain_transcript: boolean };
export default function HistoryPage() { return <AuthGate>{() => <HistoryInner />}</AuthGate>; }
function HistoryInner() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { void db<Session[]>("sessions?select=id,mission_id,difficulty,started_at,status,review,retain_transcript&order=started_at.desc&limit=50")
    .then(setSessions).catch((error) => setNotice(error.message)).finally(() => setLoaded(true)); }, []);
  async function remove(id: string) {
    try { await db(`sessions?id=eq.${id}`, { method: "DELETE" }); setSessions((items) => items.filter((item) => item.id !== id)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Session could not be deleted."); }
  }
  return <main className="siteShell"><SiteNav current="history" /><header className="pageHeader"><span className="sectionIndex">YOUR PRACTICE</span><h1>Session reviews</h1>
    <p>Review mission outcomes, revisit difficult moments and delete sessions. Saved notebook items remain until you remove them.</p></header>
    {notice && <p role="alert" className="errorBox">{notice}</p>}
    <section className="panel history historyPage" aria-label="Session reviews"><h2>Past missions <span className="historyCount">{sessions.length}</span></h2>
      {loaded && !sessions.length && <div className="historyEmpty"><p>No missions yet. <Link href="/">Choose a mission</Link> to start.</p></div>}
      <div className="sessionList">{sessions.map((item) => <article className="sessionRow" key={item.id}>
        <div><span className="sectionIndex">{item.difficulty} PRACTICE · {new Date(item.started_at).toLocaleString()}</span>
          <h3>{missionById[item.mission_id]?.title || item.mission_id}</h3>
          <p>{item.review ? `${item.review.objectives.filter((objective) => objective.complete).length} objectives completed · ${item.review.improvements.length} focused improvements` : "Review not available"}</p>
          <span className="transcriptNote">{item.retain_transcript ? "Transcript retained" : "Transcript not retained"}</span></div>
        <div className="sessionRowActions"><Link className="ghost linkButton" href={`/review?id=${item.id}`}>Open review</Link>
          <button className="ghost deleteButton" onClick={() => void remove(item.id)}>Delete session</button></div>
      </article>)}</div>
    </section></main>;
}
