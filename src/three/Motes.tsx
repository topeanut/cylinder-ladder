import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, type Points } from 'three'
import type { Difficulty } from '../lib/types'
import { CYLINDER_HEIGHT } from '../lib/geometry'

/**
 * 공중에 떠다니는 입자.
 *
 * 지옥에서는 불티가 위로 솟고, 쉬움에서는 꽃가루가 천천히 흩날린다.
 * 바닥 셰이더만으로는 공간이 납작해 보이는데, 원기둥과 카메라 사이에 입자가
 * 떠 있으면 깊이가 생긴다.
 */

const COUNT = 220
const FIELD = 16
const BOTTOM = -CYLINDER_HEIGHT / 2 - 1
const TOP = CYLINDER_HEIGHT / 2 + 5

interface MoteStyle {
  color: string
  size: number
  /** 초당 상승 속도. 음수면 내려온다. */
  rise: number
  drift: number
}

const STYLES: Partial<Record<Difficulty, MoteStyle>> = {
  hell: { color: '#ff7a2f', size: 0.075, rise: 1.15, drift: 0.35 },
  easy: { color: '#c9f5a0', size: 0.055, rise: -0.22, drift: 0.5 },
}

export function Motes({ difficulty }: { difficulty: Difficulty }) {
  const style = STYLES[difficulty]

  const pointsRef = useRef<Points>(null)
  const elapsed = useRef(0)

  /** 입자마다의 시작 위치와 흔들림 위상. 매 렌더 새로 뽑으면 튀므로 한 번만 만든다. */
  const seeds = useMemo(() => {
    const positions = new Float32Array(COUNT * 3)
    const phases = new Float32Array(COUNT)
    const speeds = new Float32Array(COUNT)

    for (let i = 0; i < COUNT; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * FIELD
      positions[i * 3 + 1] = BOTTOM + Math.random() * (TOP - BOTTOM)
      positions[i * 3 + 2] = (Math.random() - 0.5) * FIELD
      phases[i] = Math.random() * Math.PI * 2
      speeds[i] = 0.6 + Math.random() * 0.8
    }

    return { positions, phases, speeds }
  }, [])

  const geometry = useMemo(() => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(seeds.positions.slice(), 3))
    return geo
  }, [seeds])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((_, delta) => {
    if (!style) return
    elapsed.current += delta

    const attribute = geometry.getAttribute('position') as BufferAttribute
    const array = attribute.array as Float32Array

    for (let i = 0; i < COUNT; i += 1) {
      const y = i * 3 + 1
      array[y] += style.rise * seeds.speeds[i] * delta

      // 위(또는 아래)로 빠져나가면 반대편에서 다시 들어온다.
      if (style.rise > 0 && array[y] > TOP) array[y] = BOTTOM
      if (style.rise < 0 && array[y] < BOTTOM) array[y] = TOP

      // 좌우로 살랑이는 흔들림. 위치를 누적하지 않고 사인값을 더해 제자리를 지킨다.
      const wobble = Math.sin(elapsed.current * 0.6 + seeds.phases[i]) * style.drift * delta
      array[i * 3] += wobble
      array[i * 3 + 2] += wobble * 0.6
    }

    attribute.needsUpdate = true
  })

  if (!style) return null

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color={style.color}
        size={style.size}
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}
