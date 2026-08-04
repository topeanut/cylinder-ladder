import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { CYLINDER_HEIGHT } from '../lib/geometry'

/**
 * 명단이 비었을 때 도는 빈 원기둥.
 *
 * 아무것도 없는 검은 화면은 "여기서 뭐가 일어나는지" 아무 말도 하지 않는다.
 * 실제 사다리와 같은 형태를 흐릿하게 세워 두고 천천히 돌리면, 이름을 넣기 전에도
 * 무엇을 만들게 되는지 한눈에 전해진다.
 */

const RAILS = 7
const RADIUS = 1.9
/** 예시로 걸어 둘 가로선. 무작위가 아니라 고정이라 매번 같은 모양이다. */
const SAMPLE_RUNGS: Array<[rail: number, row: number]> = [
  [0, 1],
  [2, 2],
  [4, 3],
  [1, 5],
  [5, 6],
  [3, 8],
]
const SAMPLE_ROWS = 10

export function GhostRig() {
  const groupRef = useRef<Group>(null)

  const layout = useMemo(() => {
    const step = (2 * Math.PI) / RAILS
    const half = Math.PI / RAILS
    const top = CYLINDER_HEIGHT / 2

    return {
      rails: Array.from({ length: RAILS }, (_, i) => ({
        position: [Math.sin(i * step) * RADIUS, 0, Math.cos(i * step) * RADIUS] as const,
      })),
      rungs: SAMPLE_RUNGS.map(([rail, row]) => {
        const azimuth = rail * step + half
        const depth = RADIUS * Math.cos(half)
        return {
          position: [
            Math.sin(azimuth) * depth,
            top - ((row + 1) * CYLINDER_HEIGHT) / (SAMPLE_ROWS + 1),
            Math.cos(azimuth) * depth,
          ] as const,
          rotation: [0, azimuth, Math.PI / 2] as const,
          length: 2 * RADIUS * Math.sin(half),
        }
      }),
    }
  }, [])

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.16
  })

  return (
    <group ref={groupRef}>
      {layout.rails.map((rail, i) => (
        <mesh key={i} position={rail.position}>
          <cylinderGeometry args={[0.018, 0.018, CYLINDER_HEIGHT, 8]} />
          <meshStandardMaterial
            color="#6b7280"
            metalness={0.9}
            roughness={0.4}
            transparent
            opacity={0.42}
          />
        </mesh>
      ))}

      {layout.rungs.map((rung, i) => (
        <mesh key={i} position={rung.position} rotation={rung.rotation}>
          <cylinderGeometry args={[0.022, 0.022, rung.length, 8]} />
          <meshStandardMaterial
            color="#9ca3af"
            metalness={0.9}
            roughness={0.35}
            transparent
            opacity={0.32}
          />
        </mesh>
      ))}
    </group>
  )
}
