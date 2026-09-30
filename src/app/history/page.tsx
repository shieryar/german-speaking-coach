"use client";

import { useEffect, useState } from "react";
import SiteNav from "@/app/components/SiteNav";
import Transcript from "@/app/components/Transcript";
import { LIVE_STORAGE_KEY, readLiveHistory, type SavedLiveSession } from "@/lib/live";
import { scenarioLabels, type Scenario } from "@/lib/scenarios";

export default function HistoryPage() {
  const [history, setHistory] = useState<SavedLiveSession[]>([]);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = setTimeout(() => {
      try { setHistory(readLiveHistory(localStorage)); }
      catch { setNotice("Saved conversation history could not be read."); }
      setLoaded(true);
    }, 0);
    return () => clearTimeout(load);
  }, []);

  function remove(id: string) {
    const remaining = history.filter((item) => item.id !== id);
    try {
      localStorage.setItem(LIVE_STORAGE_KEY, JSON.stringify(remaining));
      setHistory(remaining);
      setNotice("");
    } catch { setNotice("This transcript could not be deleted from browser storage."); }
  }

  return <main className="siteShell">
    <SiteNav current="history" />
    <header className="pageHeader">
      <h1>Past conversations</h1>
      <p>The latest 20 transcripts are saved in this browser. Audio is not saved.</p>
    </header>
    {notice && <p role="alert" className="storageNotice">{notice}</p>}
    <section className="panel history historyPage" aria-label="Past conversations">
      <div className="historyHeading"><h2>Saved transcripts <span className="historyCount">{history.length}</span></h2></div>
      {loaded && !history.length && !notice && <div className="historyEmpty"><p>No saved conversations yet.</p></div>}
      {history.map((session) => <details key={session.id}>
        <summary><span>{scenarioLabels[session.scenario as Scenario] || session.scenario}</span><span className="historyMeta">{new Date(session.createdAt).toLocaleString()} · {formatTime(session.seconds)}</span><span className="summaryArrow" aria-hidden="true">⌄</span></summary>
        <Transcript fragments={session.fragments} />
        <button className="ghost deleteButton" onClick={() => remove(session.id)}>Delete transcript</button>
      </details>)}
    </section>
    <footer className="siteFooter">German Coach · B1 / B2</footer>
  </main>;
}

function formatTime(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
