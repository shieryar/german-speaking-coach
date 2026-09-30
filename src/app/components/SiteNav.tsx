import Link from "next/link";

export default function SiteNav({ current }: { current: "home" | "live" | "history" | "notebook" }) {
  return <nav className="siteNav" aria-label="Main navigation">
    <Link className="brand" href="/"><span className="brandMark" aria-hidden="true">g<span>.</span></span><span>german<span className="brandLight">coach</span></span></Link>
    <div className="siteLinks">
      <Link href="/" aria-current={current === "home" ? "page" : undefined}>Missions</Link>
      <Link href="/live" aria-current={current === "live" ? "page" : undefined}>Conversation</Link>
      <Link href="/history" aria-current={current === "history" ? "page" : undefined}>Session reviews</Link>
      <Link href="/notebook" aria-current={current === "notebook" ? "page" : undefined}>Notebook</Link>
    </div>
  </nav>;
}
