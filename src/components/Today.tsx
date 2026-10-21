import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Plus, Undo2, CloudUpload, Share, SquarePlus, Download } from 'lucide-react'
import { db, today, type Settings } from '../lib/db.ts'
import { sum, zone, ZONE_COLOR } from '../lib/calc.ts'
import { daysSinceBackup } from '../lib/backup.ts'
import { L } from '../lib/i18n.ts'
import { Ring, Bar, Sheet, tick, toast } from './ui.tsx'
import { useInstall, promptInstall } from '../lib/install.ts'
import { WeightCard } from './WeightCard.tsx'

const BOTTLE = 750

export function macroTargets(s: Settings) {
  const fat = Math.round((s.goal * 0.27) / 9)
  return { fat, carbs: Math.max(0, Math.round((s.goal - s.protein * 4 - fat * 9) / 4)) }
}

export function Today({ s, theme, signedIn, onSettings, onFood }: { s: Settings; theme: string; signedIn: boolean; onSettings: () => void; onFood: () => void }) {
  const date = today()
  const items = useLiveQuery(() => db.items.where('date').equals(date).toArray(), [date]) ?? []
  const water = useLiveQuery(() => db.water.where('date').equals(date).sortBy('ts'), [date]) ?? []

  const t = sum(items)
  const z = zone(t.kcal, s.greenMax, s.amberMax)
  const { fat, carbs } = macroTargets(s)
  const ml = water.reduce((a, w) => a + w.ml, 0)
  const left = s.goal - t.kcal
  const backupAge = daysSinceBackup(s.lastBackup)
  const addWater = (amount: number) => { tick(); db.water.add({ date, ml: amount, ts: Date.now() }) }

  return (
    <div className="flex flex-col gap-3">
      <InstallCard />
      {!signedIn && (backupAge === null || backupAge >= 7) && (
        <button className="press card flex items-center gap-3 !py-3 text-start" onClick={onSettings}>
          <CloudUpload className="shrink-0 text-amber" size={22} />
          <span className="text-[14px]">{L('بياناتك على الموبايل بس — سجل دخول عشان تتحفظ', 'Your data is only on this phone — sign in to back it up')} <span className="text-accent">{L('←', '→')}</span></span>
        </button>
      )}

      <button className="press card flex items-center gap-5 text-start" onClick={onFood} aria-label={L('افتح الأكل', 'Open food')}>
        <Ring value={t.kcal} max={s.goal} zone={z}>
          <span className="num text-[40px]" style={{ color: ZONE_COLOR[z] }}>{t.kcal}</span>
          <span className="text-[13px] text-ink-2">{L('من', 'of')} {s.goal}</span>
        </Ring>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="text-[14px] text-ink-2">
            {left >= 0 ? <>{L('فاضل', 'Left')} <b className="num text-ink">{left}</b></>
              : t.kcal <= s.maintenance ? <>+<b className="num text-amber">{-left}</b> · {L('لسه تحت الصيانة', 'still under maintenance')}</>
              : <>{L('عديت الصيانة بـ', 'Over maintenance by')} <b className="num text-red">{t.kcal - s.maintenance}</b></>}
          </p>
          <Bar label={L('بروتين', 'Protein')} value={t.p} max={s.protein} color="var(--color-green)" />
          <Bar label={L('كارب', 'Carbs')} value={t.c} max={carbs} color="var(--color-teal)" />
          <Bar label={L('دهون', 'Fat')} value={t.f} max={fat} color="var(--color-purple)" />
        </div>
      </button>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="label">{L('المية', 'Water')}</h2>
            <p className="num text-[28px] text-teal">{(ml / 1000).toFixed(2)}<span className="text-[15px] text-ink-2"> / {s.waterGoal / 1000} {L('لتر', 'L')}</span></p>
          </div>
          <div className="flex gap-2">
            <button className="press rounded-full bg-fill p-2.5 text-ink-2 disabled:opacity-30" disabled={!water.length} aria-label={L('تراجع', 'Undo')}
              onClick={() => db.water.delete(water.at(-1)!.id!)}><Undo2 size={20} /></button>
            <button className="press flex items-center gap-1 rounded-full bg-teal/20 px-3 py-2 text-teal" aria-label={L('زود 250 مل', 'Add 250 ml')} onClick={() => addWater(250)}><Plus size={18} />250</button>
          </div>
        </div>
        <div className="flex justify-between gap-3">
          {Array.from({ length: Math.round(s.waterGoal / BOTTLE) }, (_, i) => (
            <Bottle key={i} fill={Math.min(1, Math.max(0, (ml - i * BOTTLE) / BOTTLE))} onTap={() => addWater(BOTTLE)} />
          ))}
        </div>
      </section>

      <WeightCard s={s} theme={theme} />
    </div>
  )
}

function Bottle({ fill, onTap }: { fill: number; onTap: () => void }) {
  return (
    <button className="press relative h-24 flex-1 overflow-hidden rounded-[14px_14px_18px_18px] border border-hair bg-fill" onClick={onTap}
      aria-label={L(`زجاجة ${Math.round(fill * 100)}% — دوس تزود 750 مل`, `Bottle ${Math.round(fill * 100)}% — tap to add 750 ml`)}>
      <div className="absolute inset-x-0 bottom-0 bg-teal/70" style={{ height: `${fill * 100}%`, transition: 'height 600ms var(--ease-spring)' }} />
      <div className="absolute inset-x-[30%] top-0 h-2 rounded-b bg-ink-3" />
    </button>
  )
}

/** One tap installs on Android; on iPhone it opens a picture guide (Apple allows no automatic install). */
function InstallCard() {
  const mode = useInstall()
  const [guide, setGuide] = useState(false)
  if (!mode) return null
  const tap = async () => {
    if (mode === 'ios') return setGuide(true)
    if (await promptInstall()) toast(L('✅ اتثبت — هتلاقيه على الشاشة الرئيسية', '✅ Installed — find it on your home screen'))
  }
  return (
    <>
      <button className="press card flex items-center gap-3 !py-3 text-start" onClick={tap}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-white"><Download size={20} /></span>
        <span className="flex-1">
          <span className="block font-semibold">{L('ثبّت التطبيق', 'Install the app')}</span>
          <span className="text-[13px] text-ink-2">{L('يفتح أسرع، ملء الشاشة، وبياناتك متتمسحش', 'Opens faster, full screen, and your data stays safe')}</span>
        </span>
      </button>
      {guide && (
        <Sheet title={L('التثبيت على الآيفون', 'Install on iPhone')} onClose={() => setGuide(false)}>
          <p className="mb-4 text-[14px] text-ink-2">{L('أبل مش بتسمح بزرار تثبيت تلقائي، بس هي 3 دوسات:', "Apple doesn't allow an automatic install button, but it's 3 taps:")}</p>
          {[
            [<Share key="s" size={22} />, L('دوس زرار المشاركة', 'Tap the Share button'), L('المربع اللي طالع منه سهم — تحت في نص الشاشة في Safari', 'The square with an arrow — bottom middle in Safari')],
            [<SquarePlus key="p" size={22} />, L('اختار "إضافة إلى الشاشة الرئيسية"', 'Choose "Add to Home Screen"'), L('انزل في القايمة لو مش ظاهر', 'Scroll the list down if you don’t see it')],
            [<Plus key="a" size={22} />, L('دوس "إضافة" فوق', 'Tap "Add" at the top'), L('خلاص — افتحه من الأيقونة على الشاشة', 'Done — open it from the home-screen icon')],
          ].map(([icon, title, sub], i) => (
            <div key={i} className="mb-3 flex items-center gap-3 rounded-2xl bg-fill p-3">
              <span className="num grid size-9 shrink-0 place-items-center rounded-full bg-accent text-[15px] text-white">{i + 1}</span>
              <span className="text-accent">{icon}</span>
              <span className="flex-1"><span className="block font-medium">{title}</span><span className="text-[12px] text-ink-2">{sub}</span></span>
            </div>
          ))}
          <p className="mt-2 text-center text-[28px] motion-safe:animate-bounce" aria-hidden>⬇️</p>
          <p className="text-center text-[12px] text-ink-3">{L('زرار المشاركة تحت', 'The Share button is down there')}</p>
        </Sheet>
      )}
    </>
  )
}
