"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function Login() {
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState(sp.get("error") === "expired" ? "That link has expired or was already used. Request a new one." : "");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    const r = await fetch("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const b = await r.json().catch(() => ({}));
    if (r.ok) setState("sent");
    else {
      setState("error");
      setMsg(b.error ?? "Something went wrong");
    }
  };
  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "80px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="eyebrow">Email → revenue</div>
        <h1 className="title" style={{ margin: "2px 0 0" }}>
          Sign in
        </h1>
      </div>
      {state === "sent" ? (
        <div className="card-lg" role="status" style={{ fontSize: 14, lineHeight: 1.5 }}>
          If <strong>{email}</strong> has access, a sign-in link is on its way. It works once and expires in 15 minutes.
        </div>
      ) : (
        <form onSubmit={submit} className="card-lg" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label htmlFor="email" style={{ fontSize: 14, fontWeight: 600 }}>
            Email
          </label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
          {msg && <div style={{ fontSize: 13, color: "var(--red)" }}>{msg}</div>}
        </form>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
