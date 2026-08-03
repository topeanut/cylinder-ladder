import { createRng, weightedSample } from './ladder'

/**
 * 사람마다의 당첨 확률.
 *
 * 당첨자를 한 명만 뽑는다면 확률은 그냥 `가중치 / 가중치 합`이다. 하지만 두 명
 * 이상을 비복원으로 뽑으면 닫힌 식이 없다. 먼저 뽑힌 사람이 빠지면서 남은 사람들의
 * 확률이 매번 달라지기 때문이다. 정확히 계산하려면 사람 수에 지수적으로 비례하는
 * 경우의 수를 훑어야 한다.
 *
 * 그래서 표본으로 추정한다. 실제 추첨과 **똑같은 함수**를 고정 시드로 여러 번 돌려
 * 뽑힌 비율을 센다. 시드가 고정이라 화면에 뜨는 숫자가 흔들리지 않고, 추첨 로직을
 * 나중에 바꿔도 표시 확률이 자동으로 따라온다.
 */

const TRIALS = 20000
/** 추정용 고정 시드. 실제 판의 시드와 무관해야 결과를 예측당하지 않는다. */
const ESTIMATE_SEED = 0x5eed1234

export function winProbabilities(weights: number[], winCount: number): number[] {
  const count = weights.length
  if (count === 0) return []
  if (winCount <= 0) return weights.map(() => 0)
  if (winCount >= count) return weights.map(() => 1)

  // 당첨자가 한 명이면 정확한 값이 있다. 굳이 추정하지 않는다.
  if (winCount === 1) {
    const total = weights.reduce((sum, w) => sum + Math.max(w, 0), 0)
    if (total <= 0) return weights.map(() => 1 / count)
    return weights.map((w) => Math.max(w, 0) / total)
  }

  const hits = new Array<number>(count).fill(0)
  const rng = createRng(ESTIMATE_SEED)

  for (let trial = 0; trial < TRIALS; trial += 1) {
    for (const person of weightedSample(weights, winCount, rng)) hits[person] += 1
  }

  return hits.map((hit) => hit / TRIALS)
}

/** 당첨 이력 한 번마다 가중치가 줄어드는 비율. 한 번 당첨되면 다음 판은 45%. */
const DECAY = 0.45

/** 이미 당첨된 적이 있는 사람일수록 낮은 가중치를 준다. */
export function weightFor(winCount: number): number {
  return Math.pow(DECAY, Math.max(winCount, 0))
}

export function formatPercent(value: number): string {
  if (value <= 0) return '0%'
  if (value >= 1) return '100%'
  // 1% 미만은 소수점을 살려야 0%로 보이지 않는다.
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`
}
