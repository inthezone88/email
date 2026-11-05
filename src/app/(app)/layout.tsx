import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession, requireCtx } from "@/server/auth";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  let name: string | undefined, demo = false;
  try {
    const ctx = await requireCtx({ allowNoLocation: true });
    name = ctx.location?.name;
    demo = ctx.location?.status === "demo";
  } catch {
    redirect("/login");
  }
  return (
    <Suspense>
      <Shell locationName={name} demo={demo}>
        {children}
      </Shell>
    </Suspense>
  );
}
