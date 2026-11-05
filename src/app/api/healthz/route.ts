import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Railway health check: the server is up and the database answers. No auth, no data. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
