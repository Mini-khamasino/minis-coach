import { useEffect, useState } from 'react'
import { LayoutGrid, MessageCircle, Settings as Gear } from 'lucide-react'
import { useSettings } from './lib/db.ts'
import { Dashboard } from './components/Dashboard.tsx'
import { Coach } from './components/Coach.tsx'
import { SettingsSheet } from './components/SettingsSheet.tsx'
import { Toaster, UpdatePrompt } from './components/ui.tsx'

type Tab = 'home' | 'coach'

export default function App() {
  const s = useSettings()
  const [tab, setTab] = useState<Tab>('home')
  const [settings, setSettings] = useState(false)
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'dark')

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      const t = s.theme === 'system' ? (mq.matches ? 'light' : 'dark') : s.theme
      document.documentElement.dataset.theme = t
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#ECECF0' : '#09090B')
      try { localStorage.setItem('theme', s.theme) } catch { /* private mode */ }
      setTheme(t)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [s.theme])

  return (
    <div className="mx-auto max-w-[520px] px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))]">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-[28px] font-bold tracking-tight">{tab === 'home' ? "Mini's Coach" : 'الكوتش'}</h1>
        <button className="press glass grid size-10 place-items-center rounded-full" onClick={() => setSettings(true)} aria-label="الإعدادات"><Gear size={20} /></button>
      </header>

      <main key={tab} className="fade-enter">
        {tab === 'home' ? <Dashboard s={s} theme={theme} onSettings={() => setSettings(true)} /> : <Coach hasKey={!!s.apiKey} onSettings={() => setSettings(true)} />}
      </main>

      <nav className="glass fixed inset-x-0 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 mx-auto flex w-[min(320px,calc(100%-32px))] rounded-full p-1.5" aria-label="التبويبات">
        {([['home', 'اللوحة', LayoutGrid], ['coach', 'الكوتش', MessageCircle]] as const).map(([id, label, Icon]) => (
          <button key={id} className={`press flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-[15px] font-medium transition-colors ${tab === id ? 'bg-fill text-ink' : 'text-ink-2'}`}
            onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
            <Icon size={19} /> {label}
          </button>
        ))}
      </nav>

      {settings && <SettingsSheet s={s} onClose={() => setSettings(false)} />}
      <Toaster />
      <UpdatePrompt />
    </div>
  )
}
