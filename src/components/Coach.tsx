import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sparkles, RefreshCw, Copy, ArrowUp, Undo2 } from 'lucide-react'
import { db, type CoachMessage } from '../lib/db.ts'
import { pickReply, react, aiPrompt, markAiShared, ask } from '../lib/coach.ts'
import { L, locale } from '../lib/i18n.ts'
import { Sheet, Seg, toast } from './ui.tsx'

const REACTIONS = ['👍', '❤️', '😅', '💪', '👎']
// the back-and-forth with the coach; everything else is the coach's own messages
const CHAT_KINDS = ['ask', 'ai', 'private', 'answer']

/** Send one message: to the AI when it's on (gated for privacy on the phone), otherwise to the built-in answerer. */
function useSend(aiOn: boolean, aiV2?: boolean) {
  const [busy, setBusy] = useState(false)
  const send = async (q: string) => {
    if (!q.trim() || busy) return
    if (!aiOn) return ask(q)
    setBusy(true)
    try { await (await import('../lib/ai.ts')).chat(q, { aiV2 }) } finally { setBusy(false) }
  }
  return { busy, send }
}

/** Chat (default): just the conversation, as bubbles. Full history: the coach's own messages too, with reactions and quick replies. */
export function Coach({ visible, aiOn, aiV2 }: { visible: boolean; aiOn: boolean; aiV2?: boolean }) {
  const all = useLiveQuery(() => db.messages.orderBy('id').reverse().limit(80).toArray().then((a) => a.reverse())) ?? []
  const [view, setView] = useState<'chat' | 'all'>('chat')
  const msgs = view === 'chat' ? all.filter((m) => CHAT_KINDS.includes(m.kind)) : all
  const unread = all.filter((m) => !m.read).length
  const [promptQ, setPromptQ] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const { busy, send } = useSend(aiOn, aiV2)
  useEffect(() => { if (visible) end.current?.scrollIntoView({ block: 'end' }) }, [visible, msgs.length, busy, view])
  const lastShare = useLiveQuery(() => db.kv.get('lastAiShare'))?.value as number | undefined
  const [ai, setAi] = useState<'full' | 'update' | null>(null)

  // seeing the full history marks the coach's messages read (clears the dot); chat messages are born read
  useEffect(() => {
    if (visible && view === 'all') db.messages.filter((m) => !m.read).modify({ read: true })
  }, [visible, view, all.length])

  const staleDays = lastShare ? Math.floor((Date.now() - lastShare) / 86400_000) : null
  let lastDate = ''

  return (
    <div className="flex flex-col gap-3">
      <Seg value={view} onChange={setView} options={[['chat', L('💬 شات', '💬 Chat')], ['all', L('🗂️ كل الرسايل', '🗂️ Full history') + (unread ? ` · ${unread}` : '')]]} />
      {view === 'all' && <section className="card !p-3">
        <p className="mb-2 text-[13px] text-ink-2">{L('عايز رأي ذكاء اصطناعي؟ خد بياناتك في رسالة جاهزة لـ ChatGPT أو Gemini أو Claude:', 'Want an AI’s take? Get your data as a ready message for ChatGPT, Gemini or Claude:')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button className="press flex items-center justify-center gap-1.5 rounded-2xl bg-accent py-2.5 text-[14px] font-semibold text-white" onClick={() => setAi('full')}><Sparkles size={16} /> {L('شات جديد', 'New AI chat')}</button>
          <button className="press flex items-center justify-center gap-1.5 rounded-2xl bg-fill py-2.5 text-[14px] font-semibold disabled:opacity-40" disabled={!lastShare} onClick={() => setAi('update')}><RefreshCw size={16} /> {L('تحديث', 'Update')}</button>
        </div>
        {staleDays !== null && staleDays >= 5 && <p className="mt-2 text-center text-[12px] text-amber">{L(`مبعتش تحديث للـ AI من ${staleDays} يوم`, `You haven't updated your AI in ${staleDays} days`)}</p>}
      </section>}

      {!msgs.length && view === 'chat' && (
        <div className="card text-center text-ink-2">
          <p className="mb-1 text-[28px]">💬</p>
          <p>{aiOn ? L('قول أي حاجة: أكلك، ميتك، وزنك، تمرينك، أو اسأل.', 'Say anything: food, water, weight, workout — or ask.') : L('اسأل عن أكلك أو أرقامك.', 'Ask about your food or numbers.')}</p>
        </div>
      )}
      {!msgs.length && view === 'all' && (
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
            <Bubble m={m} chat={view === 'chat'} onPrompt={(text) => { setPromptQ(text); setAi('full') }} />
          </div>
        )
      })}

      {busy && <Typing />}
      <div ref={end} />
      <Composer aiOn={aiOn} busy={busy} onSend={send} />

      {ai && <AiSheet mode={ai} initialQ={promptQ} onClose={() => { setAi(null); setPromptQ('') }} />}
    </div>
  )
}

/** Own state, so typing re-renders only the input box, not the whole thread. */
function Composer({ aiOn, busy, onSend }: { aiOn: boolean; busy: boolean; onSend: (q: string) => void }) {
  const [q, setQ] = useState('')
  return (
    <form className="glass sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 flex items-center gap-2 rounded-full py-1.5 ps-4 pe-1.5" onSubmit={(e) => { e.preventDefault(); onSend(q); setQ('') }}>
      <input className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-ink-3" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={aiOn ? L('قول أي حاجة… "فطرت 2 بيض ورغيف"', 'Say anything… "had 2 eggs and a pita"') : L('اسأل الكوتش… ينفع آكل كنافة؟', 'Ask the coach… can I eat kunafa?')} aria-label={L('اسأل الكوتش', 'Ask the coach')} enterKeyHint="send" />
      <button className="press grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-30" disabled={!q.trim() || busy} aria-label={L('ابعت', 'Send')}><ArrowUp size={20} /></button>
    </form>
  )
}

const Typing = () => (
  <div className="surface pop-enter flex w-16 gap-1 rounded-[20px] px-4 py-3" aria-label={L('الكوتش بيكتب', 'Coach is typing')}>
    {[0, 1, 2].map((i) => <span key={i} className="size-2 animate-pulse rounded-full bg-ink-3" style={{ animationDelay: `${i * 160}ms` }} />)}
  </div>
)

const PRIVATE_TEXT: Record<string, [string, string]> = {
  private: ['🔒 ده موضوع شخصي، فمش هبعته للـ AI. أعملك برومبت تسأل بيه الـ AI بتاعك (Gemini أو ChatGPT) بخصوصية؟', "🔒 That's personal, so I won't send it to the AI. Want a ready prompt to ask your own AI (Gemini or ChatGPT) privately?"],
  eating: ['💛 شكراً إنك قلت. الترجيع أو الحرمان بيأذوا جسمك ونفسيتك أكتر من أي زيادة وزن، وده مش ضعف منك. كلم دكتور أو أخصائي تغذية تثق فيه — دي أقوى خطوة. ولو حابب، أعملك برومبت تسأل بيه الـ AI بتاعك بخصوصية.', "💛 Thank you for saying it. Purging or starving hurts your body and mind more than any weight gain, and it isn't weakness. Talk to a doctor or dietitian you trust — that's the strongest step. If you like, I can build a prompt for your own AI, privately."],
  crisis: ['💛 أنا آسف إنك حاسس كده — انت مش لوحدك. كلم حد قريب منك دلوقتي. لو في خطر اتصل بالطوارئ: 997 في السعودية، 123 في مصر. وفي السعودية تقدر تكلم 937 (وزارة الصحة) 24 ساعة.', "💛 I'm sorry you feel this way — you're not alone. Reach out to someone close to you now. If you're in danger call emergency services: 997 in Saudi Arabia, 123 in Egypt. In Saudi Arabia you can also call 937 (Ministry of Health), 24/7."],
}

function Bubble({ m, chat, onPrompt }: { m: CoachMessage; chat?: boolean; onPrompt?: (q: string) => void }) {
  const shape = chat ? 'w-fit max-w-[88%] rounded-[20px] rounded-es-md' : 'rounded-[22px]'
  if (m.kind === 'private') {
    const [ar, en] = PRIVATE_TEXT[m.text] ?? PRIVATE_TEXT.private
    return (
      <article className={`surface pop-enter p-3.5 ${shape}`}>
        <p className="text-[15px] leading-relaxed">{L(ar, en)}</p>
        {m.text !== 'crisis' && m.privateQ && (
          <button className="press mt-3 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white" onClick={() => onPrompt?.(m.privateQ!)}>🔒 {L('اعمل البرومبت', 'Build the prompt')}</button>
        )}
      </article>
    )
  }
  if (m.kind === 'ai') {
    return (
      <article className={`surface pop-enter p-3.5 ${shape}`}>
        <p className="mb-1 text-[11px] text-ink-3">✨ {new Date(m.ts).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}{m.remaining !== undefined && m.remaining < 30 ? ` · ${L(`فاضل ${m.remaining} رسالة النهارده`, `${m.remaining} messages left today`)}` : ''}</p>
        <p className="text-[15px] leading-relaxed whitespace-pre-line">{m.text}</p>
        {m.receipt && (
          <ul className={`mt-2 rounded-2xl bg-fill px-3 py-2 text-[13px] ${m.undone ? 'text-ink-3 line-through' : 'text-ink-2'}`}>
            {m.receipt.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
        {m.undo && !m.undone && (
          <button className="press mt-2 flex items-center gap-1 text-[13px] text-accent" onClick={async () => { await (await import('../lib/ai.ts')).undoTurn(m); toast(L('↩️ اتلغى', '↩️ Undone')) }}>
            <Undo2 size={15} /> {L('تراجع', 'Undo')}
          </button>
        )}
      </article>
    )
  }
  if (m.kind === 'ask') {
    return <p className="pop-enter w-fit ms-auto max-w-[80%] rounded-[20px] rounded-ee-md bg-accent px-3.5 py-2 text-[15px] text-white">{m.text}</p>
  }
  const isReply = m.kind === 'reply' || m.kind === 'answer'
  return (
    <article className={`pop-enter surface p-3.5 ${shape} ${isReply && !chat ? 'ms-6' : ''}`}>
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

function AiSheet({ mode, initialQ = '', onClose }: { mode: 'full' | 'update'; initialQ?: string; onClose: () => void }) {
  const [q, setQ] = useState(initialQ)
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

/** ✨ from any tab: the last few exchanges and a box to tell the coach anything. */
export function AssistantSheet({ aiOn, aiV2, onClose, onOpenCoach }: { aiOn: boolean; aiV2?: boolean; onClose: () => void; onOpenCoach: () => void }) {
  const msgs = useLiveQuery(() => db.messages.orderBy('id').reverse().limit(6).toArray().then((a) => a.reverse().filter((m) => ['ask', 'ai', 'private', 'answer'].includes(m.kind)))) ?? []
  const [q, setQ] = useState('')
  const { busy, send } = useSend(aiOn, aiV2)
  return (
    <Sheet title={L('✨ الكوتش', '✨ Coach')} onClose={onClose}>
      <div className="flex flex-col gap-2.5 pb-3">
        {!msgs.length && <p className="py-4 text-center text-[14px] text-ink-2">{aiOn ? L('قول أي حاجة: أكلك، ميتك، وزنك، تمرينك، أو اسأل.', 'Say anything: food, water, weight, workout — or ask.') : L('اسأل عن أكلك أو أرقامك.', 'Ask about your food or numbers.')}</p>}
        {msgs.map((m) => <Bubble key={m.id} m={m} chat onPrompt={() => { onClose(); onOpenCoach() }} />)}
        {busy && <Typing />}
      </div>
      <form className="flex items-center gap-2 rounded-full bg-fill py-1.5 ps-4 pe-1.5" onSubmit={(e) => { e.preventDefault(); send(q); setQ('') }}>
        <input className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-ink-3" value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          placeholder={aiOn ? L('"فطرت 2 بيض ورغيف"…', '"had 2 eggs and a pita"…') : L('ينفع آكل كنافة؟', 'Can I eat kunafa?')} aria-label={L('اكتب للكوتش', 'Message the coach')} enterKeyHint="send" />
        <button className="press grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-30" disabled={!q.trim() || busy} aria-label={L('ابعت', 'Send')}><ArrowUp size={20} /></button>
      </form>
    </Sheet>
  )
}
