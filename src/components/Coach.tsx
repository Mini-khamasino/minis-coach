import { L } from '../lib/i18n.ts'

// shortcut: placeholder until the message-feed coach (phase 5) lands
export function Coach() {
  return (
    <div className="card mt-6 text-center">
      <p className="mb-1 text-[34px]">🧠</p>
      <p className="text-[17px] font-semibold">{L('الكوتش الجديد جاي قريب', 'The new coach is coming soon')}</p>
      <p className="text-[14px] text-ink-2">{L('هيبعتلك رسايل ونصايح طول اليوم من غير ذكاء اصطناعي', 'Messages and advice through the day, no AI needed')}</p>
    </div>
  )
}
