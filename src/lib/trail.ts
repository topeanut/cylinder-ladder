import { Vector3 } from 'three'
import type { LadderPlan } from './ladder'
import type { LadderGeometry } from './geometry'

/**
 * 사다리를 처음부터 끝까지 타는 데 걸리는 시간(ms).
 *
 * 속도가 아니라 **시간**을 고정한다. 그래야 지옥처럼 경로가 열 배 길어져도
 * 재생 시간이 그대로고, 대신 내려가는 속도가 저절로 빨라진다. 속도를 고정하면
 * 지옥에서 1분 넘게 기다려야 한다.
 */
export const TARGET_PLAY_MS = 7000
/** 사람마다 출발을 조금씩 어긋나게 해 여러 줄이 겹쳐 흐르게 한다. */
const PERSON_STAGGER_MS = 130
/** 트레일이 세로줄보다 얼마나 바깥에 떠 있는가. */
const TRAIL_LIFT = 0.05

/** 이 지점까지는 균일한 속도로 내려간다. 남은 구간이 슬로모션이 된다. */
const SLOWDOWN_KNEE = 0.8
/** 균일 구간이 담당하는 경로 비율. 나머지 10%를 남은 20% 시간에 천천히 간다. */
const SLOWDOWN_REACH = 0.9

/**
 * 재생 진행률을 경로 진행률로 바꾼다.
 *
 * 7초 내내 같은 속도면 클라이맥스가 없다. 80%까지는 균일하게 내려가다가,
 * 남은 20% 시간 동안 마지막 10% 구간만 천천히 짚는다. 결과 칸에 닿기 직전이
 * 눈에 띄게 느려지는 이유다. 도착 시각(t=1)은 그대로라 전체 길이는 변하지 않는다.
 */
export function playEase(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  if (t < SLOWDOWN_KNEE) return (t / SLOWDOWN_KNEE) * SLOWDOWN_REACH

  const tail = (t - SLOWDOWN_KNEE) / (1 - SLOWDOWN_KNEE)
  return SLOWDOWN_REACH + (1 - SLOWDOWN_REACH) * (1 - Math.pow(1 - tail, 2.4))
}

export interface Lane {
  personIndex: number
  points: Vector3[]
  /**
   * 가로선을 건너는 순간들. 경로 전체 길이 대비 위치(0~1)다.
   *
   * 트레일 셰이더의 진행률과 같은 척도라, 진행률이 이 값을 지나가는 순간
   * 소리를 내면 화면과 소리가 정확히 맞는다.
   */
  crossings: number[]
  delayMs: number
  durationMs: number
}

/**
 * 각 사람의 경로를 3D 점열로 펼친다.
 *
 * 화면(LadderRig)과 재생 시간 계산(App)이 같은 결과를 써야 소리·색종이 타이밍이
 * 그림과 맞는다. 그래서 계산을 여기 한 곳에 둔다.
 */
export function buildLanes(
  plan: LadderPlan,
  geo: LadderGeometry,
  /** 0이면 원기둥 위, 1이면 펼친 평면 위에 그린다. */
  unfold = 0,
): Lane[] {
  const lift = TRAIL_LIFT / Math.max(geo.radius, 0.001)

  /**
   * 세로줄보다 아주 살짝 바깥에 띄운다.
   * 원기둥에서는 반지름을 키우고, 펼친 평면에서는 카메라 쪽(z)으로 민다.
   */
  const pointOn = (railIndex: number, y: number) => {
    const base = geo.blendPoint(railIndex, y, unfold)
    return unfold < 0.5
      ? base.multiply(new Vector3(1 + lift, 1, 1 + lift))
      : base.add(new Vector3(0, 0, TRAIL_LIFT))
  }

  // 마지막 사람이 정확히 TARGET_PLAY_MS에 도착하도록 공통 소요 시간을 역산한다.
  const lastStart = Math.max(0, (plan.traces.length - 1) * PERSON_STAGGER_MS)
  const durationMs = Math.max(600, TARGET_PLAY_MS - lastStart)

  return plan.traces.map((trace, personIndex) => {
    const points: Vector3[] = []
    /** 가로선을 다 건넌 지점까지의 누적 길이. 나중에 전체 길이로 나눈다. */
    const crossedAt: number[] = []
    let length = 0

    const push = (point: Vector3, isCrossing = false) => {
      const previous = points[points.length - 1]
      if (previous) length += point.distanceTo(previous)
      points.push(point)
      if (isCrossing) crossedAt.push(length)
    }

    for (const segment of trace.segments) {
      if (segment.kind === 'rail') {
        push(pointOn(segment.rail, geo.rowY(segment.fromRow)))
        push(pointOn(segment.rail, geo.rowY(segment.toRow)))
      } else {
        // 이웃으로 건너가든 원통을 관통하든, 도착한 줄의 같은 높이로 직선을 그으면 된다.
        push(pointOn(segment.to, geo.rowY(segment.row)), true)
      }
    }

    return {
      personIndex,
      points,
      crossings: length > 0 ? crossedAt.map((at) => at / length) : [],
      delayMs: personIndex * PERSON_STAGGER_MS,
      durationMs,
    }
  })
}

/** 주어진 경로들이 모두 그려지기까지 걸리는 시간(ms). */
export function totalPlayMs(lanes: Lane[]): number {
  return lanes.reduce((max, lane) => Math.max(max, lane.delayMs + lane.durationMs), 0)
}
