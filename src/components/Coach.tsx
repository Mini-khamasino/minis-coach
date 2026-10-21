import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sparkles, RefreshCw, Copy, ArrowUp } from 'lucide-react'
import { db, type CoachMessage } from '../lib/db.ts'
import { pickReply, react, aiPrompt, markAiShared, ask } from '../lib/coach.ts'
import { L, locale } from '../lib/i18n.ts'
import { Sheet, toast } from './ui.tsx'

const REACTIONS = ['👍', '❤️', '😅', '💪', '👎']

/** The coach writes; the person reacts, taps a quick reply, or asks a question. Reads top-to-bottom like a chat. */
export function Coach({ visible }: { visible: boolean }) {
  const msgs = useLiveQuery(() => db.messages.orderBy('id').reverse().limit(80).toArray().then((a) => a.reverse())) ?? []
  const [q, setQ] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { if (visible) end.current?.scrollIntoView({ block: 'end' }) }, [visible, msgs.length])
  const send = () => { if (q.trim()) { ask(q); setQ('') } }
  const lastShare = useLiveQuery(() => db.kv.get('lastAiShare'))?.value as number | undefined
  const [ai, setAi] = useState<'full' | 'update' | null>(null)

  // opening the tab marks everything read (clears the dot)
  useEffect(() => {
    if (visible) db.messages.filter((m) => !m.read).modify({ read: true })
  }, [visible, msgs.length])

  const staleDays = lastShare ? Math.floor((Date.now() - lastShare) / 86400_000) : null
  let lastDate = ''

  return (
    <div className="flex flex-col gap-3">
      <section className="card !p-3">
        <p className="mb-2 text-[13px] text-ink-2">{L('عايز رأي ذكاء اصطناعي؟ خد بياناتك في رسالة جاهزة لـ ChatGPT أو Gemini أو Claude:', 'Want an AI’s take? Get your data as a ready message for ChatGPT, Gemini or Claude:')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button className="press flex items-center justify-center gap-1.5 rounded-2xl bg-accent py-2.5 text-[14px] font-semibold text-white" onClick={() => setAi('full')}><Sparkles size={16} /> {L('شات جديد', 'New AI chat')}</button>
          <button className="press flex items-center justify-center gap-1.5 rounded-2xl bg-fill py-2.5 text-[14px] font-semibold disabled:opacity-40" disabled={!lastShare} onClick={() => setAi('update')}><RefreshCw size={16} /> {L('تحديث', 'Update')}</button>
        </div>
        {staleDays !== null && staleDays >= 5 && <p className="mt-2 text-center text-[12px] text-amber">{L(`مبعتش تحديث للـ AI من ${staleDays} يوم`, `You haven't updated your AI in ${staleDays} days`)}</p>}
      </section>

      {!msgs.length && (
        <div className="card text-center text-ink-2">
          <p className="mb-1 text-[28px]">🧠</p>
          <p>{L('الكوتش هيبعتلك رسايل طول اليوم حسب أكلك وتمرينك ووزنك.', 'Your coach will message you through the day based on your food, training and weight.')}</p>
        </div>
      )}

      {msgs.map((m) => {
        const divider = m.date !== lastDate
        lastDate = m.date
        return (
          <div key={m.id} className="contents">
            {divider && <p className="mt-1 text-center text-[12px] text-ink-3">{new Date(m.date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
            <Bubble m={m} />
          </div>
        )
      })}

      <div ref={end} />
      <form className="glass sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 flex items-center gap-2 rounded-full py-1.5 ps-4 pe-1.5" onSubmit={(e) => { e.preventDefault(); send() }}>
        <input className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-ink-3" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={L('اسأل الكوتش… ينفع آكل كنافة؟', 'Ask the coach… can I eat kunafa?')} aria-label={L('اسأل الكوتش', 'Ask the coach')} enterKeyHint="send" />
        <button className="press grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-30" disabled={!q.trim()} aria-label={L('ابعت', 'Send')}><ArrowUp size={20} /></button>
      </form>

      {ai && <AiSheet mode={ai} onClose={() => setAi(null)} />}
    </div>
  )
}

function Bubble({ m }: { m: CoachMessage }) {
  if (m.kind === 'ask') {
    return <p className="pop-enter w-fit ms-auto max-w-[80%] rounded-[20px] rounded-ee-md bg-accent px-3.5 py-2 text-[15px] text-white">{m.text}</p>
  }
  const isReply = m.kind === 'reply' || m.kind === 'answer'
  return (
    <article className={`pop-enter surface rounded-[22px] p-3.5 ${isReply ? 'ms-6' : ''}`}>
      <p className="mb-1 text-[11px] text-ink-3">{isReply ? '↳ ' : '🧠 '}{new Date(m.ts).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</p>
      <p className="text-[15px] leading-relaxed whitespace-pre-line">{m.text}</p>
      {m.replies && (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.replies.map((r) => (
            <button key={r.id} disabled={!!m.picked} onClick={() => pickReply(m, r.id)}
              className={`press rounded-full px-3 py-1.5 text-[13px] ${m.picked === r.id ? 'bg-accent text-white' : m.picked ? 'bg-fill text-ink-3' : 'bg-fill text-accent'}`}>{r.label}</button>
          ))}
        </div>
      )}
      {!isReply && (
        <div className="mt-2 flex gap-1" role="group" aria-label={L('رد فعل', 'Reaction')}>
          {REACTIONS.map((e) => (
            <button key={e} onClick={() => react(m, e).then(() => e === '👎' && m.reaction !== '👎' && toast(L('تمام، هقلل الرسايل دي أسبوع', 'Got it — fewer of these for a week')))}
              className={`press rounded-full px-2 py-0.5 text-[15px] ${m.reaction === e ? 'bg-accent/20' : m.reaction ? 'opacity-30' : 'opacity-60'}`}
              aria-pressed={m.reaction === e} aria-label={e}>{e}</button>
          ))}
        </div>
      )}
    </article>
  )
}

function AiSheet({ mode, onClose }: { mode: 'full' | 'update'; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  useEffect(() => { aiPrompt(mode, q).then(setText) }, [mode, q])

  // share() must run straight from the tap (iOS), so the text is ready before the button is pressed
  const send = () => {
    const shared = navigator.share?.({ text }).catch(() => { /* cancelled — the text is copied anyway */ })
    navigator.clipboard?.writeText(text).catch(() => { /* clipboard blocked */ })
    if (!shared) toast(L('📋 اتنسخ — الصقه في الشات', '📋 Copied — paste it in the chat'))
    markAiShared()
    onClose()
  }

  return (
    <Sheet title={mode === 'full' ? L('شات AI جديد', 'New AI chat') : L('تحديث للـ AI', 'AI update')} onClose={onClose}>
      <p className="mb-3 text-[13px] text-ink-2">{mode === 'full'
        ? L('ابعتها في شات جديد، وبعد كده استخدم نفس الشات وابعت "تحديث" بس — عشان متكتبش بياناتك كل مرة.', 'Send this in a new chat. After that keep using the same chat and send "Update" — so you never retype your info.')
        : L('ابعتها في نفس الشات اللي بعتله قبل كده.', 'Send this in the same chat as before.')}</p>
      <textarea className="field mb-3 min-h-20 resize-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('سؤالك (اختياري): مثلاً أعمل كارديو قبل ولا بعد الحديد؟', 'Your question (optional): e.g. cardio before or after weights?')} />
      <pre className="mb-4 max-h-56 overflow-auto rounded-2xl bg-fill p-3 text-[12px] leading-snug whitespace-pre-wrap text-ink-2" dir="ltr">{text}</pre>
      <button className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 font-semibold text-white disabled:opacity-40" disabled={!text} onClick={send}>
        <Copy size={18} /> {L('انسخ وابعت', 'Copy & share')}
      </button>
    </Sheet>
  )
}
