"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { rememberTab } from "./hooks";

export const DESKTOP_TABS = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/sequences", label: "Sequences" },
  { href: "/segments", label: "Segments" },
  { href: "/health", label: "List health" },
  { href: "/journeys", label: "Contact journeys" },
  { href: "/settings", label: "Settings" },
];

export const MOBILE_TABS = [
  { href: "/overview", label: "Overview", match: ["/overview"] },
  { href: "/emails", label: "Emails", match: ["/emails"] },
  { href: "/more", label: "More", match: ["/more", "/campaigns", "/sequences", "/segments", "/health", "/journeys"] },
  { href: "/settings", label: "Settings", match: ["/settings"] },
];

const TITLES: Record<string, [string, string]> = {
  "/campaigns": ["Campaigns", "Email → revenue"],
  "/sequences": ["Sequences", "Email → revenue"],
  "/segments": ["Segments", "Email → revenue"],
  "/health": ["List health", "Email → revenue"],
  "/journeys": ["Contact journeys", "Email → revenue"],
  "/settings": ["Settings", "Setup"],
  "/overview": ["Overview", "Email → revenue"],
  "/emails": ["Emails", "By send"],
  "/more": ["More", "Reports"],
};

/** Header + tabs. Desktop: segmented tab switcher. Phone (<700px): compact header and fixed bottom tab bar. */
export function Shell({ children, locationName, demo }: { children: ReactNode; locationName?: string; demo?: boolean }) {
  const path = usePathname();
  const [title, eyebrow] = TITLES[path] ?? ["", "Email → revenue"];
  useEffect(() => {
    if (TITLES[path]) rememberTab(path);
  }, [path]);
  const eyebrowText = [eyebrow, demo ? "Demo data" : locationName].filter(Boolean).join(" · ");

  return (
    <>
      <div className="page" style={{ paddingBottom: 0 }}>
        <div className="page-head desk-only">
          <div>
            <div className="eyebrow">{eyebrowText}</div>
            <h1 className="title" style={{ margin: 0 }}>
              {title}
            </h1>
          </div>
          <nav aria-label="Reports" className="seg">
            {DESKTOP_TABS.map((t) => (
              <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined} style={tabStyle(path === t.href)}>
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mob-only" style={{ alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 12 }}>
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h1 className="title" style={{ margin: "2px 0 0" }}>
              {title}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
            <span className="dot" style={{ width: 7, height: 7, background: demo ? "#2f6f4f" : "#2f6f4f" }} />
            {demo ? "Demo data" : locationName}
          </div>
        </div>
      </div>
      {children}
      <nav className="tabbar mob-only" aria-label="Main">
        {MOBILE_TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.match.includes(path) ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

function tabStyle(active: boolean) {
  return {
    minHeight: 40,
    padding: "0 16px",
    borderRadius: 9,
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
    background: active ? "#fbfaf7" : "transparent",
    color: "#1b1a17",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  };
}

/** Footer note, bound to the live attribution setting. */
export function AttributionNote({ windowDays, model, mobile }: { windowDays: number; model: string; mobile?: boolean }) {
  const m = model === "first_click" ? "first" : "last";
  return (
    <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
      {mobile
        ? `Opens are not used for attribution. Apple Mail Privacy Protection inflates them. Revenue is credited to the ${m} click within ${windowDays} days.`
        : `Opens are inflated by Apple Mail Privacy Protection, so rank by clicks, calls and revenue. Calls and revenue are credited to the ${m} tracked-link click within ${windowDays} days.`}
    </div>
  );
}
