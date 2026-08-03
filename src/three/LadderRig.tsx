import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import {
  Color,
  CurvePath,
  LineCurve3,
  Quaternion,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
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
              delayMs={activeIndex === null ? lane.delayMs : 0}
              durationMs={lane.durationMs}
              instant={instant}
              // 한 사람만 볼 때는 굵게 그려 또렷하게 보이도록 한다.
              thick={activeIndex !== null}
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

  // 0을 "아직 시작 안 함"으로 쓰면 안 된다. clock.elapsedTime의 첫 프레임 값이 0이라
  // 시작 시각이 영원히 갱신되지 않고 애니메이션이 멈춘다.
  const startedAt = useRef<number | null>(null)

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    if (startedAt.current === null) startedAt.current = clock.elapsedTime

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

/**
 * 트레일 셰이더.
 *
 * TubeGeometry의 uv.x는 튜브 길이를 따라 0→1로 흐른다. 그 값을 진행률과 비교해
 *   - 아직 지나지 않은 구간은 버리고(discard)
 *   - 머리 쪽은 흰색으로 타오르게, 꼬리는 어둡게
 * 칠한다. 인덱스를 잘라 그리는 방식보다 경계가 깨끗하고, 무엇보다 "지금 여기를
 * 지나고 있다"가 한눈에 보인다.
 */
const TRAIL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const TRAIL_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    if (vUv.x > uProgress) discard;

    float behind = uProgress - vUv.x;
    float hot = smoothstep(0.09, 0.0, behind);          // 머리에 가까울수록 1
    // 꼬리도 충분히 밝아야 금속 가로선에 묻히지 않는다.
    float tail = mix(0.85, 1.0, smoothstep(0.5, 0.0, behind));

    vec3 color = mix(uColor * 2.1, vec3(2.4), hot * 0.9);
    gl_FragColor = vec4(color * tail, 1.0);
  }
`

function Trail({
  points,
  color,
  delayMs,
  durationMs,
  instant,
  thick,
}: {
  points: Vector3[]
  color: string
  delayMs: number
  durationMs: number
  instant: boolean
  thick: boolean
}) {
  /**
   * 코너를 곡선으로 잇지 않는다.
   * 사다리의 세로줄과 가로선은 실제로 직선이고, 곡선으로 뭉개면 굵은 지렁이처럼
   * 보인다. 직선만 이어 붙여 직각을 살리면 회로 기판의 배선처럼 읽힌다.
   */
  const curve = useMemo(() => {
    const path = new CurvePath<Vector3>()
    for (let i = 1; i < points.length; i += 1) {
      // 길이가 0인 구간(가로선 시작점 = 직전 세로선 끝점)은 곡선 계산을 깨뜨린다.
      if (points[i].distanceToSquared(points[i - 1]) < 1e-8) continue
      path.add(new LineCurve3(points[i - 1], points[i]))
    }
    return path
  }, [points])

  const geometry = useMemo(
    () => new TubeGeometry(curve, Math.max(160, points.length * 34), thick ? 0.036 : 0.025, 7, false),
    [curve, points.length, thick],
  )

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uProgress: { value: 0 },
          uColor: { value: new Color(color) },
        },
        vertexShader: TRAIL_VERTEX,
        fragmentShader: TRAIL_FRAGMENT,
        // 톤매핑을 끄면 색이 1을 넘어 블룸이 번진다.
        toneMapped: false,
      }),
    [color],
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  const headRef = useRef<Mesh>(null)
  const startedAt = useRef<number | null>(null)

  useFrame(({ clock }) => {
    if (startedAt.current === null) startedAt.current = clock.elapsedTime

    const elapsed = (clock.elapsedTime - startedAt.current) * 1000
    const t = instant ? 1 : clamp((elapsed - delayMs) / Math.max(durationMs, 1), 0, 1)
    material.uniforms.uProgress.value = t

    // 선두의 발광 구슬. 다 내려가면 치운다.
    const head = headRef.current
    if (!head) return
    const moving = t > 0 && t < 1
    head.visible = moving
    if (moving) head.position.copy(curve.getPointAt(t))
  })

  return (
    <group>
      <mesh geometry={geometry} material={material} />
      <mesh ref={headRef} visible={false}>
        <sphereGeometry args={[thick ? 0.075 : 0.055, 14, 14]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
    </group>
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
