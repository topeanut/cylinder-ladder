import type { Person } from './types'

let seq = 0

/** 충돌 걱정 없는 로컬 전용 id. crypto가 없는 환경도 대비한다. */
export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  seq += 1
  return `p${seq}-${Math.random().toString(36).slice(2, 8)}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** JS의 %는 음수에서 음수를 돌려주므로, 각도 계산용 나머지를 따로 둔다. */
export function mod(value: number, m: number): number {
  return ((value % m) + m) % m
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/**
 * 이름을 정규화한다.
 * 쉼표는 QueryString의 구분자이므로 제거하고, 공백은 하나로 접는다.
 */
export function normalizeName(raw: string): string {
  return raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * 여러 줄 텍스트를 이름 목록으로 바꾼다.
 * 붙여넣기 한 번으로 명단 전체를 채우는 경로다.
 */
export function parseNames(raw: string): string[] {
  return raw
    .split(/[\n\r]+/)
    .map(normalizeName)
    .filter(Boolean)
}

/**
 * 기존 명단에 이름들을 덧붙인다. 빈 이름과 중복 이름은 조용히 걸러낸다.
 * 이름을 유일하게 유지해야 URL 복원(이름 → id 매핑)이 흔들리지 않는다.
 */
export function appendPeople(people: Person[], names: string[]): Person[] {
  const taken = new Set(people.map((p) => p.name))
  const added: Person[] = []

  for (const name of names) {
    const clean = normalizeName(name)
    if (!clean || taken.has(clean)) continue
    taken.add(clean)
    added.push({ id: createId(), name: clean })
  }

  return added.length > 0 ? [...people, ...added] : people
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0) return items
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** 배열에서 무작위 하나. 빈 배열이면 undefined. */
export function randomOf<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(Math.random() * items.length)]
}
