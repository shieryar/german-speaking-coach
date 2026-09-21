import Link from "next/link";

export default function Home() {
  return <main className="shell choiceScreen">
    <p className="eyebrow">Your German speaking coach</p>
    <h1>How would you like to practice?</h1>
    <p className="muted">B1/B2 German for work and everyday professional conversations. No login needed.</p>
    <div className="choiceGrid">
      <Link href="/classic" className="card choiceCard">
        <span className="eyebrow">At your own pace</span>
        <h2>Classic Practice</h2>
        <p>Record a reply, review your corrections, and listen to your coach. Your existing practice history is here.</p>
        <strong>Open Classic Practice →</strong>
      </Link>
      <Link href="/live" className="card choiceCard">
        <span className="eyebrow">GPT-Live-1</span>
        <h2>Live Conversation</h2>
        <p>Talk naturally with your coach and read live transcripts of both sides. Save the conversation to review later.</p>
        <strong>Open Live Conversation →</strong>
      </Link>
    </div>
  </main>;
}
