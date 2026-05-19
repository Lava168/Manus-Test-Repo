"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

const templates = [
  { name: "伦理申请材料包", desc: "伦理申请书、知情同意书、隐私保护说明。" },
  { name: "课题申报书", desc: "立项依据、研究内容、技术路线、创新点。" },
  { name: "论文初稿框架", desc: "Introduction、Methods、Discussion 结构。" },
  { name: "开题 / 组会 PPT", desc: "汇报大纲、讲稿和幻灯片结构。" },
];

type Profile = {
  plan: string;
  generation_limit: number;
  generations_used: number;
};

export default function Home() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("伦理申请材料包");
  const [researchTitle, setResearchTitle] = useState("");
  const [researchType, setResearchType] = useState("前瞻性观察性研究");
  const [background, setBackground] = useState("");
  const [result, setResult] = useState("请先登录，然后填写研究信息生成文档。");
  const [status, setStatus] = useState("等待生成");
  const [loading, setLoading] = useState(false);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  }

  async function authFetch(url: string, options: RequestInit = {}) {
    const accessToken = await token();
    if (!accessToken) throw new Error("请先登录。");
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {}),
      },
    });
  }

  async function refreshMe() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (!data.session) {
      setProfile(null);
      setRemaining(null);
      return;
    }
    const res = await authFetch("/api/me");
    const body = await res.json();
    if (res.ok) {
      setProfile(body.profile);
      setRemaining(body.remaining);
    }
  }

  async function handlePaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const sessionId = params.get("session_id");
    if (payment === "success" && sessionId) {
      try {
        const res = await authFetch("/api/sync-payment", {
          method: "POST",
          body: JSON.stringify({ session_id: sessionId }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "支付同步失败");
        alert("支付成功，已升级 Pro。");
        await refreshMe();
        window.history.replaceState({}, "", "/#app");
      } catch (e: any) {
        alert(e.message);
      }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      refreshMe().then(() => handlePaymentReturn());
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setTimeout(() => refreshMe(), 100);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signUp() {
    setAuthMsg("");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return setAuthMsg(error.message);
    setAuthMsg(data.session ? "注册成功，已登录。" : "注册成功，请检查邮箱确认链接。");
    if (data.session) {
      setAuthOpen(false);
      await refreshMe();
    }
  }

  async function signIn() {
    setAuthMsg("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setAuthMsg(error.message);
    setSession(data.session);
    setAuthOpen(false);
    await refreshMe();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setRemaining(null);
  }

  async function generate() {
    if (!session) {
      setAuthOpen(true);
      return;
    }
    if (!researchTitle.trim()) return alert("请填写研究题目。");
    setLoading(true);
    setStatus("生成中");
    setResult("正在检查额度并调用 DeepSeek 生成科研文档初稿……");
    try {
      const res = await authFetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({ selectedTemplate, template: selectedTemplate, researchTitle, researchType, background }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.code === "QUOTA_EXCEEDED") document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
        throw new Error(body.error || "生成失败");
      }
      setResult(body.text);
      setStatus("已生成");
      await refreshMe();
    } catch (e: any) {
      setResult("生成失败：\n" + e.message);
      setStatus("失败");
    } finally {
      setLoading(false);
    }
  }

  async function upgrade() {
    if (!session) {
      setAuthOpen(true);
      return;
    }
    const res = await authFetch("/api/create-checkout-session", { method: "POST", body: JSON.stringify({ plan: "pro" }) });
    const body = await res.json();
    if (!res.ok) return alert(body.error || "创建付款失败");
    window.location.href = body.url;
  }

  function downloadResult() {
    const blob = new Blob([result], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MedResearch-AI-result.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <header className="glass sticky top-0 z-40 border-b border-slate-200/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg">🧠</div>
            <div><div className="text-sm font-black tracking-tight">MedResearch AI</div><div className="text-xs text-slate-500">临床科研文档应用</div></div>
          </div>
          <div className="flex items-center gap-3">
            {session && <div className="hidden rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 md:block">{session.user.email} · {remaining ?? "—"} 次</div>}
            {session ? <button onClick={signOut} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold hover:bg-slate-50">退出</button> : <button onClick={() => setAuthOpen(true)} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800">登录 / 注册</button>}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,#e0f2fe,transparent_34%),linear-gradient(180deg,#fff,#f8fafc)]">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[1fr_.92fr] lg:py-24">
          <div>
            <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700">✨ 可上线的医学科研 AI 应用</span>
            <h1 className="mt-7 max-w-3xl text-5xl font-black leading-[1.05] tracking-tight md:text-7xl">让医生和研究生，<span className="gradient-text">30 分钟生成科研初稿。</span></h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">登录、免费额度、付费升级、DeepSeek 生成、额度扣减都已接入。部署到 Vercel 后，用户打开网址即可使用。</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><a href="#app" className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800">打开应用 →</a><a href="#pricing" className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 hover:bg-slate-50">查看价格</a></div>
          </div>
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-4 shadow-soft">
            <div className="rounded-[1.5rem] bg-slate-950 p-5 text-white">
              <div className="flex items-center justify-between"><div><div className="text-sm font-bold">当前账户</div><div className="text-xs text-slate-400">Auth + Plan + Quota</div></div><span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">{session ? "已登录" : "未登录"}</span></div>
              <div className="mt-5 grid gap-3"><div className="rounded-2xl bg-white/10 p-3 text-sm text-slate-200 ring-1 ring-white/10">邮箱：{session?.user?.email || "—"}</div><div className="rounded-2xl bg-white/10 p-3 text-sm text-slate-200 ring-1 ring-white/10">套餐：{profile?.plan || "—"}</div><div className="rounded-2xl bg-white/10 p-3 text-sm text-slate-200 ring-1 ring-white/10">额度：{remaining ?? "—"} / {profile?.generation_limit || "—"}</div></div>
            </div>
          </div>
        </div>
      </section>

      <section id="app" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mb-10 text-center"><span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">AI 生成器</span><h2 className="mt-4 text-4xl font-black tracking-tight">生成一次，自动扣 1 次额度</h2><p className="mx-auto mt-4 max-w-2xl text-slate-600">后端会先验证登录，再检查剩余额度，然后调用 DeepSeek。</p></div>
          <div className="mb-6 grid gap-4 md:grid-cols-3"><div className="rounded-[2rem] border border-slate-200 bg-white p-5"><div className="text-sm text-slate-500">套餐</div><div className="mt-2 text-2xl font-black">{profile?.plan || "—"}</div></div><div className="rounded-[2rem] border border-slate-200 bg-white p-5"><div className="text-sm text-slate-500">已用次数</div><div className="mt-2 text-2xl font-black">{profile?.generations_used ?? "—"}</div></div><div className="rounded-[2rem] border border-slate-200 bg-white p-5"><div className="text-sm text-slate-500">剩余次数</div><div className="mt-2 text-2xl font-black">{remaining ?? "—"}</div></div></div>
          <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-black">选择文档模板</h3><p className="mb-5 text-sm text-slate-500">建议 MVP 先卖伦理申请材料包</p><div className="grid gap-3">{templates.map((t) => (<button key={t.name} onClick={() => setSelectedTemplate(t.name)} className={`rounded-3xl border p-4 text-left transition ${selectedTemplate === t.name ? "border-slate-950 bg-slate-950 text-white shadow-xl shadow-slate-950/10" : "border-slate-200 bg-white hover:border-slate-300"}`}><div className="font-black">{t.name}</div><div className={`mt-2 text-sm leading-6 ${selectedTemplate === t.name ? "text-slate-300" : "text-slate-600"}`}>{t.desc}</div></button>))}</div></div>
            <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><h3 className="text-xl font-black">{selectedTemplate}</h3><p className="mt-1 text-sm text-slate-500">填写信息后生成可编辑科研文档初稿</p></div><button onClick={generate} disabled={loading} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800 disabled:opacity-60">{loading ? "生成中……" : "生成文档 ✨"}</button></div></div><div className="grid gap-5 p-5 lg:grid-cols-2"><div className="space-y-4"><label className="block"><span className="text-sm font-bold text-slate-700">研究题目</span><input value={researchTitle} onChange={(e) => setResearchTitle(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-4 focus:ring-slate-950/10" placeholder="例如：连续血糖监测对糖尿病管理的影响" /></label><label className="block"><span className="text-sm font-bold text-slate-700">研究类型</span><select value={researchType} onChange={(e) => setResearchType(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-4 focus:ring-slate-950/10"><option>前瞻性观察性研究</option><option>回顾性队列研究</option><option>随机对照试验</option><option>病例对照研究</option><option>横断面研究</option><option>系统综述与 Meta 分析</option></select></label><label className="block"><span className="text-sm font-bold text-slate-700">研究摘要 / 背景</span><textarea value={background} onChange={(e) => setBackground(e.target.value)} className="mt-2 min-h-48 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-4 focus:ring-slate-950/10" placeholder="粘贴研究背景、目标、对象、主要指标。请勿粘贴任何可识别患者隐私。" /></label></div><div className="rounded-3xl bg-slate-950 p-5 text-white"><div className="mb-4 flex items-center justify-between"><div className="font-black">AI 生成结果</div><span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">{status}</span></div><pre className="min-h-[440px] rounded-2xl bg-white/10 p-4 text-sm leading-7 text-slate-200 ring-1 ring-white/10">{result}</pre><div className="mt-5 grid grid-cols-2 gap-3"><button onClick={downloadResult} className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 hover:bg-slate-100">下载 TXT</button><button onClick={() => navigator.clipboard.writeText(result)} className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 hover:bg-slate-100">复制内容</button></div></div></div></div>
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-slate-950 py-20 text-white"><div className="mx-auto max-w-7xl px-5"><div className="mb-10 text-center"><span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold">商业化</span><h2 className="mt-4 text-4xl font-black tracking-tight">免费试用 + Pro 付费升级</h2><p className="mx-auto mt-4 max-w-2xl text-slate-300">免费用户 3 次生成，Pro 用户 100 次生成。</p></div><div className="grid gap-5 lg:grid-cols-2"><div className="rounded-[2rem] border border-white/10 bg-white/5 p-6"><h3 className="text-xl font-black">免费版</h3><div className="mt-6 text-4xl font-black">¥0</div><div className="mt-6 grid gap-3 text-sm"><div>✓ 免费 3 次生成</div><div>✓ 基础模板</div><div>✓ 文本复制 / TXT 下载</div></div></div><div className="rounded-[2rem] border border-cyan-300 bg-white p-6 text-slate-950 shadow-2xl shadow-cyan-500/20"><span className="mb-5 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700">推荐首卖</span><h3 className="text-xl font-black">Pro 版</h3><div className="mt-6"><span className="text-4xl font-black">¥199</span><span className="text-sm text-slate-500">/一次性包</span></div><div className="mt-6 grid gap-3 text-sm"><div>✓ 升级到 100 次生成额度</div><div>✓ 全部模板</div></div><button onClick={upgrade} className="mt-7 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">升级 Pro</button></div></div></div></section>

      {authOpen && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-5 backdrop-blur"><div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-2xl font-black">登录 / 注册</h3><p className="mt-1 text-sm text-slate-500">邮箱注册后可免费生成 3 次。</p></div><button onClick={() => setAuthOpen(false)} className="rounded-full bg-slate-100 px-3 py-2 font-black">×</button></div><div className="grid gap-3"><input value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-4 focus:ring-slate-950/10" type="email" placeholder="邮箱" /><input value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-4 focus:ring-slate-950/10" type="password" placeholder="密码，至少 6 位" /><button onClick={signIn} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">登录</button><button onClick={signUp} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black hover:bg-slate-50">注册</button><p className="text-sm text-slate-500">{authMsg}</p></div></div></div>)}
    </main>
  );
}
