import Link from "next/link";

export default function SiteNav({ current }: { current: "live" | "history" }) {
  return <nav className="siteNav" aria-label="Main navigation">
    <Link className="brand" href="/live"><span className="brandMark" aria-hidden="true">g<span>.</span></span><span>german<span className="brandLight">coach</span></span></Link>
    <div className="siteLinks">
      <Link href="/live" aria-current={current === "live" ? "page" : undefined}>Live Conversation</Link>
      <Link href="/history" aria-current={current === "history" ? "page" : undefined}>Past conversations</Link>
    </div>
  </nav>;
}
