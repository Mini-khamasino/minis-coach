// Mini's Coach AI relay (Cloudflare Worker).
// Holds the Groq key, admits only signed-in app users, enforces the publish switch and a daily cap,
// rotates between Groq models, and never stores message content.
import { createRemoteJWKSet, jwtVerify } from 'jose'

interface Env {
  GROQ_KEY: string
  USAGE: KVNamespace
  MODELS: string // comma-separated, tried in order
  PROJECT: string // Firebase project id
  ADMIN_EMAIL: string
  DAILY_CAP: string
}

const ORIGINS = ['https://minis-coach.web.app', 'http://localhost:5173']
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'))

let flagCache: { at: number; ai: boolean } | null = null

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Remaining, X-Model',
  Vary: 'Origin',
})

async function aiPublished(env: Env, token: string): Promise<boolean> {
  if (flagCache && Date.now() - flagCache.at < 60_000) return flagCache.ai
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${env.PROJECT}/databases/(default)/documents/coachConfig/features`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const doc = r.ok ? ((await r.json()) as { fields?: { ai?: { booleanValue?: boolean } } }) : {}
  flagCache = { at: Date.now(), ai: !!doc.fields?.ai?.booleanValue }
  return flagCache.ai
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin')
    const h = cors(origin)
    const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { ...h, ...extra, 'Content-Type': 'application/json' } })

    if (req.method === 'OPTIONS') return new Response(null, { headers: h })
    const path = new URL(req.url).pathname
    if (!((req.method === 'POST' && path === '/chat') || (req.method === 'GET' && path === '/models') || (req.method === 'POST' && path === '/summarize'))) return json({ error: 'not found' }, 404)
    if (origin && !ORIGINS.includes(origin)) return json({ error: 'origin' }, 403)

    // 1. who is this? (Firebase ID token from the app)
    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '')
    if (!token) return json({ error: 'sign in' }, 401)
    let uid: string, email: string
    try {
      const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${env.PROJECT}`, audience: env.PROJECT })
      uid = payload.sub as string
      email = (payload.email as string) ?? ''
    } catch {
      return json({ error: 'sign in' }, 401)
    }

    // 2. allowed? the admin always (test mode); everyone else once the AI switch is published
    const admin = email === env.ADMIN_EMAIL
    if (path === '/models') {
      if (!admin) return json({ error: 'admin only' }, 403)
      const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${env.GROQ_KEY}` } })
      const list = r.ok ? ((await r.json()) as { data: { id: string }[] }).data.map((m) => m.id).sort() : []
      return json({ configured: env.MODELS.split(','), available: list })
    }
    if (path === '/summarize') {
      if (!admin) return json({ error: 'admin only' }, 403)
      const body = await req.text()
      if (body.length > 100_000) return json({ error: 'too long' }, 413)
      const { items } = JSON.parse(body) as { items: unknown[] }
      if (!items?.length) return json({ summary: 'No feedback items found.', taskPrompt: '' })

      const prompt = `You analyze feedback and error reports for "Mini's Coach".
Items:
${JSON.stringify(items, null, 2).slice(0, 30000)}

Return JSON with:
1. "summary": structured summary in Arabic and English (ranked bugs, feature requests, quick wins).
2. "taskPrompt": actionable prompt for Claude/Gemini to fix bugs and build requests.

Format: {"summary": "...", "taskPrompt": "..."}`

      let last = 0
      for (const model of env.MODELS.split(',')) {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.GROQ_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.2,
            max_tokens: 2048,
          }),
        })
        last = r.status
        if (r.status === 429 || r.status >= 500 || r.status === 413) continue
        if (!r.ok) return json({ error: `ai ${r.status}` }, 502)
        const data = (await r.json()) as { choices: { message: { content: string } }[] }
        const raw = data.choices[0].message.content
        try {
          const parsed = JSON.parse(raw)
          return json({ summary: parsed.summary || raw, taskPrompt: parsed.taskPrompt || '' })
        } catch {
          return json({ summary: raw, taskPrompt: raw })
        }
      }
      return json({ error: last === 429 ? 'busy' : `ai ${last}` }, 503)
    }
    if (!admin && !(await aiPublished(env, token))) return json({ error: 'not available' }, 403)

    // 3. daily cap per person
    const day = new Date().toISOString().slice(0, 10)
    const key = `n:${uid}:${day}`
    const used = Number((await env.USAGE.get(key)) ?? 0)
    const cap = admin ? 1000 : Number(env.DAILY_CAP)
    if (used >= cap) return json({ error: 'daily limit' }, 429, { 'X-Remaining': '0' })

    // 4. forward to Groq, trying the next model when one is busy or out of quota
    const body = await req.text()
    if (body.length > 80_000) return json({ error: 'too long' }, 413)
    const { messages, tools } = JSON.parse(body) as { messages: unknown[]; tools?: unknown[] }
    let last = 0
    for (const model of env.MODELS.split(',')) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.GROQ_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, tools, tool_choice: tools?.length ? 'auto' : undefined, temperature: 0.3, max_tokens: 1024 }),
      })
      last = r.status
      if (r.status === 429 || r.status >= 500 || r.status === 413) continue
      if (!r.ok) return json({ error: `ai ${r.status}` }, 502)
      await env.USAGE.put(key, String(used + 1), { expirationTtl: 2 * 86400 })
      const data = (await r.json()) as { choices: { message: unknown }[] }
      return json({ message: data.choices[0].message }, 200, { 'X-Remaining': String(cap - used - 1), 'X-Model': model })
    }
    return json({ error: last === 429 ? 'busy' : `ai ${last}` }, 503)
  },
}
