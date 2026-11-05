"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, useApi, type ApiError } from "@/components/hooks";
import { C, Dot, ErrorBox, Segmented, Skeleton } from "@/components/ui";
import { relTime } from "@/lib/format";
import { UTM_TEMPLATE } from "@/lib/utm";
import { SUBJECT_STYLES } from "@/lib/subject";

type Me = { email: string; isAdmin: boolean; currentLocationId: string | null; locations: { id: string; name: string; status: string; lastSyncedAt: string | null; syncError: string | null }[] };
type Settings = { windowDays: number; model: "last_click" | "first_click"; reattributing: boolean };
type Links = {
  emails: { id: string; name: string; subject: string | null; utmCampaign: string | null; sentAt: string; style: string; styleOverride: string | null }[];
  links: { id: string; emailId: string; destination: string; label: string | null }[];
  audit: { id: string; name: string; sentAt: string; reason: string }[];
};

const card = "card-lg";
const col = { display: "flex", flexDirection: "column" as const, gap: 14 };
const GHL_MSG: Record<string, string> = {
  connected: "Connected. Importing history now. This can take a few minutes.",
  error: "GoHighLevel did not finish the connection. Try again.",
  state_mismatch: "The connection link expired. Start again.",
  missing_code: "GoHighLevel did not return an authorization code. Try again.",
};

export default function SettingsPage() {
  const sp = useSearchParams();
  const me = useApi<Me>("/api/me");
  const st = useApi<{ data: Settings }>("/api/settings");
  const links = useApi<{ data: Links }>("/api/links");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const loc = me.data?.locations.find((l) => l.id === me.data?.currentLocationId);
  const s = st.data?.data;

  useEffect(() => {
    if (!s?.reattributing) return;
    const t = setTimeout(st.reload, 2500);
    return () => clearTimeout(t);
  }, [s, st]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(null);
    }
  };
  const save = (patch: Partial<Settings>) =>
    run("settings", async () => {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(patch) });
      await st.reload();
    });

  const connected = loc?.status === "connected";
  const statusColor = connected ? C.green : loc?.status === "error" ? C.red : C.amberDot;
  const statusText = !loc
    ? "Not connected"
    : loc.status === "demo"
      ? "Not connected (demo data)"
      : loc.status === "connected"
        ? `Connected · last synced ${relTime(loc.lastSyncedAt)}`
        : loc.status === "error"
          ? "Access expired. Reconnect."
          : "Disconnected";

  return (
    <div className="page" style={{ paddingTop: 20 }}>
      <div style={{ maxWidth: 760, width: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
      {sp.get("ghl") && (
        <div className="banner" role="status">
          <Dot color={sp.get("ghl") === "connected" ? C.green : C.red} /> {GHL_MSG[sp.get("ghl")!] ?? "Done."}
        </div>
      )}
      {err && <ErrorBox error={err} />}

      <section className={card} style={col}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>GoHighLevel connection</h2>
        {me.loading && !me.data ? (
          <Skeleton h={20} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <Dot color={statusColor} />
            {loc ? <strong style={{ fontWeight: 600 }}>{loc.name}</strong> : null}
            {loc ? " · " : ""}
            {statusText}
          </div>
        )}
        {loc?.syncError && <div style={{ fontSize: 13, color: C.red }}>{loc.syncError}</div>}
        {me.data && me.data.locations.length > 1 && (
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            Sub-account
            <select
              className="input"
              value={me.data.currentLocationId ?? ""}
              onChange={(e) =>
                run("switch", async () => {
                  await api("/api/locations/select", { method: "POST", body: JSON.stringify({ id: e.target.value }) });
                  window.location.reload();
                })
              }
            >
              {me.data.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.status === "demo" ? " (demo)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <a className="btn" href="/api/ghl/install" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
          {connected ? "Connect another sub-account" : loc?.status === "error" || loc?.status === "disconnected" ? "Reconnect sub-account" : "Connect sub-account"}
        </a>
        {loc && loc.status !== "disconnected" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm secondary" disabled={!!busy} onClick={() => run("sync", async () => (await api("/api/ghl/sync", { method: "POST" }), await me.reload()))}>
              {busy === "sync" ? (
                <>
                  <span className="spin" /> Syncing…
                </>
              ) : (
                "Sync now"
              )}
            </button>
            {connected && (
              <button
                className="btn sm secondary"
                disabled={!!busy}
                onClick={() => confirm("Disconnect this sub-account? Stored data stays; syncing stops until you reconnect.") && run("disc", async () => (await api("/api/ghl/disconnect", { method: "POST" }), await me.reload()))}
              >
                Disconnect
              </button>
            )}
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>Reads email events, appointments, opportunities and payments through the GHL API. Read-only: nothing is changed in GoHighLevel.</div>
      </section>

      <section className={card} style={{ ...col, gap: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
          Attribution window {s?.reattributing && <span className="spin" aria-label="Re-crediting" style={{ marginLeft: 6 }} />}
        </h2>
        {!s ? (
          <Skeleton h={52} />
        ) : (
          <>
            <Segmented label="Attribution window" fill value={s.windowDays} onChange={(v) => save({ windowDays: v })} options={[7, 14, 30, 60].map((d) => ({ value: d, label: `${d}d` }))} />
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>Credit goes to</div>
            <Segmented
              label="Attribution model"
              fill
              value={s.model}
              onChange={(v) => save({ model: v })}
              options={[
                { value: "last_click", label: "Last click" },
                { value: "first_click", label: "First click" },
              ]}
            />
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              {s.reattributing ? "Re-crediting every booking and payment with these settings…" : "Changing these re-credits every booking and payment. Dashboards update when it finishes."}
            </div>
          </>
        )}
      </section>

      <section className={card} style={{ fontSize: 13, lineHeight: 1.6, color: "var(--body2)" }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 8px", color: "var(--ink)" }}>Tag every email link</h2>
        Add <span className="mono" style={{ fontSize: 12 }}>?utm_source=ghl&amp;utm_medium=email&amp;utm_campaign=…</span> to each link. A click is matched to the contact, then to their later booking or payment.
        <CopyRow label="UTM template" value={UTM_TEMPLATE} />
        <div style={{ marginTop: 8 }}>Sequence emails also need the step id in <span className="mono">utm_content</span>. For the most reliable per-contact clicks, use a tracked link below: it logs the click, then forwards to the tagged page.</div>
      </section>

      <LinkTagger data={links.data?.data} reload={links.reload} />

      <section className={card} style={col}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Link audit</h2>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Sends from the last 90 days whose links are missing UTMs or have no tracked clicks.</div>
        {links.data?.data.audit.length === 0 && <div style={{ fontSize: 13 }}>Every recent send has tagged, clicked links.</div>}
        {links.data?.data.audit.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, borderTop: "1px solid var(--divider)", paddingTop: 10 }}>
            <span style={{ fontWeight: 600 }}>{a.name}</span>
            <span style={{ color: C.amber, textAlign: "right" }}>{a.reason}</span>
          </div>
        ))}
      </section>

      <SubjectStyles data={links.data?.data} reload={links.reload} />

      <section className={card} style={col}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Notifications</h2>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Get alerts (spam complaints, bounces, show-rate drops) on this device. On iPhone, add the app to your Home Screen first.</div>
        <button className="btn sm secondary" onClick={() => run("push", enablePush)} disabled={!!busy}>
          {busy === "push" ? "Enabling…" : "Enable push notifications"}
        </button>
      </section>

      {me.data?.isAdmin && <Members />}

      <form action="/api/auth/logout" method="post">
        <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          Signed in as {me.data?.email}
          <button className="btn sm secondary" type="submit">
            Sign out
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
      <code className="mono" aria-label={label} style={{ flex: 1, fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", wordBreak: "break-all" }}>
        {value}
      </code>
      <button
        className="btn sm secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        }}
      >
        {ok ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function LinkTagger({ data, reload }: { data?: Links; reload: () => void }) {
  const [emailId, setEmailId] = useState("");
  const [dest, setDest] = useState("");
  const [out, setOut] = useState<{ tagged: string; tracked: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const make = async () => {
    setErr(null);
    try {
      const r = await api<{ data: { tagged: string; tracked: string } }>("/api/links", { method: "POST", body: JSON.stringify({ emailId, destination: dest }) });
      setOut(r.data);
      reload();
    } catch (e) {
      setErr((e as ApiError).message);
    }
  };
  return (
    <section className="card-lg" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Link tagger</h2>
      <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
        Email
        <select className="input" value={emailId} onChange={(e) => setEmailId(e.target.value)}>
          <option value="">Choose a send…</option>
          {data?.emails.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
        Destination URL
        <input className="input" type="url" placeholder="https://yoursite.com/book" value={dest} onChange={(e) => setDest(e.target.value)} />
      </label>
      <button className="btn sm" disabled={!emailId || !dest} onClick={make}>
        Create links
      </button>
      {err && <div style={{ fontSize: 13, color: C.red }}>{err}</div>}
      {out && (
        <div style={{ fontSize: 13 }}>
          Tracked link (paste into the GHL email; GHL fills in the contact id):
          <CopyRow label="Tracked link" value={out.tracked} />
          <div style={{ marginTop: 10 }}>Or, the plain UTM-tagged link:</div>
          <CopyRow label="Tagged link" value={out.tagged} />
        </div>
      )}
    </section>
  );
}

function SubjectStyles({ data, reload }: { data?: Links; reload: () => void }) {
  if (!data?.emails.length) return null;
  return (
    <section className="card-lg" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Subject line styles</h2>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>Classified automatically from the subject. Override any that look wrong.</div>
      {data.emails.slice(0, 25).map((e) => (
        <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", borderTop: "1px solid var(--divider)", paddingTop: 8 }}>
          <span style={{ fontSize: 13, minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>{e.name}</span>
            {e.subject && e.subject !== e.name && <span style={{ color: "var(--muted)" }}> · {e.subject}</span>}
          </span>
          <select
            className="input"
            aria-label={`Subject style for ${e.name}`}
            style={{ minHeight: 40, flex: "none" }}
            value={e.styleOverride ?? ""}
            onChange={async (ev) => {
              await api(`/api/emails/${encodeURIComponent(e.id)}`, { method: "PATCH", body: JSON.stringify({ subjectStyleOverride: ev.target.value || null }) });
              reload();
            }}
          >
            <option value="">Auto ({e.style})</option>
            {SUBJECT_STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      ))}
    </section>
  );
}

function Members() {
  const m = useApi<{ data: { email: string; role: string }[] }>("/api/members");
  const [email, setEmail] = useState("");
  return (
    <section className="card-lg" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Who can see this sub-account</h2>
      {m.data?.data.map((x) => (
        <div key={x.email} style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}>
          <span>{x.email}</span>
          <span className="mono muted">{x.role}</span>
        </div>
      ))}
      <form
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        onSubmit={async (e) => {
          e.preventDefault();
          await api("/api/members", { method: "POST", body: JSON.stringify({ email }) });
          setEmail("");
          m.reload();
        }}
      >
        <input className="input" type="email" required placeholder="client@theirbusiness.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 200 }} aria-label="Email to give access" />
        <button className="btn sm" type="submit">
          Give access
        </button>
      </form>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>They sign in with a one-time email link and only see this sub-account.</div>
    </section>
  );
}

async function enablePush() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw { message: "Push is not configured on the server (VAPID keys missing).", status: 0 } satisfies ApiError;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw { message: "This browser does not support push. On iPhone, add the app to your Home Screen first.", status: 0 } satisfies ApiError;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw { message: "Notifications are blocked for this site.", status: 0 } satisfies ApiError;
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key) });
  await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
  alert("Notifications are on for this device.");
}

function urlB64(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
