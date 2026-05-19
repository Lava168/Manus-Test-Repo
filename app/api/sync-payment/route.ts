import { NextRequest } from "next/server";
import Stripe from "stripe";
import { ensureProfile, getBearerToken, getUserFromToken, json, supabaseRest } from "@/lib/server-utils";

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "请先登录。" }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user) return json({ error: "登录状态无效，请重新登录。" }, { status: 401 });
    const { session_id } = await req.json();
    if (!session_id) return json({ error: "缺少 session_id。" }, { status: 400 });
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return json({ error: "未配置 STRIPE_SECRET_KEY。" }, { status: 500 });
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.client_reference_id !== user.id && session.metadata?.user_id !== user.id) return json({ error: "该支付记录不属于当前用户。" }, { status: 403 });
    if (session.payment_status !== "paid") return json({ error: "支付尚未完成。", payment_status: session.payment_status }, { status: 400 });
    const profile = await ensureProfile(user);
    if (profile.last_payment_session_id === session_id) return json({ ok: true, message: "该订单已同步过。", profile, remaining: Math.max(0, profile.generation_limit - profile.generations_used) });
    const updated = await supabaseRest(`profiles?user_id=eq.${user.id}`, { method: "PATCH", body: JSON.stringify({ plan: "pro", generation_limit: 100, last_payment_session_id: session_id, updated_at: new Date().toISOString() }) });
    const newProfile = updated[0];
    return json({ ok: true, message: "支付成功，已升级 Pro。", profile: newProfile, remaining: Math.max(0, newProfile.generation_limit - newProfile.generations_used) });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
