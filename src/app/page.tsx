"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { lastTab } from "@/components/hooks";

const DESK = ["/campaigns", "/sequences", "/segments", "/health", "/journeys", "/settings"];
const MOB = ["/overview", "/emails", "/more", "/settings", ...DESK];

/** Phones get the mobile layout (Overview); desktops get Campaigns. Last tab wins if it fits the device. */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const phone = window.matchMedia("(max-width: 699.98px)").matches;
    const last = lastTab();
    const ok = last && (phone ? MOB : DESK).includes(last);
    router.replace(ok ? last! : phone ? "/overview" : "/campaigns");
  }, [router]);
  return null;
}
