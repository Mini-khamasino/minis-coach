import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowUp } from 'lucide-react'
import { db } from '../lib/db.ts'
import { sendToCoach } from '../lib/coach.ts'
import { toast } from './ui.tsx'

export function Coach({ hasKey, onSettings }: { hasKey: boolean; onSettings: () => void }) {
  const msgs = useLiveQuery(() => db.chat.orderBy('id').reverse().limit(120).toArray().then((a) => a.reverse())) ?? []
  const [text, setText] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length, pending])

  const send = async () => {
    const v = text.trim()
    if (!v || pending) return
    setPending(v)
    setText('')
    try {
      const r = await sendToCoach(v)
      if (r.toast) toast(r.toast)
    } catch (e) {
      setText(v)
      toast(`⚠️ ${(e as Error).message}`)
    } finally {
      setPending(null)
    }
  }

  let lastDate = ''
  return (
    <div className="flex min-h-[calc(100dvh-180px)] flex-col">
      <div className="flex flex-1 flex-col gap-1.5 pb-3">
        {!msgs.length && !pending && (
          <div className="card mt-6 text-center text-ink-2">
            <p className="mb-1 text-[17px] text-ink">أهلاً يا ميني 👋</p>
            <p className="text-[14px]">قولي كلت إيه، أو اسألني "ينفع آكل كذا؟" — أنا فاكر أيامك وأوزانك.</p>
            {!hasKey && <button className="press mt-3 text-blue" onClick={onSettings}>حط مفتاح Gemini الأول ←</button>}
          </div>
        )}
        {msgs.map((m) => {
          const divider = m.date !== lastDate
          lastDate = m.date
          return (
            <div key={m.id} className="contents">
              {divider && <p className="my-2 text-center text-[12px] text-ink-3">{new Date(m.date).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
              <Bubble role={m.role} text={m.text} logged={m.logged} />
            </div>
          )
        })}
        {pending && (
          <>
            <Bubble role="user" text={pending} />
            <div className="glass pop-enter flex w-16 gap-1 self-end rounded-[20px] rounded-bl-md px-4 py-3" aria-label="الكوتش بيكتب">
              {[0, 1, 2].map((i) => <span key={i} className="size-2 animate-pulse rounded-full bg-ink-2" style={{ animationDelay: `${i * 160}ms` }} />)}
            </div>
          </>
        )}
        <div ref={end} />
      </div>

      <form className="glass sticky bottom-[calc(76px+env(safe-area-inset-bottom))] flex items-end gap-2 rounded-[24px] py-1.5 ps-4 pe-1.5" onSubmit={(e) => { e.preventDefault(); send() }}>
        <textarea rows={1} className="max-h-32 min-w-0 flex-1 resize-none bg-transparent py-1.5 outline-none placeholder:text-ink-3 [field-sizing:content]" placeholder="اكتب للكوتش…"
          value={text} onChange={(e) => setText(e.target.value)} aria-label="رسالة للكوتش"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); send() } }} />
        <button className="press grid size-9 shrink-0 place-items-center rounded-full bg-blue text-white disabled:opacity-30" disabled={!text.trim() || !!pending} aria-label="ابعت"><ArrowUp size={20} /></button>
      </form>
    </div>
  )
}

function Bubble({ role, text, logged }: { role: 'user' | 'coach'; text: string; logged?: string }) {
  const me = role === 'user'
  return (
    <div className={`pop-enter flex max-w-[82%] flex-col ${me ? 'self-start items-start' : 'self-end items-end'}`}>
      <div className={`whitespace-pre-wrap rounded-[20px] px-3.5 py-2 text-[16px] ${me ? 'rounded-br-md bg-blue text-white' : 'glass rounded-bl-md'}`}>{text}</div>
      {logged && <span className="mt-1 rounded-full bg-green/15 px-2.5 py-0.5 text-[12px] text-green">{logged}</span>}
    </div>
  )
}
