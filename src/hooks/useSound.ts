import { useCallback, useEffect, useRef, useState } from 'react'
import { MUTED_KEY, readRaw, writeRaw } from '../lib/storage'

/**
 * 오디오 파일 없이 Web Audio API로 소리를 즉석에서 합성한다.
 *
 * 이렇게 하면 mp3를 번들에 넣지 않아도 되고(저장소가 가볍고 오프라인에서도 동작),
 * 회전 속도에 맞춰 틱 소리의 음정을 바꾸는 것 같은 조작도 가능하다.
 *
 * 브라우저 자동재생 정책상 AudioContext는 사용자 제스처 이후에만 소리가 난다.
 * 그래서 컨텍스트를 미리 만들지 않고 첫 재생 시점에 지연 생성한다.
 */

const WIN_MELODY = [523.25, 659.25, 783.99, 1046.5] // C5 - E5 - G5 - C6

/** MIDI 번호를 주파수로. A4(69) = 440Hz 기준. */
function midi(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}

/* ── 사다리 BGM ──────────────────────────────────────────────
   "따라다라 딴딴"이 두 마디로 반복되는 루프.
   16분음표 32칸에 음을 찍어 두고, 아래 스케줄러가 한 칸씩 흘려보낸다.
   null은 쉼표, 앞 음을 이어서 늘리고 싶으면 그냥 비워 둔다.        */

const C5 = 72
const D5 = 74
const E5 = 76
const G5 = 79
const A4 = 69
const B4 = 71

/** 한 칸(16분음표)의 길이(초). 대략 130BPM. */
const BGM_STEP_SEC = 0.115

const BGM_MELODY: Array<number | null> = [
  // 따 라 다 라 │ 딴 ─ 딴 ─
  C5, D5, E5, G5, E5, null, C5, null,
  C5, D5, E5, G5, G5, null, E5, null,
  // 한 음 낮춰 한 번 더
  A4, B4, C5, E5, C5, null, A4, null,
  A4, B4, C5, E5, E5, null, C5, null,
]

/** 마디 첫 칸을 짚어 주는 저음. */
const BGM_BASS: Array<number | null> = [
  48, null, null, null, null, null, null, null,
  48, null, null, null, null, null, null, null,
  45, null, null, null, null, null, null, null,
  45, null, null, null, null, null, null, null,
]

export function useSound() {
  const [muted, setMuted] = useState(() => readRaw(MUTED_KEY) === 'true')
  const contextRef = useRef<AudioContext | null>(null)
  const mutedRef = useRef(muted)
  const lastTickRef = useRef(0)

  // rAF 루프 안에서 참조하므로 최신 값을 ref에도 복사해 둔다.
  useEffect(() => {
    mutedRef.current = muted
    writeRaw(MUTED_KEY, String(muted))
  }, [muted])

  const getContext = useCallback((): AudioContext | null => {
    if (mutedRef.current) return null
    if (!contextRef.current) {
      const Ctor = window.AudioContext ?? window.webkitAudioContext
      if (!Ctor) return null
      contextRef.current = new Ctor()
    }
    const ctx = contextRef.current
    // 탭 전환 등으로 멈춘 컨텍스트를 되살린다.
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  }, [])

  const tone = useCallback(
    (ctx: AudioContext, freq: number, at: number, duration: number, gain: number, type: OscillatorType) => {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()

      osc.type = type
      osc.frequency.setValueAtTime(freq, at)

      // 딸깍 끊기는 소리를 막기 위한 짧은 어택 + 지수 감쇠
      env.gain.setValueAtTime(0.0001, at)
      env.gain.exponentialRampToValueAtTime(gain, at + 0.008)
      env.gain.exponentialRampToValueAtTime(0.0001, at + duration)

      osc.connect(env).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + duration + 0.02)
    },
    [],
  )

  /**
   * 가로선이 제자리에 꽂힐 때 나는 짧은 소리.
   * `pitch`(0~1)를 흩뜨리면 여러 개가 연달아 꽂혀도 기계적으로 들리지 않는다.
   */
  const playClack = useCallback(
    (pitch = 0.5) => {
      const ctx = getContext()
      if (!ctx) return

      // 여러 개가 한꺼번에 꽂힐 때 소리가 뭉치지 않도록 최소 간격을 둔다.
      const now = ctx.currentTime
      if (now - lastTickRef.current < 0.022) return
      lastTickRef.current = now

      tone(ctx, 620 + pitch * 680, now, 0.05, 0.045, 'triangle')
    },
    [getContext, tone],
  )

  /**
   * 결과 칸에 닿는 순간 울리는, 사람마다 다른 음.
   *
   * 5음 음계(펜타토닉)로 배정한다. 온음계를 쓰면 인원이 늘수록 반음이 부딪혀
   * 불협이 생기는데, 펜타토닉은 어떤 조합을 동시에 눌러도 협화한다. 도착 시각이
   * 조금씩 어긋나 아르페지오처럼 들리고, 마지막엔 화음으로 겹친다.
   */
  const playArrival = useCallback(
    (index: number) => {
      const ctx = getContext()
      if (!ctx) return

      const PENTATONIC = [0, 2, 4, 7, 9]
      // 다섯 명을 넘어가면 한 옥타브씩 올려 계속 이어 붙인다.
      const note = 60 + PENTATONIC[index % 5] + 12 * Math.floor(index / 5)
      const now = ctx.currentTime

      tone(ctx, midi(note), now, 0.55, 0.085, 'sine')
      // 한 옥타브 위를 옅게 얹으면 종소리처럼 또렷해진다.
      tone(ctx, midi(note + 12), now, 0.35, 0.03, 'triangle')
    },
    [getContext, tone],
  )

  /**
   * 가로선을 건널 때마다 울리는 음. 경로가 곧 멜로디가 된다.
   *
   * 지옥에서는 한 사람이 100번 넘게 건너므로 그대로 내면 소리가 뭉친다. 전역으로
   * 최소 간격을 두어 초당 열여덟 음까지만 흘려보낸다. 덕분에 지옥은 촘촘한
   * 아르페지오가 되고 쉬움은 띄엄띄엄한 선율이 된다.
   */
  const lastMelodyRef = useRef(0)
  const playMelodyNote = useCallback(
    (personIndex: number, step: number) => {
      const ctx = getContext()
      if (!ctx) return

      const now = ctx.currentTime
      if (now - lastMelodyRef.current < 0.055) return
      lastMelodyRef.current = now

      const PENTATONIC = [0, 2, 4, 7, 9]
      // 사람마다 음역대를 나눠 여러 명이 겹쳐도 서로 구분된다.
      const register = 12 * (personIndex % 3)
      const note =
        57 + register + PENTATONIC[step % 5] + 12 * (Math.floor(step / 5) % 2)

      tone(ctx, midi(note), now, 0.18, 0.04, 'triangle')
    },
    [getContext, tone],
  )

  /** 사다리를 타고 내려가는 동안 흐르는 낮은 발소리. */
  const playStep = useCallback(() => {
    const ctx = getContext()
    if (!ctx) return
    const now = ctx.currentTime
    tone(ctx, 240 + Math.random() * 90, now, 0.08, 0.035, 'sine')
  }, [getContext, tone])

  /* ── 사다리 BGM ─────────────────────────────────────────────
     setInterval만으로 음을 재생하면 타이밍이 눈에 띄게 흔들린다.
     그래서 흔한 방식대로 "미리 예약"한다. 타이머는 25ms마다 깨어나
     앞으로 0.2초 안에 울릴 음들을 오디오 시계에 미리 걸어 둔다.
     실제 재생 시각은 오디오 하드웨어가 잡으므로 박자가 정확하다.   */

  const bgmRef = useRef<{ timer: number; nextAt: number; step: number } | null>(null)

  const stopBgm = useCallback(() => {
    if (!bgmRef.current) return
    window.clearInterval(bgmRef.current.timer)
    bgmRef.current = null
  }, [])

  const startBgm = useCallback(() => {
    if (bgmRef.current) return
    const ctx = getContext()
    if (!ctx) return

    const state = { timer: 0, nextAt: ctx.currentTime + 0.06, step: 0 }

    const pump = () => {
      while (state.nextAt < ctx.currentTime + 0.2) {
        const index = state.step % BGM_MELODY.length

        const note = BGM_MELODY[index]
        if (note !== null) {
          tone(ctx, midi(note), state.nextAt, 0.16, 0.055, 'square')
        }

        const bass = BGM_BASS[index]
        if (bass !== null) {
          tone(ctx, midi(bass), state.nextAt, 0.3, 0.075, 'triangle')
        }

        state.nextAt += BGM_STEP_SEC
        state.step += 1
      }
    }

    pump()
    state.timer = window.setInterval(pump, 25)
    bgmRef.current = state
  }, [getContext, tone])

  // 소리를 끄면 BGM도 즉시 멈춰야 한다.
  useEffect(() => {
    if (muted) stopBgm()
  }, [muted, stopBgm])

  /** 당첨 순간의 상승 아르페지오. */
  const playWin = useCallback(() => {
    const ctx = getContext()
    if (!ctx) return
    const now = ctx.currentTime
    WIN_MELODY.forEach((freq, i) => {
      tone(ctx, freq, now + i * 0.09, 0.34, 0.11, 'sine')
    })
  }, [getContext, tone])

  const toggleMuted = useCallback(() => setMuted((prev) => !prev), [])

  useEffect(() => {
    return () => {
      if (bgmRef.current) window.clearInterval(bgmRef.current.timer)
      void contextRef.current?.close()
      contextRef.current = null
    }
  }, [])

  return {
    muted,
    toggleMuted,
    playClack,
    playStep,
    playMelodyNote,
    playArrival,
    playWin,
    startBgm,
    stopBgm,
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
