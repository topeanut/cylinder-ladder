import { describe, expect, it } from 'vitest'
import type { Difficulty, Ladder } from './types'
import { buildLadder, createRng, planLadder, rowCountFor, weightedSample } from './ladder'
import { weightFor } from './probability'
import { mod } from './utils'

/**
 * 이 앱이 성립하는 근거는 딱 하나다 — **결과는 항상 순열이다.**
 *
 * 두 사람이 같은 칸에 도착하거나 아무도 안 가는 칸이 생기면 게임이 무너진다.
 * 그래서 예제 하나를 확인하는 대신, 어떤 시드·인원·난이도를 넣어도 그 성질이
 * 깨지지 않는지 수천 번 두들긴다(속성 기반 테스트). 생성 규칙을 또 바꿔도
 * 여기서 자동으로 걸린다.
 */

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hell']
/** 작은 수, 홀짝, 관통선 최소 인원 경계(5), 큰 수를 모두 지나가도록 고른 값들. */
const COUNTS = [2, 3, 4, 5, 8, 13, 21, 30]
const SEEDS = Array.from({ length: 24 }, (_, i) => i * 7919 + 1)

function planFor(count: number, difficulty: Difficulty, seed: number) {
  const weights = Array.from({ length: count }, () => 1)
  return planLadder(count, Math.min(2, count), seed, weights, difficulty)
}

/** 한 사람이 다른 사람과 겹치지 않고 정확히 한 칸씩 차지하는가. */
function isPermutation(ends: number[], count: number): boolean {
  if (ends.length !== count) return false
  const seen = new Set(ends)
  if (seen.size !== count) return false
  return ends.every((end) => Number.isInteger(end) && end >= 0 && end < count)
}

describe('사다리는 항상 순열을 만든다', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty}: 모든 인원·시드에서 도착 칸이 겹치지 않는다`, () => {
      for (const count of COUNTS) {
        for (const seed of SEEDS) {
          const plan = planFor(count, difficulty, seed)
          const ends = plan.traces.map((trace) => trace.end)

          expect(
            isPermutation(ends, count),
            `${difficulty} count=${count} seed=${seed} ends=${ends}`,
          ).toBe(true)
        }
      }
    })
  }

  it('거꾸로도 성립한다 — 어느 칸이든 도착하는 사람이 정확히 한 명', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const count of COUNTS) {
        const plan = planFor(count, difficulty, 4242)

        for (let slot = 0; slot < count; slot += 1) {
          const owners = plan.traces.filter((trace) => trace.end === slot)
          expect(owners, `${difficulty} count=${count} slot=${slot}`).toHaveLength(1)
        }
      }
    }
  })
})

describe('가로선 배치 규칙', () => {
  /**
   * 순열이 보장되는 진짜 이유는 이 규칙 하나다.
   * 한 행에서 같은 세로줄을 두 번 건드리면 그 줄에서 갈 곳이 둘이 되어 무너진다.
   */
  it('한 행에서 같은 세로줄을 두 번 건드리지 않는다', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const count of COUNTS) {
        for (const seed of SEEDS.slice(0, 8)) {
          const ladder = buildLadder(count, difficulty, createRng(seed))

          for (const [row, rungs] of ladder.rungs.entries()) {
            const touched = new Set<number>()
            for (const rung of rungs) {
              const rails =
                rung.kind === 'edge'
                  ? [rung.gap, mod(rung.gap + 1, count)]
                  : [rung.from, rung.to]

              for (const rail of rails) {
                expect(
                  touched.has(rail),
                  `${difficulty} count=${count} seed=${seed} row=${row} rail=${rail} 중복`,
                ).toBe(false)
                touched.add(rail)
              }
            }
          }
        }
      }
    }
  })

  it('관통선은 이웃한 줄을 잇지 않는다', () => {
    for (const count of COUNTS) {
      for (const seed of SEEDS.slice(0, 8)) {
        const ladder = buildLadder(count, 'hell', createRng(seed))

        for (const rungs of ladder.rungs) {
          for (const rung of rungs) {
            if (rung.kind !== 'through') continue
            const apart = Math.min(
              mod(rung.to - rung.from, count),
              mod(rung.from - rung.to, count),
            )
            expect(apart, `count=${count} ${rung.from}->${rung.to}`).toBeGreaterThan(1)
          }
        }
      }
    }
  })

  function countRungs(ladder: Ladder) {
    const all = ladder.rungs.flat()
    return { total: all.length, through: all.filter((r) => r.kind === 'through').length }
  }

  it('난이도가 올라갈수록 촘촘해지고, 쉬움에는 관통선이 없다', () => {
    const counts = DIFFICULTIES.map((difficulty) =>
      countRungs(buildLadder(12, difficulty, createRng(31337))),
    )
    const [easy, normal, hell] = counts

    expect(easy.through).toBe(0)
    expect(normal.through).toBeGreaterThan(0)
    expect(hell.through).toBeGreaterThan(normal.through)
    expect(hell.total).toBeGreaterThan(normal.total * 5)
    expect(normal.total).toBeGreaterThan(easy.total)
  })

  it('행 수는 난이도가 정한 범위를 벗어나지 않는다', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const count of [1, 2, 100]) {
        const rows = rowCountFor(count, difficulty)
        expect(rows).toBeGreaterThan(0)
        expect(buildLadder(count, difficulty, createRng(1)).rungs).toHaveLength(rows)
      }
    }
  })
})

describe('시드 하나로 완전히 재현된다', () => {
  it('같은 입력이면 사다리도 당첨 배치도 똑같다', () => {
    for (const difficulty of DIFFICULTIES) {
      const weights = Array.from({ length: 9 }, (_, i) => weightFor(i % 3))
      const a = planLadder(9, 3, 8675309, weights, difficulty)
      const b = planLadder(9, 3, 8675309, weights, difficulty)

      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    }
  })

  it('시드가 다르면 사다리도 달라진다', () => {
    const weights = Array.from({ length: 9 }, () => 1)
    const a = planLadder(9, 3, 111, weights, 'normal')
    const b = planLadder(9, 3, 222, weights, 'normal')

    expect(JSON.stringify(a.ladder)).not.toBe(JSON.stringify(b.ladder))
  })
})

describe('당첨 배정', () => {
  it('당첨자 수와 당첨 칸 수가 정확히 일치한다', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const count of COUNTS) {
        for (const winCount of [0, 1, Math.floor(count / 2), count]) {
          const weights = Array.from({ length: count }, () => 1)
          const plan = planLadder(count, winCount, 5150, weights, difficulty)

          expect(plan.winners).toHaveLength(winCount)
          expect(new Set(plan.winners).size).toBe(winCount)
          expect(plan.prizeSlots.filter(Boolean)).toHaveLength(winCount)
        }
      }
    }
  })

  it('당첨자가 실제로 당첨 칸에 도착한다', () => {
    const weights = Array.from({ length: 10 }, (_, i) => weightFor(i % 4))
    const plan = planLadder(10, 3, 909090, weights, 'hell')

    for (const winner of plan.winners) {
      expect(plan.prizeSlots[plan.traces[winner].end]).toBe(true)
    }
  })
})

describe('가중추출', () => {
  it('요청한 만큼, 서로 다른 사람을 뽑는다', () => {
    const rng = createRng(2024)
    for (let k = 0; k <= 6; k += 1) {
      const picked = weightedSample([5, 4, 3, 2, 1, 0.5], k, rng)
      expect(picked).toHaveLength(k)
      expect(new Set(picked).size).toBe(k)
    }
  })

  it('가중치가 전부 0이어도 인원을 채운다', () => {
    const picked = weightedSample([0, 0, 0, 0], 3, createRng(7))
    expect(picked).toHaveLength(3)
    expect(new Set(picked).size).toBe(3)
  })

  it('요청 인원이 명단보다 많으면 명단 전체를 준다', () => {
    const picked = weightedSample([1, 1, 1], 10, createRng(7))
    expect(picked).toHaveLength(3)
  })
})
