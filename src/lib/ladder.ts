import type { Difficulty, Ladder, PathSegment, Rung, Trace } from './types'
import { clamp, mod } from './utils'

/**
 * 사다리 생성·주행 로직.
 *
 * 모든 무작위성이 시드 하나에서 나온다는 점이 핵심이다. 시드와 명단만 URL에 담으면
 * 누가 어디서 열어도 똑같은 사다리와 똑같은 결과가 재현된다. 사다리 구조를
 * 통째로 직렬화할 필요가 없어 링크가 짧다.
 */

/** 시드 기반 의사난수 생성기(mulberry32). 짧고 분포가 고르다. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}

/** 관통 가로선을 놓을 수 있는 최소 인원. 이보다 적으면 "마주보는 줄"이 없다. */
const THROUGH_MIN_COUNT = 5

/**
 * 난이도별 사다리 밀도.
 *
 * 눈으로 경로를 따라갈 수 있는지가 여기서 갈린다. 쉬움은 관통선이 아예 없어
 * 평면 사다리처럼 읽히고, 지옥은 관통선이 행마다 여러 개 깔려 원통 속이 엉킨다.
 */
const DENSITY: Record<
  Difficulty,
  {
    throughChance: number
    throughPerRow: number
    edgeChance: number
    extraRows: number
    minRows: number
    maxRows: number
  }
> = {
  easy: { throughChance: 0, throughPerRow: 0, edgeChance: 0.42, extraRows: 2, minRows: 7, maxRows: 12 },
  normal: { throughChance: 0.3, throughPerRow: 1, edgeChance: 0.5, extraRows: 4, minRows: 8, maxRows: 18 },
  hell: { throughChance: 0.85, throughPerRow: 2, edgeChance: 0.55, extraRows: 9, minRows: 14, maxRows: 26 },
}

/** 인원 수와 난이도에 맞춰 가로선을 놓을 행의 개수를 정한다. */
export function rowCountFor(count: number, difficulty: Difficulty): number {
  const density = DENSITY[difficulty]
  return clamp(count + density.extraRows, density.minRows, density.maxRows)
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * 한 행에 놓일 가로선들을 고른다.
 *
 * 규칙은 하나뿐이다 — **한 행에서 같은 세로줄을 두 번 건드리지 않는다.**
 * 두 번 건드리면 그 줄에서 갈 곳이 둘이 되어 사다리가 성립하지 않는다.
 * 이 규칙 하나가 이웃 가로선과 관통 가로선을 동시에 다스린다.
 */
function pickRowRungs(count: number, difficulty: Difficulty, rng: () => number): Rung[] {
  const density = DENSITY[difficulty]
  const rungs: Rung[] = []
  const used = new Set<number>()

  // 관통 가로선. 난이도가 올라갈수록 자주, 그리고 한 행에 여러 개까지 놓인다.
  for (let attempt = 0; attempt < density.throughPerRow; attempt += 1) {
    if (count < THROUGH_MIN_COUNT || rng() >= density.throughChance) continue

    const from = Math.floor(rng() * count)
    const half = Math.floor(count / 2)
    // 정확히 반대편이면 매번 같은 모양이라, 한 칸 흔들어 준다.
    const to = mod(from + half + (rng() < 0.5 ? 0 : 1), count)

    if (used.has(from) || used.has(to)) continue
    // 이웃끼리 이으면 그건 그냥 겉면 가로선이다. 관통일 때만 인정한다.
    const apart = Math.min(mod(to - from, count), mod(from - to, count))
    if (apart <= 1) continue

    rungs.push({ kind: 'through', from, to })
    used.add(from)
    used.add(to)
  }

  // 두 명뿐이면 원통을 한 바퀴 돌아도 이을 쌍이 하나다.
  const gapCount = count === 2 ? 1 : count

  for (const gap of shuffle(Array.from({ length: gapCount }, (_, i) => i), rng)) {
    if (rng() > density.edgeChance) continue
    const left = gap
    const right = mod(gap + 1, count)
    if (used.has(left) || used.has(right)) continue

    rungs.push({ kind: 'edge', gap })
    used.add(left)
    used.add(right)
  }

  return rungs
}

export function buildLadder(
  count: number,
  difficulty: Difficulty,
  rng: () => number,
): Ladder {
  const rows = rowCountFor(count, difficulty)
  if (count < 2) return { count, rows, rungs: Array.from({ length: rows }, () => []) }

  return {
    count,
    rows,
    rungs: Array.from({ length: rows }, () => pickRowRungs(count, difficulty, rng)),
  }
}

/** 이 가로선이 주어진 세로줄을 건드리는가. 건드린다면 반대쪽 줄 번호를 준다. */
function otherEnd(rung: Rung, rail: number, count: number): number | null {
  if (rung.kind === 'through') {
    if (rung.from === rail) return rung.to
    if (rung.to === rail) return rung.from
    return null
  }
  const right = mod(rung.gap + 1, count)
  if (rung.gap === rail) return right
  if (right === rail) return rung.gap
  return null
}

/**
 * 한 사람이 사다리를 타고 내려간 경로.
 * 세로로 내려가다 자기 줄을 건드리는 가로선을 만나면 반대쪽 줄로 건너간다.
 */
export function tracePath(ladder: Ladder, start: number): Trace {
  const segments: PathSegment[] = []
  let rail = start
  let fromRow = -1 // -1은 사다리 맨 위를 뜻한다

  for (let row = 0; row < ladder.rows; row += 1) {
    let next: number | null = null
    for (const rung of ladder.rungs[row]) {
      next = otherEnd(rung, rail, ladder.count)
      if (next !== null) break
    }
    if (next === null) continue

    segments.push({ kind: 'rail', rail, fromRow, toRow: row })
    segments.push({ kind: 'cross', row, from: rail, to: next })

    rail = next
    fromRow = row
  }

  segments.push({ kind: 'rail', rail, fromRow, toRow: ladder.rows })
  return { start, end: rail, segments }
}

/**
 * 가중치에 비례해 서로 다른 k명을 뽑는다(비복원 가중추출).
 *
 * 뽑을 때마다 뽑힌 사람의 몫을 빼고 남은 사람들 사이에서 다시 뽑는 방식이라,
 * 가중치가 높을수록 먼저 뽑힐 확률이 높아진다.
 */
export function weightedSample(
  weights: number[],
  k: number,
  rng: () => number,
): number[] {
  const remaining = weights.map((weight, index) => ({ index, weight: Math.max(weight, 0) }))
  const picked: number[] = []
  const need = clamp(k, 0, remaining.length)

  for (let n = 0; n < need; n += 1) {
    const total = remaining.reduce((sum, item) => sum + item.weight, 0)

    // 가중치가 전부 0이면 남은 사람 중 아무나 균등하게 뽑는다.
    let at = total > 0 ? rng() * total : Math.floor(rng() * remaining.length)
    let chosen = remaining.length - 1

    if (total > 0) {
      for (let i = 0; i < remaining.length; i += 1) {
        at -= remaining[i].weight
        if (at <= 0) {
          chosen = i
          break
        }
      }
    } else {
      chosen = Math.min(Math.floor(at), remaining.length - 1)
    }

    picked.push(remaining[chosen].index)
    remaining.splice(chosen, 1)
  }

  return picked
}

export interface LadderPlan {
  ladder: Ladder
  /** prizeSlots[railIndex] = 그 자리에 당첨이 놓였는가. */
  prizeSlots: boolean[]
  /** traces[personIndex] = 그 사람이 내려간 경로. */
  traces: Trace[]
  /** 이번 판의 당첨자(사람 번호). */
  winners: number[]
}

/**
 * 시드 하나로 사다리·경로·당첨 배치를 한꺼번에 결정한다.
 *
 * 순서가 중요하다. 사다리를 **먼저** 정직하게 짜고, 각자가 도착할 칸을 알아낸 뒤,
 * 사람 단위로 가중추첨해서 당첨자를 정하고, 그 사람이 도착하는 칸에 '당첨'을 놓는다.
 * 사다리를 편향시키면 경로가 거짓말이 되지만, 이 방식은 경로가 전부 진짜인 채로
 * 확률만 정확히 제어된다.
 */
export function planLadder(
  count: number,
  winCount: number,
  seed: number,
  weights: number[],
  difficulty: Difficulty,
): LadderPlan {
  const rng = createRng(seed)
  const ladder = buildLadder(count, difficulty, rng)
  const traces = Array.from({ length: count }, (_, i) => tracePath(ladder, i))

  const winners = weightedSample(weights, winCount, rng)
  const prizeSlots = Array.from({ length: count }, () => false)
  for (const person of winners) prizeSlots[traces[person].end] = true

  return { ladder, prizeSlots, traces, winners }
}
