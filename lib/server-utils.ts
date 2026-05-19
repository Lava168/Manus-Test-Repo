import { NextRequest, NextResponse } from "next/server";

export function json(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function getBearerToken(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
}

export async function getUserFromToken(token: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Missing Supabase public env.");
  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  const data = await resp.json();
  if (!resp.ok || !data?.id) return null;
  return data;
}

export async function supabaseRest(path: string, options: RequestInit = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase service env.");
  const resp = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  const text = await resp.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!resp.ok) {
    const err: any = new Error("Supabase REST error");
    err.status = resp.status;
    err.detail = data;
    throw err;
  }
  return data;
}

export async function ensureProfile(user: any) {
  const existing = await supabaseRest(`profiles?user_id=eq.${user.id}&select=*`, { method: "GET" });
  if (existing?.length) return existing[0];
  const created = await supabaseRest("profiles", {
    method: "POST",
    body: JSON.stringify({ user_id: user.id, email: user.email || "", plan: "free", generation_limit: 3, generations_used: 0 }),
  });
  return created[0];
}
