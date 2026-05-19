import { NextRequest } from "next/server";
import { ensureProfile, getBearerToken, getUserFromToken, json, supabaseRest } from "@/lib/server-utils";

function buildPrompt({ template, researchTitle, researchType, background }: any) {
  return `
你是一个严谨的临床科研文档助手。你的任务是帮助医生、研究生、科研秘书生成“可修改的科研文档初稿”。

重要边界：
1. 不提供诊断或治疗建议。
2. 不编造真实文献、真实伦理编号、真实样本量依据。
3. 所有不确定信息必须标注“需人工确认”。
4. 不承诺论文发表，不代替研究者判断，只做结构化初稿。
5. 若涉及患者信息，提醒用户必须脱敏。

用户选择的模板：${template || "伦理申请材料包"}
研究题目：${researchTitle || "未填写"}
研究类型：${researchType || "未填写"}
研究背景/摘要：
${background || "未填写"}

请用中文生成一份结构清晰、可直接复制到 Word 的初稿。格式如下：

# 一、项目摘要
# 二、研究目的
# 三、研究对象与纳排标准
# 四、研究流程
# 五、主要观察指标
# 六、伦理风险与受益说明
# 七、隐私保护与数据安全
# 八、需人工确认清单
# 九、可导出的材料清单
`.trim();
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "请先登录后再生成。" }, { status: 401 });
    const user = await getUserFromToken(token);
    if (!user) return json({ error: "登录状态无效，请重新登录。" }, { status: 401 });
    const profile = await ensureProfile(user);
    const remaining = profile.generation_limit - profile.generations_used;
    if (remaining <= 0) return json({ error: "生成次数已用完，请升级 Pro 后继续使用。", code: "QUOTA_EXCEEDED", profile }, { status: 402 });

    const body = await req.json();
    const { template, researchTitle, researchType, background } = body || {};
    if (!researchTitle || !String(researchTitle).trim()) return json({ error: "请填写研究题目。" }, { status: 400 });
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return json({ error: "未配置 DEEPSEEK_API_KEY。" }, { status: 500 });

    const deepseekResponse = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || "deepseek-chat", messages: [{ role: "system", content: "你是一个医学科研文档助手，专注于科研文档结构化、规范化和初稿生成。" }, { role: "user", content: buildPrompt({ template, researchTitle, researchType, background }) }], temperature: 0.4, max_tokens: 2400 }),
    });
    const data = await deepseekResponse.json();
    if (!deepseekResponse.ok) return json({ error: "DeepSeek API 请求失败", detail: data }, { status: deepseekResponse.status });
    const text = data?.choices?.[0]?.message?.content || "DeepSeek 未返回内容。";
    const newUsed = profile.generations_used + 1;
    await supabaseRest(`profiles?user_id=eq.${user.id}`, { method: "PATCH", body: JSON.stringify({ generations_used: newUsed, updated_at: new Date().toISOString() }) });
    await supabaseRest("generations", { method: "POST", body: JSON.stringify({ user_id: user.id, template, research_title: researchTitle, research_type: researchType, output: text }) });
    return json({ text, remaining: Math.max(0, profile.generation_limit - newUsed), profile: { ...profile, generations_used: newUsed } });
  } catch (error: any) {
    return json({ error: error.message, detail: error.detail || null }, { status: 500 });
  }
}
