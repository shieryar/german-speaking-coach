"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/app/components/AuthGate";
import SiteNav from "@/app/components/SiteNav";
import { db } from "@/lib/backend";
import { nextReview } from "@/lib/learning";

type Target = { id: string; original: string; correction: string; natural_alternative: string | null; explanation: string; category: string;
  occurrence_count: number; independent_uses: number; assisted_uses: number; next_review_at: string; dismissed: boolean };
type Vocabulary = { id: string; expression: string; meaning: string; article: string | null; plural: string | null; usage_pattern: string | null; example: string;
  recognition_count: number; assisted_uses: number; independent_uses: number; later_uses: number; review_stage: number; next_review_at: string };
type Attempt = { id: string; target_id: string | null; vocabulary_id: string | null; result: string; utterance: string | null; feedback: string | null; created_at: string };
const emptyVocab = { expression: "", meaning: "", article: "", plural: "", usage_pattern: "", example: "" };

export default function NotebookPage() { return <AuthGate>{(session) => <Notebook userId={session.user.id} />}</AuthGate>; }
function Notebook({ userId }: { userId: string }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [vocabulary, setVocabulary] = useState<Vocabulary[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [draft, setDraft] = useState(emptyVocab);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState<Partial<Target>>({});
  const [editingVocab, setEditingVocab] = useState<string | null>(null);
  const [vocabDraft, setVocabDraft] = useState(emptyVocab);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [quizAnswer, setQuizAnswer] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  async function refresh() {
    const [newTargets, newVocab, newAttempts] = await Promise.all([
      db<Target[]>("learning_targets?select=*&order=next_review_at.asc"),
      db<Vocabulary[]>("vocabulary?select=*&order=next_review_at.asc"),
      db<Attempt[]>("practice_attempts?select=id,target_id,vocabulary_id,result,utterance,feedback,created_at&order=created_at.desc&limit=100"),
    ]);
    setTargets(newTargets); setVocabulary(newVocab); setAttempts(newAttempts);
  }
  useEffect(() => { const timer = setTimeout(() => { void refresh().catch((error) => setNotice(error.message)).finally(() => setLoaded(true)); }, 0); return () => clearTimeout(timer); }, []);
  async function saveTarget(id: string) {
    try {
      if (!targetDraft.original?.trim() || !targetDraft.correction?.trim() || !targetDraft.explanation?.trim() || !targetDraft.category?.trim()) {
        setNotice("Original, correction, explanation and category are required."); return;
      }
      const identity = `${(targetDraft.category || "").toLowerCase().trim()}|${(targetDraft.correction || "").toLowerCase().trim()}`;
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
      const fingerprint = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
      await db(`learning_targets?id=eq.${id}`, { method: "PATCH", body: {
      original: targetDraft.original, correction: targetDraft.correction, natural_alternative: targetDraft.natural_alternative || null,
      explanation: targetDraft.explanation, category: targetDraft.category, fingerprint,
    } }); setEditingTarget(null); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Correction could not be saved."); }
  }
  async function targetAction(id: string, action: "dismiss" | "delete", dismissed?: boolean) {
    try { await db(`learning_targets?id=eq.${id}`, action === "delete" ? { method: "DELETE" } : { method: "PATCH", body: { dismissed: !dismissed } }); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Correction could not be changed."); }
  }
  async function saveVocabulary(newItem: boolean) {
    const item = newItem ? draft : vocabDraft;
    if (!item.expression.trim() || !item.meaning.trim() || !item.example.trim()) { setNotice("Expression, meaning and example are required."); return; }
    try {
      if (newItem) await db("vocabulary", { method: "POST", body: { ...item, article: item.article || null, plural: item.plural || null, usage_pattern: item.usage_pattern || null } });
      else await db(`vocabulary?id=eq.${editingVocab}`, { method: "PATCH", body: { ...item, article: item.article || null, plural: item.plural || null, usage_pattern: item.usage_pattern || null } });
      setDraft(emptyVocab); setEditingVocab(null); setNotice(""); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Vocabulary could not be saved."); }
  }
  async function removeVocabulary(id: string) {
    try { await db(`vocabulary?id=eq.${id}`, { method: "DELETE" }); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Vocabulary could not be deleted."); }
  }
  async function answerQuiz(item: Vocabulary, meaning: string) {
    const correct = meaning === item.meaning;
    const result = correct ? "recognised" : "needs_work";
    try {
      await db("practice_attempts", { method: "POST", body: { id: crypto.randomUUID(), user_id: userId, vocabulary_id: item.id,
        kind: "vocabulary", result, feedback: correct ? "Recognised in a meaning-choice exercise." : "Meaning-choice exercise needs review." } });
      await db(`vocabulary?id=eq.${item.id}`, { method: "PATCH", body: {
        recognition_count: item.recognition_count + (correct ? 1 : 0), ...nextReview(result, item.review_stage),
      } });
      setQuizAnswer(correct ? "Correct — recognition recorded. Use the word in a later conversation to strengthen it." : `Not yet. “${item.expression}” means “${item.meaning}”.`);
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Quiz result could not be saved."); }
  }
  async function clearLearning() {
    if (!window.confirm("Delete all corrections, vocabulary and practice attempts from your learning space?")) return;
    try {
      await db(`practice_attempts?user_id=eq.${userId}`, { method: "DELETE" });
      await db(`learning_targets?user_id=eq.${userId}`, { method: "DELETE" });
      await db(`vocabulary?user_id=eq.${userId}`, { method: "DELETE" });
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Learning data could not be fully deleted."); }
  }
  const quizItem = vocabulary.find((item) => item.id === quizId);
  const options = quizItem ? [quizItem.meaning, ...vocabulary.filter((item) => item.id !== quizItem.id).slice(0, 2).map((item) => item.meaning)].sort((a, b) => a.localeCompare(b)) : [];
  return <main className="siteShell"><SiteNav current="notebook" />
    <header className="pageHeader"><span className="sectionIndex">YOUR LEARNING PROFILE</span><h1>Learning notebook</h1>
      <p>Edit or dismiss corrections, build vocabulary and see when each item is due again.</p></header>
    {notice && <p role="alert" className="errorBox">{notice}</p>}
    {!loaded && <p>Loading notebook…</p>}
    <div className="notebookGrid">
      <section className="panel notebookSection"><span className="sectionIndex">01 / CORRECTIONS</span><h2>My recurring patterns</h2>
        {!targets.length && <p>No saved corrections yet. Complete a mission to build your learning profile.</p>}
        {targets.map((item) => <article className={`notebookItem ${item.dismissed ? "dismissed" : ""}`} key={item.id}>
          {editingTarget === item.id ? <div className="editGrid">{(["original", "correction", "natural_alternative", "explanation", "category"] as const).map((field) =>
            <label key={field}>{field.replaceAll("_", " ")}<input value={targetDraft[field] || ""} onChange={(event) => setTargetDraft({ ...targetDraft, [field]: event.target.value })} /></label>)}
            <button className="ghost" onClick={() => void saveTarget(item.id)}>Save correction</button><button className="ghost" onClick={() => setEditingTarget(null)}>Cancel</button></div>
            : <><span className="categoryTag">{item.category}</span><p lang="de"><strong>Original:</strong> {item.original}</p><p lang="de"><strong>Correction:</strong> {item.correction}</p>
              {item.natural_alternative && <p lang="de"><strong>Natural:</strong> {item.natural_alternative}</p>}<p>{item.explanation}</p>
              <p className="itemMeta">Seen {item.occurrence_count} time(s) · Independent {item.independent_uses} · Assisted {item.assisted_uses} · Due {new Date(item.next_review_at).toLocaleDateString()}</p>
              <PracticeHistory attempts={attempts.filter((attempt) => attempt.target_id === item.id)} />
              <div className="inlineActions"><button className="ghost" onClick={() => { setEditingTarget(item.id); setTargetDraft(item); }}>Edit</button>
                <button className="ghost" onClick={() => void targetAction(item.id, "dismiss", item.dismissed)}>{item.dismissed ? "Restore" : "Dismiss"}</button>
                <button className="ghost deleteButton" onClick={() => void targetAction(item.id, "delete")}>Delete</button></div></>}
        </article>)}</section>
      <section className="panel notebookSection"><span className="sectionIndex">02 / VOCABULARY</span><h2>My expressions</h2>
        <div className="editGrid vocabForm"><h3>Add an expression</h3>{Object.keys(emptyVocab).map((field) =>
          <label key={field}>{field.replaceAll("_", " ")}<input value={draft[field as keyof typeof draft]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} /></label>)}
          <button className="record" onClick={() => void saveVocabulary(true)}>Add to notebook</button></div>
        {!vocabulary.length && <p>No vocabulary saved yet.</p>}
        {vocabulary.map((item) => <article className="notebookItem" key={item.id}>
          {editingVocab === item.id ? <div className="editGrid">{Object.keys(emptyVocab).map((field) =>
            <label key={field}>{field.replaceAll("_", " ")}<input value={vocabDraft[field as keyof typeof vocabDraft]} onChange={(event) => setVocabDraft({ ...vocabDraft, [field]: event.target.value })} /></label>)}
            <button className="ghost" onClick={() => void saveVocabulary(false)}>Save expression</button><button className="ghost" onClick={() => setEditingVocab(null)}>Cancel</button></div>
            : <><h3 lang="de">{item.article ? `${item.article} ` : ""}{item.expression}{item.plural ? `, ${item.plural}` : ""}</h3><p>{item.meaning}</p>
              {item.usage_pattern && <p>Pattern: {item.usage_pattern}</p>}<p lang="de">{item.example}</p>
              <p className="itemMeta">Recognised {item.recognition_count} · Assisted {item.assisted_uses} · Independent {item.independent_uses} · Later sessions {item.later_uses} · Due {new Date(item.next_review_at).toLocaleDateString()}</p>
              <PracticeHistory attempts={attempts.filter((attempt) => attempt.vocabulary_id === item.id)} />
              <div className="inlineActions"><button className="ghost" onClick={() => { setEditingVocab(item.id); setVocabDraft({
                expression: item.expression, meaning: item.meaning, article: item.article || "", plural: item.plural || "", usage_pattern: item.usage_pattern || "", example: item.example }); }}>Edit</button>
                <button className="ghost" disabled={vocabulary.length < 3} onClick={() => { setQuizId(item.id); setQuizAnswer(""); }}>Recognition exercise</button>
                <button className="ghost deleteButton" onClick={() => void removeVocabulary(item.id)}>Delete</button></div></>}
        </article>)}
      </section>
    </div>
    {quizItem && <section className="panel quizPanel"><span className="sectionIndex">RECOGNITION EXERCISE</span><h2>What does “{quizItem.expression}” mean?</h2>
      <div className="quizOptions">{options.map((meaning) => <button className="ghost" key={meaning} disabled={Boolean(quizAnswer)} onClick={() => void answerQuiz(quizItem, meaning)}>{meaning}</button>)}</div>
      {quizAnswer && <p className="successBox">{quizAnswer}</p>}<button className="textButton" onClick={() => setQuizId(null)}>Close exercise</button></section>}
    <button className="ghost deleteButton clearButton" onClick={() => void clearLearning()}>Delete all learning data</button>
  </main>;
}

function PracticeHistory({ attempts }: { attempts: Attempt[] }) {
  if (!attempts.length) return null;
  return <details className="practiceHistory"><summary>Practice history ({attempts.length}{attempts.length === 100 ? "+" : ""})</summary>
    <ul>{attempts.slice(0, 5).map((attempt) => <li key={attempt.id}><strong>{attempt.result.replaceAll("_", " ")}</strong> · {new Date(attempt.created_at).toLocaleDateString()}
      {attempt.utterance && <span lang="de"> — {attempt.utterance}</span>}{attempt.feedback && <span> — {attempt.feedback}</span>}</li>)}</ul>
  </details>;
}
