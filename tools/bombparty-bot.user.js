// ==UserScript==
// @name         BombParty bot (instant)
// @match        https://phoenix.jklm.fun/games/bombparty*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(() => {
  const COMMON = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt'
  const BIG = 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt'

  // BEGIN-PICK
  /** Words containing the syllable, not yet used, best first: most distinct letters (more bonus letters), then shorter. */
  function pick(words, syllable, used, limit = 8) {
    const s = syllable.toLowerCase()
    const out = []
    for (const w of words) if (w.length >= s.length + 1 && w.length <= 14 && w.includes(s) && !used.has(w)) out.push(w)
    const score = (w) => new Set(w).size * 10 - w.length
    return out.sort((a, b) => score(b) - score(a)).slice(0, limit)
  }
  // END-PICK

  const load = (url, key) =>
    new Promise((resolve) => {
      const cached = GM_getValue(key)
      if (cached) return resolve(cached.split('\n'))
      GM_xmlhttpRequest({
        method: 'GET', url,
        onload: (r) => { const words = r.responseText.split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]+$/.test(w)); GM_setValue(key, words.join('\n')); resolve(words) },
        onerror: () => resolve([]),
      })
    })

  const $ = (s) => document.querySelector(s)
  const badge = document.createElement('div')
  badge.style.cssText = 'position:fixed;top:6px;left:6px;z-index:99999;padding:3px 8px;border-radius:10px;font:12px sans-serif;color:#fff;background:#555;cursor:pointer'
  document.body.appendChild(badge)
  let on = true, common = [], big = []
  const paint = (t) => { badge.textContent = `🤖 ${on ? 'ON' : 'OFF'}${t ? ' · ' + t : ''}`; badge.style.background = on ? '#2a7' : '#555' }
  badge.onclick = () => { on = !on; paint() }
  paint('loading words…')
  Promise.all([load(COMMON, 'common'), load(BIG, 'big')]).then(([c, b]) => { common = c; big = b; paint(`${c.length + b.length} words`) })

  const used = new Set()
  let busy = false

  async function play() {
    if (busy || !on || !common.length && !big.length) return
    const turn = $('.selfTurn'), syl = $('.middle .round .syllable')?.textContent.trim()
    if (!turn || turn.hidden || !syl) return
    busy = true
    const input = $('.selfTurn input'), form = $('.selfTurn form')
    const candidates = [...pick(common, syl, used), ...pick(big, syl, used)]
    for (const w of candidates) {
      if (turn.hidden || $('.middle .round .syllable').textContent.trim() !== syl) break // turn moved on
      used.add(w)
      input.value = w
      form.requestSubmit()
      await new Promise((r) => setTimeout(r, 250)) // if still our turn on the same syllable, the word was rejected: try the next
    }
    busy = false
  }

  // new round: the game allows words again
  new MutationObserver(() => { if (!$('.top')?.hidden) used.clear() }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['hidden'] })
  // our turn starts when .selfTurn un-hides or the syllable changes
  new MutationObserver(play).observe(document.body, { attributes: true, subtree: true, childList: true, characterData: true, attributeFilter: ['hidden'] })
  setInterval(play, 300) // safety net
})()
