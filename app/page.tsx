"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

const templates = [
  { name: "伦理申请材料包", desc: "生成伦理申请书、知情同意书、隐私保护说明与受试者招募说明。", tag: "最适合冷启动", time: "约 8 分钟" },
  { name: "课题申报书", desc: "生成立项依据、研究内容、技术路线、创新点、进度安排。", tag: "高付费意愿", time: "约 12 分钟" },
  { name: "论文初稿框架", desc: "基于研究方案生成 Introduction、Methods、Discussion 结构。", tag: "科研刚需", time: "约 10 分钟" },
  { name: "开题 / 组会 PPT", desc: "把研究方案转成汇报大纲、讲稿和幻灯片结构。", tag: "交付快", time: "约 6 分钟" },
];

const useCases = [
  { icon: "✅", title: "伦理申请", text: "把研究题目、对象、样本量、风险说明转成规范申请材料。" },
  { icon: "📚", title: "课题申报", text: "自动组织立项依据、技术路线、创新点和预期成果。" },
  { icon: "📝", title: "论文方法学", text: "根据研究设计生成 Methods、变量定义和统计分析计划。" },
  { icon: "📊", title: "科研汇报", text: "把复杂研究方案变成开题、组会、答辩 PPT 大纲。" },
];

const steps = ["填写研究信息", "上传脱敏材料", "选择生成模板", "AI 生成初稿", "人工确认导出"];

type Profile = { plan: string; generation_limit: number; generations_used: number };

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
    return fetch(url, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) } });
  }

  async function refreshMe() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (!data.session) { setProfile(null); setRemaining(null); return; }
    const res = await authFetch("/api/me");
    const body = await res.json();
    if (res.ok) { setProfile(body.profile); setRemaining(body.remaining); }
  }

  async function handlePaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const sessionId = params.get("session_id");
    if (payment === "success" && sessionId) {
      try {
        const res = await authFetch("/api/sync-payment", { method: "POST", body: JSON.stringify({ session_id: sessionId }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "支付同步失败");
        alert("支付成功，已升级 Pro。");
        await refreshMe();
        window.history.replaceState({}, "", "/#workspace");
      } catch (e: any) { alert(e.message); }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); refreshMe().then(() => handlePaymentReturn()); });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => { setSession(s); setTimeout(() => refreshMe(), 100); });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signUp() {
    setAuthMsg("");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return setAuthMsg(error.message);
    setAuthMsg(data.session ? "注册成功，已登录。" : "注册成功，请检查邮箱确认链接。");
    if (data.session) { setAuthOpen(false); await refreshMe(); }
  }

  async function signIn() {
    setAuthMsg("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setAuthMsg(error.message);
    setSession(data.session); setAuthOpen(false); await refreshMe();
  }

  async function signOut() {
    await supabase.auth.signOut(); setSession(null); setProfile(null); setRemaining(null);
  }

  async function generate() {
    if (!session) { setAuthOpen(true); return; }
    if (!researchTitle.trim()) return alert("请填写研究题目。");
    setLoading(true); setStatus("生成中"); setResult("正在检查额度并调用 DeepSeek 生成科研文档初稿……");
    try {
      const res = await authFetch("/api/generate", { method: "POST", body: JSON.stringify({ template: selectedTemplate, researchTitle, researchType, background }) });
      const body = await res.json();
      if (!res.ok) {
        if (body.code === "QUOTA_EXCEEDED") document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
        throw new Error(body.error || "生成失败");
      }
      setResult(body.text); setStatus("已生成"); await refreshMe();
    } catch (e: any) { setResult("生成失败：\n" + e.message); setStatus("失败"); }
    finally { setLoading(false); }
  }

  async function upgrade() {
    if (!session) { setAuthOpen(true); return; }
    const res = await authFetch("/api/create-checkout-session", { method: "POST", body: JSON.stringify({ plan: "pro" }) });
    const body = await res.json();
    if (!res.ok) return alert(body.error || "创建付款失败");
    window.location.href = body.url;
  }

  function downloadResult() {
    const blob = new Blob([result], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "MedResearch-AI-result.txt"; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <header className="glass sticky top-0 z-40 border-b border-slate-200/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a href="#" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg">🧠</div>
            <div><div className="text-sm font-black tracking-tight">MedResearch AI</div><div className="text-xs text-slate-500">临床科研文档助手</div></div>
          </a>
          <nav className="hidden items-center gap-7 md:flex">
            <a href="#features" className="text-sm font-semibold text-slate-600 hover:text-slate-950">功能</a>
            <a href="#workspace" className="text-sm font-semibold text-slate-600 hover:text-slate-950">工作台</a>
            <a href="#pricing" className="text-sm font-semibold text-slate-600 hover:text-slate-950">定价</a>
            <a href="#safety" className="text-sm font-semibold text-slate-600 hover:text-slate-950">合规</a>
          </nav>
          <div className="flex items-center gap-3">
            {session && <div className="hidden rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 lg:block">{session.user.email} · 剩余 {remaining ?? "—"} 次</div>}
            {session ? <button onClick={signOut} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold hover:bg-slate-50">退出</button> : <button onClick={() => setAuthOpen(true)} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800">登录 / 注册</button>}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,#e0f2fe,transparent_34%),linear-gradient(180deg,#fff,#f8fafc)]">
        <div className="absolute -right-36 top-20 h-96 w-96 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="absolute -left-36 bottom-0 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[1fr_.92fr] lg:py-24">
          <div>
            <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700">✨ 先做科研文档，不碰诊断红线</span>
            <h1 className="mt-7 max-w-3xl text-5xl font-black leading-[1.05] tracking-tight md:text-7xl">让医生和研究生，<span className="gradient-text">30 分钟生成科研初稿。</span></h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">面向临床科研场景的 AI 文档工作台：从伦理申请、课题申报、统计方案到开题汇报，帮助团队把零散材料变成可修改、可追溯、可导出的规范文档。</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#workspace" className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800">开始生成 Demo →</a>
              <a href="#process" className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 hover:bg-slate-50">查看工作流</a>
            </div>
            <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3">
              {["脱敏上传", "来源标注", "人工确认"].map((item) => <div key={item} className="rounded-2xl border border-slate-200 bg-white/70 p-4 backdrop-blur"><div className="mb-2 text-emerald-600">✓</div><div className="text-sm font-bold text-slate-800">{item}</div></div>)}
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/10">
            <div className="rounded-[1.5rem] bg-slate-950 p-5 text-white">
              <div className="flex items-center justify-between"><div><div className="text-sm font-bold">伦理申请材料生成</div><div className="text-xs text-slate-400">Project workspace</div></div><span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">{session ? "已登录" : "待登录"}</span></div>
              <div className="mt-5 grid gap-3">
                {["研究题目：2 型糖尿病患者连续血糖监测研究", "研究类型：前瞻性观察性研究", `当前套餐：${profile?.plan || "free"}`, `剩余额度：${remaining ?? "—"}`].map((item) => <div key={item} className="rounded-2xl bg-white/10 p-3 text-sm text-slate-200 ring-1 ring-white/10">{item}</div>)}
              </div>
            </div>
            <div className="grid gap-4 p-5">
              <div className="flex items-center justify-between"><div><div className="font-bold">生成进度</div><div className="text-sm text-slate-500">正在生成知情同意书与隐私说明</div></div><div className="text-2xl font-black">82%</div></div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[82%] rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500" /></div>
              <div className="grid grid-cols-2 gap-3">{["伦理申请书", "知情同意书", "招募说明", "数据安全说明"].map((doc, index) => <div key={doc} className="rounded-2xl border border-slate-200 p-4"><div className="mb-3">📄</div><div className="text-sm font-bold">{doc}</div><div className="mt-1 text-xs text-slate-500">{index < 3 ? "已生成" : "生成中"}</div></div>)}</div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-20">
        <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">核心功能</span><h2 className="mt-4 text-4xl font-black tracking-tight">先解决最愿意付费的科研文档痛点</h2></div><p className="max-w-xl text-slate-600">第一版不做复杂医院系统，只做能马上交付价值的文档生成和规范化工作流。</p></div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{useCases.map((item) => <div key={item.title} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5"><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">{item.icon}</div><h3 className="text-lg font-black">{item.title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{item.text}</p></div>)}</div>
      </section>

      <section id="workspace" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mb-10 text-center"><span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">产品 Demo</span><h2 className="mt-4 text-4xl font-black tracking-tight">一个完整可落地的生成工作台</h2><p className="mx-auto mt-4 max-w-2xl text-slate-600">用户不需要会 prompt，只需要按表单填写研究信息，系统自动匹配模板、生成初稿、提示风险并导出。</p></div>
          <div className="mb-6 grid gap-4 md:grid-cols-3"><div className="rounded-[2rem] border bg-white p-5"><div className="text-sm text-slate-500">套餐</div><div className="mt-2 text-2xl font-black">{profile?.plan || "—"}</div></div><div className="rounded-[2rem] border bg-white p-5"><div className="text-sm text-slate-500">已用次数</div><div className="mt-2 text-2xl font-black">{profile?.generations_used ?? "—"}</div></div><div className="rounded-[2rem] border bg-white p-5"><div className="text-sm text-slate-500">剩余次数</div><div className="mt-2 text-2xl font-black">{remaining ?? "—"}</div></div></div>
          <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><div><h3 className="font-black">选择文档模板</h3><p className="text-sm text-slate-500">建议 MVP 先卖伦理申请材料包</p></div><div className="text-amber-500">⚡</div></div><div className="grid gap-3">{templates.map((item) => <button key={item.name} onClick={() => setSelectedTemplate(item.name)} className={`rounded-3xl border p-4 text-left transition ${selectedTemplate === item.name ? "border-slate-950 bg-slate-950 text-white shadow-xl shadow-slate-950/10" : "border-slate-200 bg-white hover:border-slate-300"}`}><div className="font-black">{item.name}</div><div className={`mt-2 text-sm leading-6 ${selectedTemplate === item.name ? "text-slate-300" : "text-slate-600"}`}>{item.desc}</div><div className="mt-4 flex items-center gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-bold ${selectedTemplate === item.name ? "border-white/20 bg-white/10 text-white" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{item.tag}</span><span className={`text-xs ${selectedTemplate === item.name ? "text-slate-300" : "text-slate-500"}`}>{item.time}</span></div></button>)}</div></div>
            <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"><div className="border-b p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><h3 className="text-xl font-black">{selectedTemplate}</h3><p className="mt-1 text-sm text-slate-500">填写信息后生成可编辑 Word / PPT 初稿</p></div><button onClick={generate} disabled={loading} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800 disabled:opacity-60">{loading ? "生成中……" : "生成文档 ✨"}</button></div></div><div className="grid gap-5 p-5 lg:grid-cols-2"><div className="space-y-4"><label className="block"><span className="text-sm font-bold text-slate-700">研究题目</span><input value={researchTitle} onChange={(e) => setResearchTitle(e.target.value)} className="mt-2 w-full rounded-2xl border px-4 py-3 outline-none focus:ring-4 focus:ring-slate-950/10" placeholder="例如：连续血糖监测对糖尿病管理的影响" /></label><label className="block"><span className="text-sm font-bold text-slate-700">研究类型</span><select value={researchType} onChange={(e) => setResearchType(e.target.value)} className="mt-2 w-full rounded-2xl border px-4 py-3 outline-none focus:ring-4 focus:ring-slate-950/10"><option>前瞻性观察性研究</option><option>回顾性队列研究</option><option>随机对照试验</option><option>病例对照研究</option><option>横断面研究</option><option>系统综述与 Meta 分析</option></select></label><label className="block"><span className="text-sm font-bold text-slate-700">研究摘要 / 背景</span><textarea value={background} onChange={(e) => setBackground(e.target.value)} className="mt-2 min-h-32 w-full rounded-2xl border px-4 py-3 outline-none focus:ring-4 focus:ring-slate-950/10" placeholder="粘贴你的研究背景、目标、对象、主要指标……" /></label><div className="rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center"><div className="text-3xl">☁️</div><div className="mt-3 font-bold">上传脱敏材料</div><p className="mt-1 text-sm text-slate-500">后续可接 PDF / Word / Excel 解析</p></div></div><div className="rounded-3xl bg-slate-950 p-5 text-white"><div className="mb-4 flex items-center justify-between"><div className="font-black">AI 生成结果</div><span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">{status}</span></div><pre className="min-h-[420px] rounded-2xl bg-white/10 p-4 text-sm leading-7 text-slate-200 ring-1 ring-white/10">{result}</pre><div className="mt-5 grid grid-cols-2 gap-3"><button onClick={downloadResult} className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 hover:bg-slate-100">下载 TXT</button><button onClick={() => navigator.clipboard.writeText(result)} className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 hover:bg-slate-100">复制内容</button></div></div></div></div>
          </div>
        </div>
      </section>

      <section id="process" className="mx-auto max-w-7xl px-5 py-20"><div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:items-center"><div><span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">落地流程</span><h2 className="mt-4 text-4xl font-black tracking-tight">不是聊天机器人，而是可收费的工作流</h2><p className="mt-4 leading-7 text-slate-600">把 prompt 隐藏在产品后面，用表单、模板、质控和导出能力完成真正交付。用户买的是结果，不是和 AI 对话。</p></div><div className="grid gap-4 md:grid-cols-5">{steps.map((step, i) => <div key={step} className="rounded-3xl border bg-white p-5 shadow-sm"><div className="mb-5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">{i + 1}</div><div className="text-sm font-black">{step}</div></div>)}</div></div></section>

      <section id="pricing" className="bg-slate-950 py-20 text-white"><div className="mx-auto max-w-7xl px-5"><div className="mb-10 text-center"><span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold">商业化</span><h2 className="mt-4 text-4xl font-black tracking-tight">免费试用 + Pro 付费升级</h2><p className="mx-auto mt-4 max-w-2xl text-slate-300">免费用户 3 次生成，Pro 用户 100 次生成。MVP 先用一次性付款跑通收钱闭环。</p></div><div className="grid gap-5 lg:grid-cols-2"><div className="rounded-[2rem] border border-white/10 bg-white/5 p-6"><h3 className="text-xl font-black">免费版</h3><p className="mt-2 text-sm text-slate-300">适合试用和演示。</p><div className="mt-6 text-4xl font-black">¥0</div><div className="mt-6 grid gap-3 text-sm"><div>✓ 免费 3 次生成</div><div>✓ 基础模板</div><div>✓ 文本复制 / TXT 下载</div></div></div><div className="rounded-[2rem] border border-cyan-300 bg-white p-6 text-slate-950 shadow-2xl shadow-cyan-500/20"><span className="mb-5 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700">推荐首卖</span><h3 className="text-xl font-black">Pro 版</h3><p className="mt-2 text-sm text-slate-600">适合认真完成开题、伦理或申报材料的用户。</p><div className="mt-6"><span className="text-4xl font-black">¥199</span><span className="text-sm text-slate-500">/一次性包</span></div><div className="mt-6 grid gap-3 text-sm"><div>✓ 升级到 100 次生成额度</div><div>✓ 全部模板</div><div>✓ 后续可扩展 Word / PDF 导出</div></div><button onClick={upgrade} className="mt-7 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">升级 Pro</button></div></div></div></section>

      <section id="safety" className="mx-auto max-w-7xl px-5 py-20"><div className="grid gap-8 lg:grid-cols-2 lg:items-center"><div><span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">安全边界</span><h2 className="mt-4 text-4xl font-black tracking-tight">明确边界，才更容易进医院和高校</h2><p className="mt-4 leading-7 text-slate-600">产品不提供诊断、治疗建议，不承诺论文发表，不代替研究者判断。它只做科研文档整理、结构化、规范化和初稿辅助。</p></div><div className="grid gap-4">{[{title:"默认脱敏",text:"上传前提示删除姓名、身份证号、电话、住院号等可识别信息。",icon:"🔒"},{title:"人工确认",text:"所有关键结论、样本量依据、统计方法都标记为需研究者确认。",icon:"🛡️"},{title:"来源追踪",text:"引用文献、上传材料和 AI 推断分开标注，降低胡编风险。",icon:"✅"}].map((item) => <div key={item.title} className="rounded-[2rem] border bg-white p-5"><h3 className="font-black">{item.icon} {item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p></div>)}</div></div></section>

      {authOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-5 backdrop-blur"><div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-2xl font-black">登录 / 注册</h3><p className="mt-1 text-sm text-slate-500">邮箱注册后可免费生成 3 次。</p></div><button onClick={() => setAuthOpen(false)} className="rounded-full bg-slate-100 px-3 py-2 font-black">×</button></div><div className="grid gap-3"><input value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-2xl border px-4 py-3 outline-none focus:ring-4 focus:ring-slate-950/10" type="email" placeholder="邮箱" /><input value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-2xl border px-4 py-3 outline-none focus:ring-4 focus:ring-slate-950/10" type="password" placeholder="密码，至少 6 位" /><button onClick={signIn} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">登录</button><button onClick={signUp} className="rounded-2xl border bg-white px-5 py-3 text-sm font-black hover:bg-slate-50">注册</button><p className="text-sm text-slate-500">{authMsg}</p></div></div></div>}
    </main>
  );
}
