// Script to fetch, slim down, and save the exercise database
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'

console.log('Downloading exercise dataset from', URL, '...')
const res = await fetch(URL)
if (!res.ok) {
  throw new Error(`Failed to download: ${res.status} ${res.statusText}`)
}

const raw = await res.json()
console.log(`Downloaded ${raw.length} exercises. Slimming down...`)

const slim = raw.map((item) => ({
  id: item.id,
  name: item.name,
  category: item.category,
  equipment: item.equipment,
  level: item.level,
  primaryMuscles: item.primaryMuscles || [],
  secondaryMuscles: item.secondaryMuscles || [],
  instructions: item.instructions || [],
  images: item.images || [],
}))

const outPath = resolve(process.cwd(), 'public/exercises.json')
writeFileSync(outPath, JSON.stringify(slim), 'utf8')
console.log(`Saved ${slim.length} exercises to ${outPath}`)
