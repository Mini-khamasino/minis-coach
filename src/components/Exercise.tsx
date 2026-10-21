import { L } from '../lib/i18n.ts'

// shortcut: placeholder until the exercise tab (phase 4) lands
export function Exercise() {
  return (
    <div className="card mt-6 text-center">
      <p className="mb-1 text-[34px]">🏋️</p>
      <p className="text-[17px] font-semibold">{L('التمارين جاية قريب', 'Workouts are coming soon')}</p>
      <p className="text-[14px] text-ink-2">{L('برامج، تسجيل التمرين، وخريطة العضلات', 'Programs, workout logging and a muscle map')}</p>
    </div>
  )
}
