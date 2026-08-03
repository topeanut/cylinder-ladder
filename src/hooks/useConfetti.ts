import { useCallback, useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'

const COLORS = ['#f59e0b', '#f43f5e', '#22c55e', '#3b82f6', '#a855f7', '#fbbf24']

/**
 * 당첨 순간의 색종이 효과.
 *
 * 화면 양쪽에서 가운데로 쏘아 올려 시선이 결과 카드로 모이게 한다.
 * 모션 최소화를 켠 사용자에게는 아무것도 터뜨리지 않는다.
 */
export function useConfetti() {
  const reducedMotionRef = useRef(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = query.matches

    const onChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return useCallback(() => {
    if (reducedMotionRef.current) return

    const base: confetti.Options = {
      particleCount: 70,
      spread: 62,
      startVelocity: 45,
      ticks: 220,
      gravity: 0.9,
      scalar: 0.95,
      colors: COLORS,
      disableForReducedMotion: true,
    }

    void confetti({ ...base, angle: 60, origin: { x: 0, y: 0.72 } })
    void confetti({ ...base, angle: 120, origin: { x: 1, y: 0.72 } })
    void confetti({
      ...base,
      particleCount: 50,
      angle: 90,
      spread: 110,
      startVelocity: 32,
      origin: { x: 0.5, y: 0.62 },
    })
  }, [])
}
