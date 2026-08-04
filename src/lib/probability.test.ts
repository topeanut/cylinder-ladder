import { describe, expect, it } from 'vitest'
import { formatPercent, weightFor, winProbabilities } from './probability'

/**
 * 화면에 뜨는 확률이 실제 추첨과 어긋나면 앱 전체의 신뢰가 무너진다.
 * 특히 당첨이 두 명 이상이면 몬테카를로 추정이라, 추정이 맞는지 확인해야 한다.
 */

/** 비복원으로 k명을 뽑으므로, 모든 사람의 확률을 더하면 정확히 k가 되어야 한다. */
function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

describe('확률의 합', () => {
  it('언제나 당첨 인원 수와 같다', () => {
    for (const count of [2, 3, 5, 8, 13]) {
      for (let winCount = 0; winCount <= count; winCount += 1) {
        const weights = Array.from({ length: count }, (_, i) => weightFor(i % 4))
        const probabilities = winProbabilities(weights, winCount)

        // 몬테카를로 추정이 섞이므로 약간의 오차를 허용한다.
        expect(sum(probabilities), `count=${count} win=${winCount}`).toBeCloseTo(winCount, 1)
      }
    }
  })

  it('모든 확률은 0과 1 사이다', () => {
    const weights = [1, 0.45, 0.2, 0.09, 1, 1]
    for (const winCount of [1, 2, 3]) {
      for (const p of winProbabilities(weights, winCount)) {
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('가중치와 확률의 관계', () => {
  it('당첨 이력이 많을수록 가중치가 낮아진다', () => {
    const weights = [0, 1, 2, 3, 4].map(weightFor)
    for (let i = 1; i < weights.length; i += 1) {
      expect(weights[i]).toBeLessThan(weights[i - 1])
      expect(weights[i]).toBeGreaterThan(0)
    }
  })

  it('가중치가 낮은 사람은 확률도 낮다', () => {
    const weights = [1, 0.45, 0.2025]
    for (const winCount of [1, 2]) {
      const p = winProbabilities(weights, winCount)
      expect(p[0]).toBeGreaterThan(p[1])
      expect(p[1]).toBeGreaterThan(p[2])
    }
  })

  it('당첨 한 명일 때는 추정이 아니라 정확한 값을 쓴다', () => {
    const weights = [1, 0.45, 0.2025]
    const total = sum(weights)
    const p = winProbabilities(weights, 1)

    // 오차 없이 정확히 일치해야 한다(몬테카를로를 타지 않는 경로).
    expect(p[0]).toBe(weights[0] / total)
    expect(p[2]).toBe(weights[2] / total)
  })

  it('가중치가 같으면 확률도 같다', () => {
    const p = winProbabilities([1, 1, 1, 1, 1, 1], 2)
    for (const value of p) expect(value).toBeCloseTo(2 / 6, 2)
  })

  it('전원 당첨이면 모두 100%, 아무도 안 뽑으면 모두 0%', () => {
    expect(winProbabilities([1, 0.2, 3], 3)).toEqual([1, 1, 1])
    expect(winProbabilities([1, 0.2, 3], 0)).toEqual([0, 0, 0])
  })

  it('추정은 매번 같은 값을 준다 — 화면 숫자가 흔들리면 안 된다', () => {
    const weights = [1, 0.45, 1, 0.2025, 1]
    expect(winProbabilities(weights, 2)).toEqual(winProbabilities(weights, 2))
  })
})

describe('확률 표기', () => {
  it('1% 미만도 0%로 뭉개지 않는다', () => {
    expect(formatPercent(0.004)).toBe('0.4%')
    expect(formatPercent(0.066)).toBe('6.6%')
  })

  it('10% 이상은 정수로 줄인다', () => {
    expect(formatPercent(0.305)).toBe('31%')
  })

  it('경계값', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(1)).toBe('100%')
  })
})
