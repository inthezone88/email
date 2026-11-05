import Link from "next/link";

const ITEMS = [
  { href: "/campaigns", label: "Campaigns", sub: "Every send ranked by clicks, calls and revenue" },
  { href: "/sequences", label: "Sequences", sub: "Which automation step earns the money" },
  { href: "/segments", label: "Segments", sub: "By list, lead source and sender" },
  { href: "/health", label: "List health", sub: "Bounces, spam complaints, unsubscribes" },
  { href: "/journeys", label: "Contact journeys", sub: "Every email, click, booking and payment for one person" },
];

export default function MorePage() {
  return (
    <div className="page" style={{ paddingTop: 8 }}>
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className="card-lg" style={{ textDecoration: "none", minHeight: 64, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{i.label}</span>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{i.sub}</span>
        </Link>
      ))}
      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>Wide tables scroll sideways on a phone.</div>
    </div>
  );
}
