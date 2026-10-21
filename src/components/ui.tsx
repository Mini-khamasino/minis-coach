import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { L } from '../lib/i18n.ts'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { ZONE_COLOR, type Zone } from '../lib/calc.ts'

export const tick = () => navigator.vibrate?.(8)

export const toast = (msg: string) => window.dispatchEvent(new CustomEvent('toast', { detail: msg }))

export function Toaster() {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null)
  useEffect(() => {
    let t: number
    const on = (e: Event) => {
      setMsg({ text: (e as CustomEvent<string>).detail, key: Date.now() })
      clearTimeout(t)
      t = window.setTimeout(() => setMsg(null), 3200)
    }
    window.addEventListener('toast', on)
    return () => window.removeEventListener('toast', on)
  }, [])
  if (!msg) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-50 flex justify-center px-4">
      <div key={msg.key} role="status" className="glass pop-enter rounded-full px-4 py-2 text-[15px] font-medium shadow-2xl">
        {msg.text}
      </div>
    </div>
  )
}

/** Bottom sheet: drag the top strip 1:1, flick down to close (momentum-projected), exits the way it came in. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y0: number; dy: number; hist: { y: number; t: number }[] } | null>(null)

  const dismiss = useCallback(() => {
    const el = panel.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return onClose()
    el.style.transition = 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)'
    el.style.transform = 'translateY(100%)'
    setTimeout(onClose, 260)
  }, [onClose])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && dismiss()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [dismiss])

  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    panel.current!.style.transition = 'none'
    drag.current = { y0: e.clientY, dy: 0, hist: [{ y: e.clientY, t: e.timeStamp }] }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    d.dy = e.clientY - d.y0
    d.hist = [...d.hist.filter((h) => e.timeStamp - h.t < 100), { y: e.clientY, t: e.timeStamp }]
    // dragging up past the top resists instead of stopping dead
    panel.current!.style.transform = `translateY(${d.dy < 0 ? d.dy * 0.2 : d.dy}px)`
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const first = d.hist[0], last = d.hist.at(-1)!
    const v = last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0 // px/s
    const projected = d.dy + ((v / 1000) * 0.998) / (1 - 0.998) // Apple's momentum projection
    if (projected > panel.current!.offsetHeight * 0.4) return dismiss()
    panel.current!.style.transition = 'transform 380ms var(--ease-spring)'
    panel.current!.style.transform = ''
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fade-enter absolute inset-0 bg-black/45" onClick={dismiss} />
      <div ref={panel} className="surface sheet-enter relative !border-b-0 max-h-[90dvh] w-full max-w-[520px] overflow-y-auto overscroll-contain rounded-t-[30px] px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-10 -mx-5 touch-none px-5 pt-2 pb-3" style={{ background: 'linear-gradient(var(--color-surface) 70%, transparent)' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink-3" />
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] font-semibold tracking-tight">{title}</h2>
            <button className="press rounded-full bg-fill px-3 py-1 text-[15px] font-medium text-accent" onPointerDown={(e) => e.stopPropagation()} onClick={dismiss}>{L('تم', 'Done')}</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Activity-style ring. Overflow past 100% draws a second lap. */
export function Ring({ value, max, zone, size = 168, stroke = 18, children }: { value: number; max: number; zone: Zone; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = Math.max(0, value / max)
  const color = ZONE_COLOR[zone]
  const arc = (f: number, o = 1) => (
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={o} strokeWidth={stroke} strokeLinecap="round"
      strokeDasharray={`${Math.min(f, 1) * c} ${c}`} style={{ transition: 'stroke-dasharray 700ms var(--ease-spring), stroke 300ms' }} />
  )
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={stroke} />
        {arc(frac)}
        {frac > 1 && arc(frac - 1, 0.55)}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

export function Bar({ label, value, max, color, unit = L('ج', 'g') }: { label: string; value: number; max: number; color: string; unit?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className="num text-[15px]">{Math.round(value)}<span className="text-ink-3"> / {max}{unit}</span></span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-fill">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color, transition: 'width 600ms var(--ease-spring)' }} />
      </div>
    </div>
  )
}

/** Shows when a new version is deployed; the button swaps the service worker and reloads. */
export function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_, r) {
      // installed PWAs resume without reloading, so check on every return to the app
      if (r) document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && r.update())
    },
  })
  if (!needRefresh) return null
  return (
    <div className="fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <div role="alert" className="glass pop-enter flex items-center gap-3 rounded-full py-1.5 ps-4 pe-1.5 shadow-2xl">
        <span className="text-[15px]">{L('✨ فيه تحديث جديد', '✨ Update available')}</span>
        <button className="press rounded-full bg-accent px-4 py-1.5 text-[14px] font-semibold text-white" onClick={() => updateServiceWorker(true)}>{L('حدّث', 'Update')}</button>
      </div>
    </div>
  )
}

/** Segmented control (iOS-style). */
export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex w-full gap-1 rounded-xl bg-fill p-1" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`press flex-1 rounded-lg py-2 text-[14px] ${value === v ? 'raised font-semibold' : 'text-ink-2'}`}>{label}</button>
      ))}
    </div>
  )
}
