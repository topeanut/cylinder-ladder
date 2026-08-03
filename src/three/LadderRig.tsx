import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import {
  CatmullRomCurve3,
  Quaternion,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Mesh,
} from 'three'
import type { LadderPlan } from '../lib/ladder'
import type { Person } from '../lib/types'
import { CYLINDER_HEIGHT, computeGeometry, personColor, rungDelayMs } from '../lib/geometry'
import { buildLanes } from '../lib/trail'
import { clamp, cn, mod } from '../lib/utils'

const RUNG_FLY_MS = 620
const UP = new Vector3(0, 1, 0)

/** 위치에서 유도하는 결정적 난수. 리렌더마다 값이 바뀌면 연출이 튄다. */
function hash(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export interface LadderRigProps {
  people: Person[]
  plan: LadderPlan | null
  revealed: boolean
  buildToken: number
  playToken: number
  activeIndex: number | null
  instant: boolean
  onSelectPerson: (index: number) => void
}

function LadderRigImpl({
  people,
  plan,
  revealed,
  buildToken,
  playToken,
  activeIndex,
  instant,
  onSelectPerson,
}: LadderRigProps) {
  const count = people.length
  const rows = plan?.ladder.rows ?? 0
  const geo = useMemo(() => computeGeometry(count, rows), [count, rows])
  const top = CYLINDER_HEIGHT / 2

  /**
   * 경로는 "탄 뒤"에만 존재한다.
   * 미리 그려 두면 아직 타지도 않았는데 결과가 새어 나간다.
   */
  const showTrails = instant || playToken > 0

  const lanes = useMemo(() => (plan ? buildLanes(plan, geo) : []), [geo, plan])

  if (count === 0) return null

  return (
    <group>
      {/* 세로줄 */}
      {people.map((person, index) => (
        <mesh key={person.id} position={geo.railPoint(index, 0)}>
          <cylinderGeometry args={[0.024, 0.024, CYLINDER_HEIGHT, 12]} />
          <meshStandardMaterial color="#c9ced6" metalness={0.98} roughness={0.24} />
        </mesh>
      ))}

      {/* 가로선 — 사다리를 새로 짤 때마다 사방에서 날아와 꽂힌다 */}
      {plan &&
        plan.ladder.rungs.flatMap((gaps, row) =>
          gaps.map((gap, orderInRow) => (
            <Rung
              key={`${buildToken}-${row}-${gap}`}
              from={geo.railPoint(gap, geo.rowY(row))}
              to={geo.railPoint(mod(gap + 1, geo.count), geo.rowY(row))}
              delayMs={instant ? 0 : rungDelayMs(row, orderInRow)}
              instant={instant}
              seed={row * 31 + gap * 17}
            />
          )),
        )}

      {/* 지나간 길 */}
      {plan &&
        showTrails &&
        lanes
          .filter((lane) => activeIndex === null || lane.personIndex === activeIndex)
          .map((lane) => (
            <Trail
              key={`${playToken}-${activeIndex ?? 'all'}-${lane.personIndex}`}
              points={lane.points}
              color={personColor(lane.personIndex)}
              delayMs={lane.delayMs}
              durationMs={lane.durationMs}
              instant={instant}
            />
          ))}

      {/* 이름표 */}
      {people.map((person, index) => (
        <FacingLabel
          key={person.id}
          azimuth={geo.azimuth(index)}
          position={geo.railPoint(index, top + 0.5)}
        >
          <button
            type="button"
            onClick={() => onSelectPerson(index)}
            className={cn(
              'flex max-w-[9rem] min-w-[4.5rem] items-center justify-center rounded-xl border-2 px-3 py-1.5',
              'bg-neutral-950/85 text-[13px] font-bold whitespace-nowrap text-neutral-50 backdrop-blur',
              'shadow-lg transition-transform hover:scale-105',
              activeIndex !== null && activeIndex !== index && 'opacity-40',
            )}
            style={{ borderColor: personColor(index) }}
          >
            <span className="truncate">{person.name}</span>
          </button>
        </FacingLabel>
      ))}

      {/* 결과표 */}
      {plan &&
        plan.prizeSlots.map((isWin, index) => (
          <FacingLabel
            key={index}
            azimuth={geo.azimuth(index)}
            position={geo.railPoint(index, -top - 0.5)}
          >
            <div
              className={cn(
                'flex min-w-[3.5rem] items-center justify-center rounded-xl px-3 py-1.5',
                'text-[13px] font-extrabold whitespace-nowrap backdrop-blur transition-colors',
                !revealed && 'bg-neutral-800/80 text-neutral-400',
                revealed && isWin && 'bg-amber-500 text-neutral-950 shadow-[0_0_22px_rgba(245,158,11,0.75)]',
                revealed && !isWin && 'bg-neutral-800/80 text-neutral-500',
              )}
            >
              {revealed ? (isWin ? '당첨' : '꽝') : '?'}
            </div>
          </FacingLabel>
        ))}
    </group>
  )
}

/* ── 가로선 ─────────────────────────────────────────────────── */

function Rung({
  from,
  to,
  delayMs,
  instant,
  seed,
}: {
  from: Vector3
  to: Vector3
  delayMs: number
  instant: boolean
  seed: number
}) {
  const ref = useRef<Mesh>(null)

  const target = useMemo(() => {
    const middle = from.clone().add(to).multiplyScalar(0.5)
    const direction = to.clone().sub(from)
    return {
      middle,
      length: direction.length(),
      quaternion: new Quaternion().setFromUnitVectors(UP, direction.clone().normalize()),
    }
  }, [from, to])

  /** 어디서 날아올지. 방위를 흩뜨려 사방에서 모여드는 그림을 만든다. */
  const launch = useMemo(() => {
    const angle = hash(seed) * Math.PI * 2
    const lift = (hash(seed + 7) - 0.5) * 6
    const distance = 7 + hash(seed + 13) * 5
    return {
      position: new Vector3(
        Math.sin(angle) * distance,
        target.middle.y + lift,
        Math.cos(angle) * distance,
      ),
      quaternion: new Quaternion().setFromAxisAngle(
        new Vector3(hash(seed + 3), hash(seed + 5), hash(seed + 11)).normalize(),
        hash(seed + 17) * Math.PI * 2,
      ),
    }
  }, [seed, target.middle.y])

  const startedAt = useRef(0)

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    if (startedAt.current === 0) startedAt.current = clock.elapsedTime

    const elapsed = (clock.elapsedTime - startedAt.current) * 1000
    const t = instant ? 1 : clamp((elapsed - delayMs) / RUNG_FLY_MS, 0, 1)
    const eased = easeOutCubic(t)

    mesh.position.lerpVectors(launch.position, target.middle, eased)
    mesh.quaternion.slerpQuaternions(launch.quaternion, target.quaternion, eased)
    mesh.scale.setScalar(t === 0 ? 0.001 : 0.35 + 0.65 * eased)
    mesh.visible = t > 0
  })

  return (
    <mesh ref={ref} visible={false}>
      <cylinderGeometry args={[0.032, 0.032, target.length, 12]} />
      <meshStandardMaterial color="#e8eaee" metalness={0.95} roughness={0.18} />
    </mesh>
  )
}

/* ── 지나간 길 ──────────────────────────────────────────────── */

function Trail({
  points,
  color,
  delayMs,
  durationMs,
  instant,
}: {
  points: Vector3[]
  color: string
  delayMs: number
  durationMs: number
  instant: boolean
}) {
  /**
   * 튜브를 통째로 만들어 두고 인덱스의 draw range만 늘려 간다.
   * TubeGeometry의 인덱스는 길이 방향으로 생성되므로, 앞에서부터 잘라 그리면
   * 정확히 "그려지며 내려가는" 그림이 된다. 매 프레임 지오메트리를 다시
   * 만들지 않으므로 사람이 많아도 부담이 없다.
   */
  const geometry = useMemo(() => {
    const curve = new CatmullRomCurve3(points, false, 'centripetal', 0.4)
    return new TubeGeometry(curve, Math.max(96, points.length * 26), 0.05, 8, false)
  }, [points])

  useEffect(() => () => geometry.dispose(), [geometry])

  const startedAt = useRef(0)

  useFrame(({ clock }) => {
    if (startedAt.current === 0) startedAt.current = clock.elapsedTime

    const total = (geometry as BufferGeometry).getIndex()?.count ?? 0
    if (total === 0) return

    const elapsed = (clock.elapsedTime - startedAt.current) * 1000
    const t = instant ? 1 : clamp((elapsed - delayMs) / Math.max(durationMs, 1), 0, 1)
    geometry.setDrawRange(0, Math.floor(total * t))
  })

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={2.6}
        roughness={0.35}
        // 톤매핑을 끄면 색이 1을 넘어 블룸이 강하게 번진다.
        toneMapped={false}
      />
    </mesh>
  )
}

/* ── 이름표 ─────────────────────────────────────────────────── */

/**
 * 3D 위치에 DOM을 얹는다.
 *
 * 3D 텍스트 대신 DOM을 쓰는 이유는 한글이다. troika 계열 3D 텍스트는 폰트 파일을
 * 따로 실어야 하고 한글 글리프가 많아 무겁다. DOM이면 시스템 폰트를 그대로 쓴다.
 * 대신 원기둥 뒤로 돌아간 이름표는 스스로 숨겨야 해서 정면 판정을 직접 한다.
 */
function FacingLabel({
  azimuth,
  position,
  children,
}: {
  azimuth: number
  position: Vector3
  children: React.ReactNode
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const normal = useMemo(
    () => new Vector3(Math.sin(azimuth), 0, Math.cos(azimuth)),
    [azimuth],
  )
  const scratch = useMemo(() => new Vector3(), [])

  useFrame(({ camera }) => {
    const div = divRef.current
    if (!div) return

    const facing = scratch.copy(camera.position).setY(0).normalize().dot(normal)
    const visibility = facing <= 0.08 ? 0 : Math.min(1, (facing - 0.08) / 0.32)

    div.style.opacity = String(visibility)
    div.style.pointerEvents = visibility < 0.45 ? 'none' : 'auto'
  })

  return (
    <Html position={position} center distanceFactor={9} zIndexRange={[20, 0]}>
      <div ref={divRef} style={{ opacity: 0 }}>
        {children}
      </div>
    </Html>
  )
}

export const LadderRig = memo(LadderRigImpl)
