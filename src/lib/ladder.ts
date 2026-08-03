import type { Ladder, PathSegment, Trace } from './types'
import { clamp, mod } from './utils'

/**
 * 사다리 생성·주행 로직.
 *
 * 모든 무작위성이 시드 하나에서 나온다는 점이 핵심이다. 시드만 URL에 담으면
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

/** 인원 수에 맞춰 가로선을 놓을 행의 개수를 정한다. */
export function rowCountFor(count: number): number {
  return clamp(count + 4, 8, 18)
}

/**
 * 이웃한 gap이 같은 행에 함께 놓이면 한 세로줄에서 갈 곳이 둘이 되어
 * 사다리가 성립하지 않는다. 그래서 행마다 서로 이웃하지 않는 gap만 고른다.
 */
function pickRowGaps(gapCount: number, rng: () => number): number[] {
  const order = Array.from({ length: gapCount }, (_, i) => i)
  // Fisher-Yates: 어느 gap이 먼저 자리를 잡을지 매번 달라진다.
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  const taken = new Set<number>()
  for (const gap of order) {
    if (rng() > 0.5) continue
    if (taken.has(mod(gap - 1, gapCount)) || taken.has(mod(gap + 1, gapCount))) continue
    taken.add(gap)
  }

  return [...taken].sort((a, b) => a - b)
}

export function buildLadder(count: number, rng: () => number): Ladder {
  const rows = rowCountFor(count)
  if (count < 2) return { count, rows, rungs: Array.from({ length: rows }, () => []) }

  // 두 명이면 원통을 한 바퀴 돌아도 연결할 쌍이 하나뿐이다.
  const gapCount = count === 2 ? 1 : count

  return {
    count,
    rows,
    rungs: Array.from({ length: rows }, () => pickRowGaps(gapCount, rng)),
  }
}

/**
 * 한 사람이 사다리를 타고 내려간 경로.
 * 세로로 내려가다 가로선을 만나면 옆줄로 건너간다.
 */
export function tracePath(ladder: Ladder, start: number): Trace {
  const segments: PathSegment[] = []
  let rail = start
  let fromRow = -1 // -1은 사다리 맨 위를 뜻한다

  for (let row = 0; row < ladder.rows; row += 1) {
    const rowRungs = ladder.rungs[row]
    // 오른쪽 gap은 내 번호, 왼쪽 gap은 내 번호 - 1. 둘이 동시에 있을 수는 없다.
    const direction: 1 | -1 | 0 = rowRungs.includes(rail)
      ? 1
      : rowRungs.includes(mod(rail - 1, ladder.count))
        ? -1
        : 0

    if (direction === 0) continue

    segments.push({ kind: 'rail', rail, fromRow, toRow: row })
    segments.push({
      kind: 'rung',
      row,
      gap: direction === 1 ? rail : mod(rail - 1, ladder.count),
      direction,
    })

    rail = mod(rail + direction, ladder.count)
    fromRow = row
  }

  segments.push({ kind: 'rail', rail, fromRow, toRow: ladder.rows })
  return { start, end: rail, segments }
}

/**
 * 사다리 맨 아래 칸의 당첨 배치.
 * 사다리가 이미 섞어 주지만, 당첨 칸의 위치까지 섞어야 눈으로 추적하기 어려워진다.
 */
export function buildPrizeSlots(
  count: number,
  winCount: number,
  rng: () => number,
): boolean[] {
  const slots = Array.from({ length: count }, (_, i) => i < clamp(winCount, 0, count))
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }
  return slots
}

export interface LadderPlan {
  ladder: Ladder
  /** prizeSlots[railIndex] = 그 자리에 당첨이 놓였는가. */
  prizeSlots: boolean[]
  /** traces[personIndex] = 그 사람이 내려간 경로. */
  traces: Trace[]
}

/** 시드 하나로 사다리·당첨 배치·전원 경로를 한꺼번에 결정한다. */
export function planLadder(count: number, winCount: number, seed: number): LadderPlan {
  const rng = createRng(seed)
  const ladder = buildLadder(count, rng)
  const prizeSlots = buildPrizeSlots(count, winCount, rng)
  const traces = Array.from({ length: count }, (_, i) => tracePath(ladder, i))
  return { ladder, prizeSlots, traces }
}
