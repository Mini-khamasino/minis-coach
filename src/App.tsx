import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { House, UtensilsCrossed, Dumbbell, MessageCircle } from 'lucide-react'
import { db, getSettings, DEFAULTS } from './lib/db.ts'
import { useSync } from './lib/sync.ts'
import { L } from './lib/i18n.ts'
import { Today } from './components/Today.tsx'
import { Food } from './components/Food.tsx'
import { Exercise } from './components/Exercise.tsx'
import { Coach } from './components/Coach.tsx'
import { Onboarding } from './components/Onboarding.tsx'
import { SettingsSheet } from './components/SettingsSheet.tsx'
import { Toaster, UpdatePrompt } from './components/ui.tsx'

const TABS = [
  { id: 'today', label: L('النهارده', 'Today'), Icon: House },
  { id: 'food', label: L('الأكل', 'Food'), Icon: UtensilsCrossed },
  { id: 'exercise', label: L('التمرين', 'Train'), Icon: Dumbbell },
  { id: 'coach', label: L('الكوتش', 'Coach'), Icon: MessageCircle },
] as const
type Tab = (typeof TABS)[number]['id']

export default function App() {
  const boot = useLiveQuery(async () => ({ s: await getSettings(), logged: await db.items.count() }))
  const s = boot?.s ?? DEFAULTS
  const sync = useSync()
  const [tab, setTab] = useState<Tab>('today')
  const [settings, setSettings] = useState(false)
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'dark')
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      const t = s.theme === 'system' ? (mq.matches ? 'light' : 'dark') : s.theme
      document.documentElement.dataset.theme = t
      document.documentElement.dataset.accent = s.accent
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#ECECF0' : '#09090B')
      try { localStorage.setItem('theme', s.theme); localStorage.setItem('accent', s.accent) } catch { /* private mode */ }
      setTheme(t)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [s.theme, s.accent])

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

  const go = (t: Tab) => { setTab(t); scrollTo({ top: 0 }) }

  if (!boot) return null
  // A backup restore or cloud download counts as onboarded; so does an older install that already has food logged.
  if (!s.onboarded && !boot.logged) return <><Onboarding /><Toaster /></>

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

      {location.hostname === 'mini-khamasino.github.io' && (
        <div className="card mb-4">
          <p className="mb-2 font-semibold">📦 التطبيق اتنقل لعنوان جديد</p>
          <ol className="mb-3 list-decimal ps-5 text-[14px] text-ink-2">
            <li>افتح الإعدادات واعمل <b>باك أب</b> هنا الأول</li>
            <li>افتح العنوان الجديد وسطّبه على الشاشة الرئيسية</li>
            <li>هناك: دوس "عندي ملف باك أب" واختار الملف، وبعدين سجل دخول بجوجل</li>
          </ol>
          <a className="press block rounded-2xl bg-accent py-2.5 text-center font-semibold text-white" href="https://minis-coach.web.app">افتح minis-coach.web.app</a>
        </div>
      )}

      <main>
        <div hidden={tab !== 'today'} className="fade-enter"><Today s={s} theme={theme} signedIn={!!sync.user} onSettings={() => setSettings(true)} onFood={() => go('food')} /></div>
        <div hidden={tab !== 'food'} className="fade-enter"><Food s={s} /></div>
        <div hidden={tab !== 'exercise'} className="fade-enter"><Exercise /></div>
        <div hidden={tab !== 'coach'} className="fade-enter"><Coach /></div>
      </main>

      <nav className="glass fixed inset-x-0 bottom-[max(14px,env(safe-area-inset-bottom))] z-30 mx-auto flex rounded-full p-1.5"
        style={{ width: compact ? 'min(232px, calc(100% - 32px))' : 'min(400px, calc(100% - 24px))', transition: 'width 420ms var(--ease-spring)' }}
        aria-label={L('التبويبات', 'Tabs')}>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={`press flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-2 ${tab === id ? 'bg-fill text-accent' : 'text-ink-2'}`}
            onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined} aria-label={label}>
            <Icon size={21} strokeWidth={tab === id ? 2.4 : 2} />
            <span className="overflow-hidden text-[11px] font-medium" style={{ maxHeight: compact ? 0 : 16, opacity: compact ? 0 : 1, transition: 'max-height 300ms var(--ease-spring), opacity 200ms' }}>{label}</span>
          </button>
        ))}
      </nav>

      {settings && <SettingsSheet s={s} sync={sync} onClose={() => setSettings(false)} />}
      <Toaster />
      <UpdatePrompt />
    </div>
  )
}
