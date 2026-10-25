import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { House, UtensilsCrossed, Dumbbell, MessageCircle, Sparkles } from 'lucide-react'
import { db, getSettings, DEFAULTS, DEMO } from './lib/db.ts'
import { useSync, takeJustSignedIn, useFeatures } from './lib/syncCore.ts'
import { L } from './lib/i18n.ts'
import { Today } from './components/Today.tsx'
// tabs other than Today load on first visit, so the app opens fast
const Food = memo(lazy(() => import('./components/Food.tsx').then((m) => ({ default: m.Food }))))
const Exercise = memo(lazy(() => import('./components/Exercise.tsx').then((m) => ({ default: m.Exercise }))))
const Coach = memo(lazy(() => import('./components/Coach.tsx').then((m) => ({ default: m.Coach }))))
const TodayTab = memo(Today)
const AssistantSheet = lazy(() => import('./components/Coach.tsx').then((m) => ({ default: m.AssistantSheet })))
import { Onboarding } from './components/Onboarding.tsx'
import { ProfileSheet } from './components/ProfileSheet.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { Toaster, UpdatePrompt, toast } from './components/ui.tsx'

const TABS = [
  { id: 'today', label: L('النهارده', 'Today'), Icon: House },
  { id: 'food', label: L('الأكل', 'Food'), Icon: UtensilsCrossed },
  { id: 'exercise', label: L('التمرين', 'Train'), Icon: Dumbbell },
  { id: 'coach', label: L('الكوتش', 'Coach'), Icon: MessageCircle },
] as const
type Tab = (typeof TABS)[number]['id']

export default function App() {
  const boot = useLiveQuery(async () => ({ s: await getSettings(), logged: await db.items.count() }))
  // the live query re-emits on any data change; keep the same settings object unless a setting really changed
  const sKey = boot ? JSON.stringify(boot.s) : ''
  const s = useMemo(() => boot?.s ?? DEFAULTS, [sKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const sync = useSync()
  const features = useFeatures(sync.user)
  const aiOn = features.ai && s.aiEnabled && !!sync.user
  const [tab, setTab] = useState<Tab>('today')
  const [seen, setSeen] = useState<Set<Tab>>(() => new Set(['today']))
  const [settings, setSettings] = useState(false)
  const [assistant, setAssistant] = useState(false)
  const [compact, setCompact] = useState(false)
  const [systemLight, setSystemLight] = useState(() => matchMedia('(prefers-color-scheme: light)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)')
    const on = () => setSystemLight(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const theme = s.theme === 'system' ? (systemLight ? 'light' : 'dark') : s.theme
  // applied during render, before the tabs render, so anything reading the theme colors sees the new ones in the same pass
  // (only once settings have loaded — until then index.html's saved theme/accent stay, so there's no flash of defaults)
  if (boot) {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.accent = s.accent
    root.toggleAttribute('data-solid', !s.transparency)
  }
  useEffect(() => {
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'light' ? '#EBEBF0' : '#000000')
    try { localStorage.setItem('theme', s.theme); localStorage.setItem('accent', s.accent) } catch { /* private mode */ }
  }, [theme, s.theme, s.accent])

  // Tab bar shrinks to icons while scrolling down, comes back on the way up (iOS 26 style).
  useEffect(() => {
    let lastY = scrollY
    const on = () => {
      const dy = scrollY - lastY
      if (Math.abs(dy) > 8) setCompact(dy > 0 && scrollY > 60)
      lastY = scrollY
    }
    addEventListener('scroll', on, { passive: true })
    return () => removeEventListener('scroll', on)
  }, [])

  // the coach checks for due messages on open, on return to the app, and every 10 minutes
  const unread = useLiveQuery(() => db.messages.filter((m) => !m.read).count()) ?? 0
  useEffect(() => {
    const run = () => document.visibilityState === 'visible' && import('./lib/coach.ts').then((m) => m.runCoach()).catch((e) => console.warn('coach', e))
    run()
    const t = setInterval(run, 10 * 60_000)
    document.addEventListener('visibilitychange', run)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', run) }
  }, [boot?.s.onboarded])

  // say so when a sign-in completes (it can finish in a popup the person doesn't see close)
  const signedIn = sync.user?.uid
  useEffect(() => {
    if (signedIn && sync.status === 'synced' && takeJustSignedIn()) toast(L(`✅ دخلت باسم ${sync.user?.displayName ?? ''} — بياناتك متزامنة`, `✅ Signed in as ${sync.user?.displayName ?? ''} — data synced`))
  }, [signedIn, sync.status])

  const go = useCallback((t: Tab) => { setTab(t); setSeen((x) => new Set(x).add(t)); scrollTo({ top: 0 }) }, [])
  const openSettings = useCallback(() => setSettings(true), [])
  const openFood = useCallback(() => go('food'), [go])

  if (!boot) return null
  // A backup restore or cloud download counts as onboarded; so does an older install that already has food logged.
  if (!s.onboarded && !boot.logged) return <><Onboarding sync={sync} /><Toaster /></>

  const title = tab === 'today' ? (s.name ? L(`أهلاً ${s.name}`, `Hi ${s.name}`) : "Mini's Coach") : TABS.find((x) => x.id === tab)!.label
  const avatar = sync.user?.photoURL

  return (
    <div className="mx-auto max-w-[520px] px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[calc(110px+env(safe-area-inset-bottom))]">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-[30px] leading-[1.1] font-bold tracking-tight">{title}</h1>
        <button className="press glass grid size-10 place-items-center overflow-hidden rounded-full p-0 font-semibold" onClick={() => setSettings(true)} aria-label={L('الإعدادات', 'Settings')}>
          {avatar ? <img src={avatar} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : (s.name || 'M').slice(0, 1).toUpperCase()}
        </button>
      </header>

      {DEMO && (
        <button className="press mb-3 w-full rounded-2xl bg-amber/15 py-2 text-[13px] font-medium text-amber" onClick={() => setSettings(true)}>
          🧪 {L('وضع التجربة — بيانات تجريبية، بياناتك الحقيقية في أمان', 'Test mode — sample data, your real data is safe')}
        </button>
      )}

      <main>
        <div hidden={tab !== 'today'} className="fade-enter"><ErrorBoundary tab="today"><TodayTab s={s} theme={theme} signedIn={!!sync.user} onSettings={openSettings} onFood={openFood} /></ErrorBoundary></div>
        <Suspense fallback={<div className="card h-40 animate-pulse" />}>
          {seen.has('food') && <div hidden={tab !== 'food'} className="fade-enter"><ErrorBoundary tab="food"><Food s={s} /></ErrorBoundary></div>}
          {seen.has('exercise') && <div hidden={tab !== 'exercise'} className="fade-enter"><ErrorBoundary tab="exercise"><Exercise s={s} /></ErrorBoundary></div>}
          {seen.has('coach') && <div hidden={tab !== 'coach'} className="fade-enter"><ErrorBoundary tab="coach"><Coach visible={tab === 'coach'} aiOn={aiOn} /></ErrorBoundary></div>}
        </Suspense>
      </main>

      <nav className="glass fixed inset-x-0 bottom-[max(14px,env(safe-area-inset-bottom))] z-30 mx-auto flex rounded-full p-1.5"
        style={{ width: compact ? 'min(232px, calc(100% - 32px))' : 'min(400px, calc(100% - 24px))', transition: 'width 420ms var(--ease-spring)' }}
        aria-label={L('التبويبات', 'Tabs')}>
        {/* the selection is one pill that glides between tabs on a spring */}
        <span aria-hidden className="absolute top-1.5 bottom-1.5 rounded-full bg-fill"
          style={{ width: 'calc((100% - 12px) / 4)', insetInlineStart: `calc(6px + ${TABS.findIndex((x) => x.id === tab)} * (100% - 12px) / 4)`, transition: 'inset-inline-start 460ms var(--ease-spring)' }} />
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={`press relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-2 ${tab === id ? 'text-accent' : 'text-ink-2'}`}
            onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined} aria-label={label}>
            <span className="relative">
              <Icon size={21} strokeWidth={tab === id ? 2.4 : 2} />
              {id === 'coach' && unread > 0 && tab !== 'coach' && <span className="absolute -top-0.5 -end-1 size-2.5 rounded-full bg-red ring-2 ring-[var(--glass-solid)]" aria-label={L(`${unread} رسالة جديدة`, `${unread} new`)} />}
            </span>
            <span className="overflow-hidden text-[11px] font-medium" style={{ maxHeight: compact ? 0 : 16, opacity: compact ? 0 : 1, transition: 'max-height 300ms var(--ease-spring), opacity 200ms' }}>{label}</span>
          </button>
        ))}
      </nav>

      {tab !== 'coach' && (
        <button className="press glass fixed end-4 bottom-[calc(92px+env(safe-area-inset-bottom))] z-30 grid size-13 place-items-center rounded-full text-accent"
          onClick={() => setAssistant(true)} aria-label={L('كلم الكوتش', 'Talk to the coach')}>
          <Sparkles size={24} />
        </button>
      )}
      {assistant && <Suspense fallback={null}><AssistantSheet aiOn={aiOn} onClose={() => setAssistant(false)} onOpenCoach={() => go('coach')} /></Suspense>}
      {settings && <ProfileSheet s={s} sync={sync} features={features} onClose={() => setSettings(false)} />}
      <Toaster />
      <UpdatePrompt />
    </div>
  )
}
