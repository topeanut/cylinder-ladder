import type { AppState, Difficulty } from './types'
import { appendPeople, clamp } from './utils'

/**
 * QueryString ↔ 앱 상태 변환. URL이 곧 저장소다.
 *
 *   ?people=철수,영희,민수&win=1&mode=hell&seed=284719&wins=철수:2,영희:1&done=1
 *
 * 사다리 구조는 담지 않는다. seed가 같으면 난수열이 같고, 난수열이 같으면
 * 가로선 배치와 당첨 배정까지 완전히 똑같이 재현되기 때문이다.
 */

const SEPARATOR = ','
const PAIR = ':'

function encodeList(names: string[]): string {
  return names.map(encodeURIComponent).join(SEPARATOR)
}

function decodeOne(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    // 손으로 편집하다 깨진 URL이어도 앱이 죽지 않게 원문을 그대로 쓴다.
    return part
  }
}

function decodeList(raw: string): string[] {
  return raw.split(SEPARATOR).map(decodeOne).map((s) => s.trim()).filter(Boolean)
}

/** `철수:2,영희:1` → { 철수: 2, 영희: 1 } */
function decodeWins(raw: string): Record<string, number> {
  const wins: Record<string, number> = {}

  for (const entry of raw.split(SEPARATOR)) {
    if (!entry) continue
    const at = entry.lastIndexOf(PAIR)
    const name = decodeOne(at === -1 ? entry : entry.slice(0, at)).trim()
    const times = at === -1 ? 1 : Number(entry.slice(at + 1))
    if (!name) continue
    wins[name] = (wins[name] ?? 0) + (Number.isFinite(times) && times > 0 ? Math.floor(times) : 1)
  }

  return wins
}

function encodeWins(wins: Record<string, number>): string {
  return Object.entries(wins)
    .filter(([, times]) => times > 0)
    .map(([name, times]) => `${encodeURIComponent(name)}${PAIR}${times}`)
    .join(SEPARATOR)
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

  const mode = params.get('mode')
  const difficulty: Difficulty =
    mode === 'easy' || mode === 'hell' ? mode : 'normal'

  return {
    people,
    winCount,
    difficulty,
    seed,
    wins: decodeWins(params.get('wins') ?? ''),
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
  if (state.difficulty !== 'normal') parts.push(`mode=${state.difficulty}`)
  if (state.seed !== null) parts.push(`seed=${state.seed}`)

  const wins = encodeWins(state.wins)
  if (wins) parts.push(`wins=${wins}`)

  if (state.revealed) parts.push('done=1')

  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

/**
 * 공유용 절대 URL.
 *
 * `revealed`를 켜면 결과가 보이는 링크, 끄면 **봉인 링크**가 된다. 봉인 링크를 받은
 * 사람은 사다리만 보고, 자기 이름을 눌러 직접 타야 자기 결과가 공개된다.
 */
export function buildShareUrl(state: AppState, revealed: boolean): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}${buildQuery({ ...state, revealed })}`
}
