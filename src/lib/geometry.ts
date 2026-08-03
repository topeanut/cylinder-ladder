import { Vector3 } from 'three'
import { clamp } from './utils'

/**
 * 원기둥 사다리의 3D 월드 좌표 계산.
 *
 * 축은 Y(위). 방위각 0은 +Z, 즉 카메라 정면이다.
 *
 *        위에서 내려다본 단면
 *          rail i      rail i+1
 *             ●────────●        ← 가로선 = 현, 길이 = 2R·sin(θ/2)
 *              ╲      ╱
 *               ╲ θ  ╱          θ = 세로줄 사이 각도 = 2π/N
 *                ╲  ╱
 *                 ●  중심축
 */

/** 원기둥의 높이(월드 단위). */
export const CYLINDER_HEIGHT = 5.6
/** 이웃한 세로줄 사이에 두고 싶은 간격. */
const DESIRED_CHORD = 0.72
const MIN_RADIUS = 1.5
const MAX_RADIUS = 4.4

export interface LadderGeometry {
  count: number
  rows: number
  radius: number
  /** 가로선의 길이. */
  chord: number
  /** 세로줄 i의 방위각(라디안). */
  azimuth: (index: number) => number
  /** 세로줄 i 위, 높이 y인 점. */
  railPoint: (index: number, y: number) => Vector3
  /** 행 번호를 높이로. -1은 맨 위, rows는 맨 아래. */
  rowY: (row: number) => number
}

export function computeGeometry(count: number, rows: number): LadderGeometry {
  const safeCount = Math.max(count, 1)
  const half = Math.PI / safeCount

  // 원하는 간격을 만들어 주는 반지름. 인원이 적으면 너무 작아지므로 하한을 둔다.
  const radius =
    safeCount < 2
      ? MIN_RADIUS
      : clamp(DESIRED_CHORD / (2 * Math.sin(half)), MIN_RADIUS, MAX_RADIUS)

  const azimuth = (index: number) => (index * 2 * Math.PI) / safeCount
  const top = CYLINDER_HEIGHT / 2

  return {
    count: safeCount,
    rows,
    radius,
    chord: 2 * radius * Math.sin(half),
    azimuth,
    railPoint: (index, y) => {
      const a = azimuth(index)
      return new Vector3(Math.sin(a) * radius, y, Math.cos(a) * radius)
    },
    rowY: (row) => {
      if (row < 0) return top
      if (row >= rows) return -top
      return top - ((row + 1) * CYLINDER_HEIGHT) / (rows + 1)
    },
  }
}

/**
 * 사람마다 구분되는 색. 47도씩 건너뛰어 인접한 사람끼리 색이 겹치지 않는다.
 * three.js의 Color가 파싱할 수 있도록 쉼표 형식으로 쓴다.
 */
export function personColor(index: number): string {
  return `hsl(${(index * 47) % 360}, 92%, 62%)`
}

/** 가로선이 하나씩 꽂히는 간격(ms). */
export const RUNG_STAGGER_MS = 34

/**
 * 가로선 하나가 날아드는 시각.
 * 화면 애니메이션과 효과음이 같은 식을 써야 소리와 그림이 어긋나지 않는다.
 */
export function rungDelayMs(row: number, orderInRow: number): number {
  return (row * 2 + orderInRow) * RUNG_STAGGER_MS
}
