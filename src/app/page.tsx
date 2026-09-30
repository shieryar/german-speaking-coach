"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGate from "@/app/components/AuthGate";
import SiteNav from "@/app/components/SiteNav";
import { db } from "@/lib/backend";
import { difficultyLevels, missions, type Difficulty } from "@/lib/scenarios";

export default function Home() {
  return <AuthGate>{(session) => <HomeInner userId={session.user.id} />}</AuthGate>;
}
function HomeInner({ userId }: { userId: string }) {
  const [missionId, setMissionId] = useState("apartment-viewing");
  const [difficulty, setDifficulty] = useState<Difficulty>("B1");
  const [retain, setRetain] = useState(false);
  const [notice, setNotice] = useState("");
  const mission = missions.find((item) => item.id === missionId)!;
  useEffect(() => {
    void db<{ retain_transcripts: boolean }[]>("profiles?select=retain_transcripts").then((rows) => {
      if (rows[0]) setRetain(rows[0].retain_transcripts);
      else return db("profiles?on_conflict=user_id", { method: "POST", prefer: "resolution=ignore-duplicates,return=representation",
        body: { user_id: userId, retain_transcripts: false } });
    }).catch((error) => setNotice(error.message));
  }, [userId]);
  async function changeRetention(value: boolean) {
    setRetain(value);
    try { await db(`profiles?user_id=eq.${userId}`, { method: "PATCH", body: { retain_transcripts: value } }); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Preference could not be saved."); }
  }
  return <main className="siteShell">
    <SiteNav current="home" />
    <header className="pageHeader heroHeader"><span className="sectionIndex">SPEAK WITH PURPOSE</span><h1>Choose your next conversation.</h1>
      <p>Practise a real situation in German. Your coach brings a few past weak spots and due words into the next mission.</p></header>
    <div className="homeGrid">
      <section className="missionList" aria-label="Choose a mission">
        {missions.map((item) => <button key={item.id} className={`missionCard ${missionId === item.id ? "selected" : ""}`} onClick={() => { setMissionId(item.id); setDifficulty(item.defaultLevel); }}>
          <span className="sectionIndex">{item.defaultLevel} STARTING POINT</span><strong>{item.title}</strong><span>{item.situation}</span>
        </button>)}
      </section>
      <section className="panel missionDetail">
        <span className="sectionIndex">YOUR MISSION</span><h2>{mission.title}</h2><p>{mission.situation}</p>
        <div className="roleGrid"><div><span>Coach plays</span><strong>{mission.aiRole}</strong></div><div><span>You play</span><strong>{mission.learnerRole}</strong></div></div>
        <h3>What to achieve</h3><ul className="objectiveList">{mission.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>
        <label className="fieldLabel">Practice difficulty
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>{difficultyLevels.map((level) => <option key={level}>{level}</option>)}</select>
        </label>
        {mission.complications[difficulty] && <p className="missionComplication">Possible twist: {mission.complications[difficulty]}</p>}
        <label className="checkLabel"><input type="checkbox" checked={retain} onChange={(event) => void changeRetention(event.target.checked)} /> Save transcripts to my learning space</label>
        <p className="privacyNote">Microphone access is requested only when you start speaking. Audio goes to OpenAI for the live conversation and is not stored by this app or by the GPT-Live session. If transcripts are off, the full transcript is discarded after review; short evidence excerpts in reviews and saved corrections remain in your learning space.</p>
        <Link className="record startLink" href={`/live?mission=${missionId}&level=${difficulty}&retain=${retain ? "1" : "0"}`}>Continue to conversation <span>↗</span></Link>
        <p className="billingNote">OpenAI API usage is billed separately from ChatGPT Plus. Check current API pricing for your account.</p>
      </section>
    </div>
    {notice && <p role="alert" className="errorBox">{notice}</p>}
  </main>;
}
