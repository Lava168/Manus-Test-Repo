import { NextRequest } from "next/server";
import { ensureProfile, getBearerToken, getUserFromToken, json } from "@/lib/server-utils";

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "请先登录。" }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user) return json({ error: "登录状态无效，请重新登录。" }, { status: 401 });
    const profile = await ensureProfile(user);
    return json({ user: { id: user.id, email: user.email }, profile, remaining: Math.max(0, profile.generation_limit - profile.generations_used) });
  } catch (error: any) {
    return json({ error: error.message, detail: error.detail || null }, { status: 500 });
  }
}
