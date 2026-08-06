import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CurvePath, LineCurve3, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { CYLINDER_HEIGHT } from '../lib/geometry'
import { playEase, type Lane } from '../lib/trail'
import type { PlayClock } from '../lib/playClock'
import { clamp } from '../lib/utils'

/**
 * 사다리를 타는 동안 카메라가 선두를 따라 내려간다.
 *
 * 한 사람만 볼 때는 그 사람의 머리를 쫓아 **원기둥을 함께 돌면서** 내려간다.
 * 관통 가로선을 타고 반대편으로 넘어가면 카메라도 반대편으로 돌아간다.
 * 전원이 동시에 내려갈 때는 방위를 건드리지 않는다. 여섯 명이 사방으로 흩어지는데
 * 카메라까지 돌면 아무것도 눈에 들어오지 않는다.
 *
 * 사용자가 화면을 직접 움직이면 그 순간부터 추적을 멈춘다. 보고 싶은 곳이 따로
 * 있는데 카메라가 계속 끌고 가면 싸움이 된다. 한 번 손을 대면 이번 재생이 끝날
 * 때까지 조종권은 사용자에게 있다.
 */

/** 카메라가 머리보다 얼마나 위를 보는가. 진행 방향이 화면에 남도록 살짝 위다. */
const EYE_LIFT = 0.55
/** 목표 지점을 향해 매 프레임 좁히는 비율. 낮을수록 부드럽고 늦게 따라온다. */
const FOLLOW_EASE = 0.06
const RETURN_EASE = 0.035
/** 막판에 카메라가 파고드는 정도. 0.62면 거리를 62%까지 좁힌다. */
const CLIMAX_ZOOM = 0.62

/** 두 경계 사이를 0에서 1로 부드럽게 잇는다. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

interface CinematicCameraProps {
  active: boolean
  lanes: Lane[]
  activeIndex: number | null
  /** 경로를 거슬러 올라가는 중인지. 카메라도 같은 방향으로 움직여야 한다. */
  reverse: boolean
  clock: { current: PlayClock }
}

export function CinematicCamera({
  active,
  lanes,
  activeIndex,
  reverse,
  clock,
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

  const head = useMemo(() => new Vector3(), [])
  const desired = useMemo(() => new Vector3(), [])

  // 재생이 시작되는 순간의 거리를 기억해 두고 그 거리를 유지한다.
  const distance = useRef(11)
  const wasActive = useRef(false)

  /**
   * 사용자가 카메라를 직접 만졌는지.
   *
   * OrbitControls의 'start'는 포인터·휠 입력에서만 발생한다. 우리가 부르는
   * controls.update()로는 발생하지 않으므로, "내가 만졌다"와 "코드가 움직였다"를
   * 정확히 가를 수 있다.
   */
  const handedOver = useRef(false)

  useEffect(() => {
    if (!controls) return
    const onUserGrab = () => {
      handedOver.current = true
    }
    controls.addEventListener('start', onUserGrab)
    return () => controls.removeEventListener('start', onUserGrab)
  }, [controls])

  useFrame(() => {
    if (!controls) return

    if (!active) {
      wasActive.current = false
      // 재생이 끝났으면 원래 눈높이로 천천히 돌아온다.
      // 단, 사용자가 직접 잡아 둔 시점이라면 그 자리를 그대로 존중한다.
      if (!handedOver.current && Math.abs(controls.target.y) > 0.01) {
        controls.target.y += (0 - controls.target.y) * RETURN_EASE
        controls.update()
      }
      return
    }

    if (!curve || !lane) return

    if (!wasActive.current) {
      wasActive.current = true
      // 새 재생이 시작되면 조종권을 다시 카메라가 가져온다.
      handedOver.current = false
      distance.current = clamp(camera.position.distanceTo(controls.target), 7, 13)
    }

    // 사용자가 화면을 잡았으면 더 이상 끌고 가지 않는다.
    if (handedOver.current) return

    const raw = clamp(
      (clock.current.elapsed - lane.delayMs) / Math.max(lane.durationMs, 1),
      0,
      1,
    )
    if (raw <= 0) return

    // 트레일과 같은 곡선을 써야 카메라가 선두를 정확히 따라간다.
    const t = playEase(raw)
    curve.getPointAt(t, head)

    // 막판 슬로모션 구간에서 카메라가 결과 칸 쪽으로 파고든다.
    const closeIn = 1 - (1 - CLIMAX_ZOOM) * smoothstep(0.78, 1, raw)
    const reach = distance.current * closeIn

    // 목표: 머리 높이를 보되, 시선은 원기둥 중심축에 둔다.
    const targetY = clamp(head.y, -CYLINDER_HEIGHT / 2, CYLINDER_HEIGHT / 2)
    controls.target.y += (targetY - controls.target.y) * FOLLOW_EASE

    // 한 사람을 쫓을 때만 그 사람이 있는 방향으로 카메라를 옮긴다.
    if (activeIndex !== null) {
      const azimuth = Math.atan2(head.x, head.z)
      desired.set(Math.sin(azimuth) * reach, targetY + EYE_LIFT, Math.cos(azimuth) * reach)
    } else {
      // 전원 재생: 높이만 따라가고 방위는 지금 보고 있는 쪽을 유지한다.
      const azimuth = Math.atan2(camera.position.x, camera.position.z)
      desired.set(Math.sin(azimuth) * reach, targetY + EYE_LIFT, Math.cos(azimuth) * reach)
    }

    camera.position.lerp(desired, FOLLOW_EASE)
    controls.update()
  })

  return null
}
