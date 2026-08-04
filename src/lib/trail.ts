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

export interface Lane {
  personIndex: number
  points: Vector3[]
  delayMs: number
  durationMs: number
}

/**
 * 각 사람의 경로를 3D 점열로 펼친다.
 *
 * 화면(LadderRig)과 재생 시간 계산(App)이 같은 결과를 써야 소리·색종이 타이밍이
 * 그림과 맞는다. 그래서 계산을 여기 한 곳에 둔다.
 */
export function buildLanes(plan: LadderPlan, geo: LadderGeometry): Lane[] {
  const lift = geo.radius + TRAIL_LIFT

  const pointOn = (railIndex: number, y: number) => {
    const a = geo.azimuth(railIndex)
    return new Vector3(Math.sin(a) * lift, y, Math.cos(a) * lift)
  }

  // 마지막 사람이 정확히 TARGET_PLAY_MS에 도착하도록 공통 소요 시간을 역산한다.
  const lastStart = Math.max(0, (plan.traces.length - 1) * PERSON_STAGGER_MS)
  const durationMs = Math.max(600, TARGET_PLAY_MS - lastStart)

  return plan.traces.map((trace, personIndex) => {
    const points: Vector3[] = []

    for (const segment of trace.segments) {
      if (segment.kind === 'rail') {
        points.push(pointOn(segment.rail, geo.rowY(segment.fromRow)))
        points.push(pointOn(segment.rail, geo.rowY(segment.toRow)))
      } else {
        // 이웃으로 건너가든 원통을 관통하든, 도착한 줄의 같은 높이로 직선을 그으면 된다.
        points.push(pointOn(segment.to, geo.rowY(segment.row)))
      }
    }

    return {
      personIndex,
      points,
      delayMs: personIndex * PERSON_STAGGER_MS,
      durationMs,
    }
  })
}

/** 주어진 경로들이 모두 그려지기까지 걸리는 시간(ms). */
export function totalPlayMs(lanes: Lane[]): number {
  return lanes.reduce((max, lane) => Math.max(max, lane.delayMs + lane.durationMs), 0)
}
