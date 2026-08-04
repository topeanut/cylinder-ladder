import { describe, expect, it } from 'vitest'
import type { AppState } from './types'
import { buildQuery, hasStateParams, parseQuery } from './query'
import { appendPeople } from './utils'

/**
 * URL이 곧 저장소다. 왕복이 깨지면 공유 링크가 다른 결과를 열게 되고,
 * 그건 이 앱에서 가장 치명적인 종류의 버그다.
 */

function state(partial: Partial<AppState> = {}): AppState {
  return {
    people: appendPeople([], ['철수', '영희', '민수']),
    winCount: 2,
    difficulty: 'normal',
    seed: 1522677205,
    wins: {},
    revealed: false,
    ...partial,
  }
}

/** id는 기기마다 새로 만들어지므로 왕복 비교에서 제외한다. */
function comparable(value: AppState) {
  return {
    names: value.people.map((p) => p.name),
    winCount: value.winCount,
    difficulty: value.difficulty,
    seed: value.seed,
    wins: value.wins,
    revealed: value.revealed,
  }
}

describe('URL 왕복', () => {
  it('상태를 URL로 바꿨다가 되돌리면 그대로다', () => {
    const cases: AppState[] = [
      state(),
      state({ difficulty: 'hell', revealed: true }),
      state({ difficulty: 'easy', winCount: 0 }),
      state({ wins: { 철수: 2, 영희: 1 } }),
      state({ seed: null, revealed: false }),
      state({ people: appendPeople([], ['A B', '가나다', 'ø 특수']) }),
    ]

    for (const original of cases) {
      const restored = parseQuery(buildQuery(original))
      expect(restored, buildQuery(original)).not.toBeNull()
      expect(comparable(restored!)).toEqual(comparable(original))
    }
  })

  it('사다리가 없으면 결과 공개 상태도 살아나지 않는다', () => {
    const restored = parseQuery('?people=철수,영희&win=1&done=1')
    expect(restored?.revealed).toBe(false)
  })

  it('보통 난이도는 URL에 적지 않는다 — 링크를 짧게 유지한다', () => {
    expect(buildQuery(state({ difficulty: 'normal' }))).not.toContain('mode=')
    expect(buildQuery(state({ difficulty: 'hell' }))).toContain('mode=hell')
  })
})

describe('손으로 편집한 URL도 견딘다', () => {
  it('모르는 난이도는 보통으로 떨어진다', () => {
    expect(parseQuery('?people=A,B&mode=아무거나')?.difficulty).toBe('normal')
  })

  it('시드가 숫자가 아니면 사다리 없음으로 본다', () => {
    expect(parseQuery('?people=A,B&seed=hello')?.seed).toBeNull()
    expect(parseQuery('?people=A,B&seed=-5')?.seed).toBeNull()
  })

  it('당첨 인원은 명단 크기를 넘지 않는다', () => {
    expect(parseQuery('?people=A,B&win=99')?.winCount).toBe(2)
    expect(parseQuery('?people=A,B&win=-3')?.winCount).toBe(0)
  })

  it('명단에 없는 사람의 당첨 이력도 버리지 않는다 — 나중에 다시 넣을 수 있다', () => {
    expect(parseQuery('?people=A&wins=B:3')?.wins).toEqual({ B: 3 })
  })

  it('깨진 퍼센트 인코딩에도 죽지 않는다', () => {
    expect(() => parseQuery('?people=%ED%95,B')).not.toThrow()
    expect(parseQuery('?people=%ED%95,B')?.people).toHaveLength(2)
  })

  it('빈 이름과 공백은 걸러진다', () => {
    expect(parseQuery('?people=A,,%20,B')?.people.map((p) => p.name)).toEqual(['A', 'B'])
  })
})

describe('상태가 담긴 URL인지 판별', () => {
  it('people이나 seed가 있어야 URL을 상태의 출처로 삼는다', () => {
    expect(hasStateParams('?people=A')).toBe(true)
    expect(hasStateParams('?seed=1')).toBe(true)
    expect(hasStateParams('?win=2')).toBe(false)
    expect(hasStateParams('')).toBe(false)
  })

  it('상태 파라미터가 없으면 null을 준다 — localStorage로 넘어가야 한다', () => {
    expect(parseQuery('?utm_source=kakao')).toBeNull()
  })
})
