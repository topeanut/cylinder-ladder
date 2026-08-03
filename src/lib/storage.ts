import type { AppState } from './types'

/**
 * localStorage 접근을 한 곳에 모은다.
 * 사파리 프라이빗 모드 등에서는 접근 자체가 예외를 던지므로 전부 감싼다.
 */

const STATE_KEY = 'hoesik-picker:state:v1'
export const MUTED_KEY = 'hoesik-picker:muted'

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 용량 초과·접근 차단: 저장을 못 해도 앱 동작은 계속된다 */
  }
}

/** 저장된 값이 우리가 아는 모양인지 확인한다. 사람이 손댄 값일 수도 있다. */
function isAppState(value: unknown): value is AppState {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    Array.isArray(candidate.people) &&
    typeof candidate.winCount === 'number' &&
    typeof candidate.revealed === 'boolean' &&
    typeof candidate.wins === 'object' &&
    candidate.wins !== null &&
    (candidate.seed === null || typeof candidate.seed === 'number') &&
    candidate.people.every(
      (p: unknown) =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as Record<string, unknown>).id === 'string' &&
        typeof (p as Record<string, unknown>).name === 'string',
    )
  )
}

export function loadState(): AppState | null {
  const raw = readRaw(STATE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isAppState(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveState(state: AppState): void {
  writeRaw(STATE_KEY, JSON.stringify(state))
}
