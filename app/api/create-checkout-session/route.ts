import { NextRequest } from "next/server";
import Stripe from "stripe";
import { ensureProfile, getBearerToken, getUserFromToken, json } from "@/lib/server-utils";

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "请先登录。" }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user) return json({ error: "登录状态无效，请重新登录。" }, { status: 401 });
    await ensureProfile(user);
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_PRICE_PRO;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
    if (!stripeKey || !priceId) return json({ error: "未配置 STRIPE_SECRET_KEY 或 STRIPE_PRICE_PRO。" }, { status: 500 });
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.create({ mode: "payment", line_items: [{ price: priceId, quantity: 1 }], success_url: `${siteUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}#app`, cancel_url: `${siteUrl}/?payment=cancel#pricing`, customer_email: user.email || undefined, client_reference_id: user.id, metadata: { user_id: user.id, plan: "pro" } });
    return json({ url: session.url, id: session.id });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
