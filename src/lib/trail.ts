import { Vector3 } from 'three'
import type { LadderPlan } from './ladder'
import type { LadderGeometry } from './geometry'

/** 경로가 그려지는 속도(월드 단위/초). */
const TRAVEL_SPEED = 2.2
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

    // 길이를 알아야 "일정한 속도로 내려간다"는 느낌을 만들 수 있다.
    let length = 0
    for (let i = 1; i < points.length; i += 1) {
      length += points[i].distanceTo(points[i - 1])
    }

    return {
      personIndex,
      points,
      delayMs: personIndex * PERSON_STAGGER_MS,
      durationMs: (length / TRAVEL_SPEED) * 1000,
    }
  })
}

/** 주어진 경로들이 모두 그려지기까지 걸리는 시간(ms). */
export function totalPlayMs(lanes: Lane[]): number {
  return lanes.reduce((max, lane) => Math.max(max, lane.delayMs + lane.durationMs), 0)
}
