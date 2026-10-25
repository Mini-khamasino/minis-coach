import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('./bombparty-bot.user.js', import.meta.url), 'utf8')
const pick = new Function(src.split('// BEGIN-PICK')[1].split('// END-PICK')[0] + '; return pick')()
const words = ['philosophy', 'phi', 'dolphin', 'hello', 'helmet', 'lo', 'follow', 'outnumber']
assert.deepEqual(pick(words, 'PHI', new Set()), ['dolphin', 'philosophy'])
assert.equal(pick(words, 'phi', new Set(['dolphin']))[0], 'philosophy')
assert.deepEqual(pick(words, 'tn', new Set()), ['outnumber'])
assert.deepEqual(pick(words, 'zz', new Set()), [])
console.log('bot pick ok')
