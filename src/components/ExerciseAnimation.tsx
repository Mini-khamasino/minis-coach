import { useState, useEffect } from 'react'

interface Props {
  images: string[]
  name: string
  className?: string
}

const CDN_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/'

export function ExerciseAnimation({ images, name, className = '' }: Props) {
  const [frame, setFrame] = useState(0)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    if (reduced || images.length < 2) return
    const timer = setInterval(() => {
      setFrame((f) => (f === 0 ? 1 : 0))
    }, 1200)
    return () => clearInterval(timer)
  }, [reduced, images.length])

  if (!images?.length) {
    return (
      <div className={`grid place-items-center bg-fill rounded-2xl text-ink-3 text-[13px] ${className}`}>
        🏋️
      </div>
    )
  }

  // Reduced motion: show the two photos side by side
  if (reduced && images.length >= 2) {
    return (
      <div className={`flex gap-2 overflow-hidden rounded-2xl bg-fill p-1 ${className}`}>
        <img
          src={`${CDN_BASE}${images[0]}`}
          alt={`${name} — start position`}
          loading="lazy"
          className="size-full flex-1 object-contain rounded-xl"
        />
        <img
          src={`${CDN_BASE}${images[1]}`}
          alt={`${name} — end position`}
          loading="lazy"
          className="size-full flex-1 object-contain rounded-xl"
        />
      </div>
    )
  }

  // 2-frame crossfade loop
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-fill ${className}`}>
      {images.slice(0, 2).map((img, idx) => (
        <img
          key={img}
          src={`${CDN_BASE}${img}`}
          alt={`${name} — frame ${idx + 1}`}
          loading="lazy"
          className={`absolute inset-0 size-full object-contain transition-opacity duration-300 ease-in-out ${
            images.length === 1 || frame === idx ? 'opacity-100 z-10' : 'opacity-0 z-0'
          }`}
        />
      ))}
    </div>
  )
}
