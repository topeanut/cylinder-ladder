import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CurvePath, LineCurve3, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { CYLINDER_HEIGHT } from '../lib/geometry'
import type { Lane } from '../lib/trail'
import { clamp } from '../lib/utils'

/**
 * 사다리를 타는 동안 카메라가 선두를 따라 내려간다.
 *
 * 한 사람만 볼 때는 그 사람의 머리를 쫓아 **원기둥을 함께 돌면서** 내려간다.
 * 관통 가로선을 타고 반대편으로 넘어가면 카메라도 반대편으로 돌아간다.
 * 전원이 동시에 내려갈 때는 방위를 건드리지 않는다. 여섯 명이 사방으로 흩어지는데
 * 카메라까지 돌면 아무것도 눈에 들어오지 않는다.
 */

/** 카메라가 머리보다 얼마나 위를 보는가. 진행 방향이 화면에 남도록 살짝 위다. */
const EYE_LIFT = 0.55
/** 목표 지점을 향해 매 프레임 좁히는 비율. 낮을수록 부드럽고 늦게 따라온다. */
const FOLLOW_EASE = 0.06
const RETURN_EASE = 0.035

interface CinematicCameraProps {
  active: boolean
  lanes: Lane[]
  activeIndex: number | null
  /** 경로를 거슬러 올라가는 중인지. 카메라도 같은 방향으로 움직여야 한다. */
  reverse: boolean
}

export function CinematicCamera({
  active,
  lanes,
  activeIndex,
  reverse,
}: CinematicCameraProps) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null

  /** 쫓아갈 경로. 전원 재생일 때는 첫 번째 사람을 대표로 삼는다. */
  const lane = useMemo(() => {
    if (lanes.length === 0) return null
    if (activeIndex !== null) {
      return lanes.find((item) => item.personIndex === activeIndex) ?? null
    }
    return lanes[0]
  }, [lanes, activeIndex])

  const curve = useMemo(() => {
    if (!lane) return null
    const points = reverse ? [...lane.points].reverse() : lane.points

    const path = new CurvePath<Vector3>()
    for (let i = 1; i < points.length; i += 1) {
      if (points[i].distanceToSquared(points[i - 1]) < 1e-8) continue
      path.add(new LineCurve3(points[i - 1], points[i]))
    }
    return path.curves.length > 0 ? path : null
  }, [lane, reverse])

  const elapsedRef = useRef(0)
  const head = useMemo(() => new Vector3(), [])
  const desired = useMemo(() => new Vector3(), [])

  // 재생이 시작되는 순간의 거리를 기억해 두고 그 거리를 유지한다.
  const distance = useRef(11)
  const wasActive = useRef(false)

  useFrame((_, delta) => {
    if (!controls) return

    if (!active) {
      elapsedRef.current = 0
      wasActive.current = false
      // 재생이 끝나면 원래 눈높이로 천천히 돌아온다.
      if (Math.abs(controls.target.y) > 0.01) {
        controls.target.y += (0 - controls.target.y) * RETURN_EASE
        controls.update()
      }
      return
    }

    if (!curve || !lane) return

    if (!wasActive.current) {
      wasActive.current = true
      elapsedRef.current = 0
      distance.current = clamp(camera.position.distanceTo(controls.target), 7, 13)
    }

    elapsedRef.current += delta * 1000
    const t = clamp((elapsedRef.current - lane.delayMs) / Math.max(lane.durationMs, 1), 0, 1)
    if (t <= 0) return

    curve.getPointAt(t, head)

    // 목표: 머리 높이를 보되, 시선은 원기둥 중심축에 둔다.
    const targetY = clamp(head.y, -CYLINDER_HEIGHT / 2, CYLINDER_HEIGHT / 2)
    controls.target.y += (targetY - controls.target.y) * FOLLOW_EASE

    // 한 사람을 쫓을 때만 그 사람이 있는 방향으로 카메라를 옮긴다.
    if (activeIndex !== null) {
      const azimuth = Math.atan2(head.x, head.z)
      desired.set(
        Math.sin(azimuth) * distance.current,
        targetY + EYE_LIFT,
        Math.cos(azimuth) * distance.current,
      )
    } else {
      // 전원 재생: 높이만 따라가고 방위는 지금 보고 있는 쪽을 유지한다.
      const azimuth = Math.atan2(camera.position.x, camera.position.z)
      desired.set(
        Math.sin(azimuth) * distance.current,
        targetY + EYE_LIFT,
        Math.cos(azimuth) * distance.current,
      )
    }

    camera.position.lerp(desired, FOLLOW_EASE)
    controls.update()
  })

  return null
}
