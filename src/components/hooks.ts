"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface Meta {
  location: { id: string; name: string; status: string };
  lastSyncedAt: string | null;
  syncError: string | null;
  settings: { windowDays: number; model: "last_click" | "first_click"; reattributing: boolean };
}

export interface ApiError {
  message: string;
  code?: string;
  status: number;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
    throw { message: "Signed out", status: 401 } satisfies ApiError;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw { message: body.error ?? `Request failed (${res.status})`, code: body.code, status: res.status } satisfies ApiError;
  return body as T;
}

/**
 * Fetch JSON with loading/error state. While the server reports re-attribution in progress,
 * poll every 3s so the dashboard updates itself when it finishes.
 */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>(url);
      if (my === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError(e as ApiError);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  const reattributing = !!(data as { meta?: Meta } | null)?.meta?.settings.reattributing;
  useEffect(() => {
    if (!reattributing) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [reattributing, data, load]);

  return { data, error, loading, reload: load };
}

function ls(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* private mode */
  }
}

/** Date range lives in the URL (?range=) and is remembered in localStorage. */
export function useRange(allowed: number[], fallback: number, storageKey = "er.range") {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const fromUrl = Number(sp.get("range"));
  const [range, setRangeState] = useState<number>(allowed.includes(fromUrl) ? fromUrl : fallback);

  useEffect(() => {
    if (allowed.includes(fromUrl)) return;
    const saved = Number(ls(storageKey));
    if (allowed.includes(saved) && saved !== range) setRangeState(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRange = (r: number) => {
    setRangeState(r);
    lsSet(storageKey, String(r));
    const q = new URLSearchParams(sp.toString());
    q.set("range", String(r));
    router.replace(`${path}?${q.toString()}`, { scroll: false });
  };
  return [range, setRange] as const;
}

export function rememberTab(path: string) {
  lsSet("er.tab", path);
}
export function lastTab(): string | null {
  return ls("er.tab");
}
