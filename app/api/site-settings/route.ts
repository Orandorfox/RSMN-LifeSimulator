import { NextResponse } from "next/server";
import { readSiteSettings } from "@/lib/site-settings";

export async function GET() {
  const settings = await readSiteSettings();
  return NextResponse.json({ ok: true, settings });
}
