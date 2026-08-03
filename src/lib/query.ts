import type { AppState } from './types'
import { appendPeople, clamp } from './utils'

/**
 * QueryString ↔ 앱 상태 변환. URL이 곧 저장소다.
 *
 *   ?people=철수,영희,민수&win=1&seed=284719&done=1
 *
 * 사다리 구조는 담지 않는다. seed만 같으면 난수열이 같고, 난수열이 같으면
 * 가로선 배치와 당첨 위치까지 완전히 똑같이 재현되기 때문이다.
 */

const SEPARATOR = ','

function encodeList(names: string[]): string {
  return names.map(encodeURIComponent).join(SEPARATOR)
}

function decodeList(raw: string): string[] {
  return raw
    .split(SEPARATOR)
    .map((part) => {
      try {
        return decodeURIComponent(part)
      } catch {
        // 손으로 편집하다 깨진 URL이어도 앱이 죽지 않게 원문을 그대로 쓴다.
        return part
      }
    })
    .map((s) => s.trim())
    .filter(Boolean)
}

export function hasStateParams(search: string): boolean {
  const params = new URLSearchParams(search)
  return params.has('people') || params.has('seed')
}

export function parseQuery(search: string): AppState | null {
  if (!hasStateParams(search)) return null

  const params = new URLSearchParams(search)
  const people = appendPeople([], decodeList(params.get('people') ?? ''))

  const rawSeed = Number(params.get('seed'))
  const seed = Number.isFinite(rawSeed) && rawSeed > 0 ? Math.floor(rawSeed) : null

  const rawWin = Number(params.get('win'))
  const winCount = clamp(
    Number.isFinite(rawWin) ? Math.floor(rawWin) : 1,
    0,
    Math.max(people.length, 1),
  )

  return {
    people,
    winCount,
    seed,
    // 사다리가 없으면 공개할 결과도 없다.
    revealed: seed !== null && params.get('done') === '1',
  }
}

export function buildQuery(state: AppState): string {
  const parts: string[] = []

  if (state.people.length > 0) {
    parts.push(`people=${encodeList(state.people.map((p) => p.name))}`)
  }
  parts.push(`win=${state.winCount}`)
  if (state.seed !== null) parts.push(`seed=${state.seed}`)
  if (state.revealed) parts.push('done=1')

  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

/** 결과까지 공개된 상태의 절대 URL. 공유 버튼이 복사하는 값. */
export function buildShareUrl(state: AppState): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}${buildQuery({ ...state, revealed: true })}`
}
