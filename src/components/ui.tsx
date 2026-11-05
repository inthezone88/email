"use client";
import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

export const C = {
  green: "#2f6f4f",
  amber: "#8a6508",
  amberDot: "#b8860b",
  red: "#a63d2f",
  ink: "#1b1a17",
  neutral: "#b9b5aa",
};

/** Keyboard-operable segmented control (radiogroup semantics, arrow keys move). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size,
  fill,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "sm";
  fill?: boolean;
  style?: CSSProperties;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + options.length) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={`seg${size ? " " + size : ""}${fill ? " fill" : ""}`} style={style}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", style }: { h?: number; w?: number | string; style?: CSSProperties }) {
  return <div className="sk" style={{ height: h, width: w, ...style }} aria-hidden />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="tbl-wrap" aria-busy="true" aria-label="Loading">
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        <Skeleton h={20} />
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} h={32} />
        ))}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>{children}</div>;
}

export function ErrorBox({ error, onRetry }: { error: { message: string; code?: string }; onRetry?: () => void }) {
  const disconnected = error.code === "disconnected" || error.code === "no_location" || /token|reconnect|not connected/i.test(error.message);
  return (
    <div className="card" role="alert" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span className="dot" style={{ background: C.red }} />
      <span style={{ fontSize: 14, flex: 1, minWidth: 200 }}>
        {disconnected ? "GoHighLevel is not connected, or its access expired. Reconnect in Settings." : error.message}
      </span>
      {disconnected ? (
        <a className="btn sm" href="/settings" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
          Open settings
        </a>
      ) : onRetry ? (
        <button className="btn sm secondary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function NumCell({ v, w, active, color, bold }: { v: string; w: string; active?: boolean; color?: string; bold?: boolean }) {
  return (
    <div role="cell" className="num" data-active={active ? "true" : undefined} style={{ alignSelf: "stretch", color: color ?? undefined, fontWeight: bold ? 600 : undefined }}>
      <span>{v}</span>
      <span className="bar" style={{ width: w }} />
    </div>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="dot" style={{ background: color, width: size, height: size }} aria-hidden />;
}
