import { useCallback, useEffect, useRef } from 'react'
import type { PlayClock, Speed } from '../lib/playClock'
import { SPEEDS } from '../lib/playClock'
import { cn } from '../lib/utils'

interface PlaybackBarProps {
  clock: { current: PlayClock }
  speed: Speed
  onSpeedChange: (value: Speed) => void
  /** 재생 중인지. 멈춰 있어도 타임라인은 끌 수 있다. */
  running: boolean
}

/**
 * 재생 배속과 타임라인.
 *
 * 슬라이더 위치를 React state로 두면 초당 60번 리렌더가 일어난다. 그래서 값은
 * 시계에서 직접 읽어 DOM에 쓴다. 이 컴포넌트는 사용자가 배속을 바꿀 때만
 * 다시 그려진다.
 */
export function PlaybackBar({ clock, speed, onSpeedChange, running }: PlaybackBarProps) {
  const sliderRef = useRef<HTMLInputElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const draggingRef = useRef(false)

  // 시계를 따라 슬라이더를 움직인다. 끌고 있는 동안에는 사용자 손을 방해하지 않는다.
  useEffect(() => {
    let frame = 0

    const tick = () => {
      frame = requestAnimationFrame(tick)
      const { elapsed, total } = clock.current
      if (total <= 0) return

      const ratio = Math.min(elapsed / total, 1)
      if (!draggingRef.current && sliderRef.current) {
        sliderRef.current.value = String(Math.round(ratio * 1000))
      }
      if (labelRef.current) {
        labelRef.current.textContent = `${(Math.min(elapsed, total) / 1000).toFixed(1)}s`
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [clock])

  const seek = useCallback(
    (value: number) => {
      const state = clock.current
      if (state.total <= 0) return
      state.elapsed = (value / 1000) * state.total
    },
    [clock],
  )

  const grab = useCallback(() => {
    draggingRef.current = true
    clock.current.scrubbing = true
  }, [clock])

  const release = useCallback(() => {
    draggingRef.current = false
    clock.current.scrubbing = false
  }, [clock])

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-950/85 px-3 py-2 backdrop-blur">
      <div className="flex shrink-0 gap-0.5 rounded-lg bg-neutral-900 p-0.5">
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onSpeedChange(value)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-bold tabular-nums transition-colors',
              speed === value
                ? 'bg-amber-500 text-neutral-950'
                : 'text-neutral-400 hover:text-neutral-100',
            )}
          >
            {value}x
          </button>
        ))}
      </div>

      <input
        ref={sliderRef}
        type="range"
        min={0}
        max={1000}
        defaultValue={0}
        aria-label="재생 위치"
        onPointerDown={grab}
        onPointerUp={release}
        onPointerCancel={release}
        onChange={(event) => seek(Number(event.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-neutral-700 accent-amber-500"
      />

      <span
        ref={labelRef}
        className="w-10 shrink-0 text-right text-xs text-neutral-400 tabular-nums"
      >
        0.0s
      </span>

      {running && (
        <span className="shrink-0 text-xs font-bold text-amber-500">재생 중</span>
      )}
    </div>
  )
}
