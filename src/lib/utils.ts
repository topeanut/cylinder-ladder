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

/**
 * 이름에서 이모지를 떼어낸다.
 *
 * `철수 🍺`처럼 적으면 3D 표지판에 이모지를 크게 띄워, 사람이 많을 때 글자보다
 * 훨씬 빨리 구분된다. 이름 자체는 그대로 두고 표시할 때만 나눈다 — 이모지가
 * 이름의 일부라 URL과 당첨 이력에서도 같은 사람으로 이어져야 하기 때문이다.
 */
export function splitEmoji(name: string): { emoji: string; label: string } {
  // \p{Extended_Pictographic}은 그림문자 전체를 덮는다. 변이 선택자와 결합 문자까지 함께 집는다.
  const pattern = /\p{Extended_Pictographic}(\u200D\p{Extended_Pictographic})*\uFE0F?/gu
  const found = name.match(pattern)
  if (!found) return { emoji: '', label: name }

  const label = name.replace(pattern, '').replace(/\s+/g, ' ').trim()
  // 이모지만 적었다면 그걸 이름으로도 쓴다.
  return { emoji: found[0], label: label || found.join('') }
}
