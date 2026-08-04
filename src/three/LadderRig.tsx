import { Fragment, memo, useCallback, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import {
  Color,
  CurvePath,
  LineCurve3,
  Object3D,
  Quaternion,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
} from 'three'
import type { LadderPlan } from '../lib/ladder'
import type { Person } from '../lib/types'
import { CYLINDER_HEIGHT, personColor, rungDelayMs, type LadderGeometry } from '../lib/geometry'
import { playEase, type Lane } from '../lib/trail'
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
  geo: LadderGeometry
  lanes: Lane[]
  /** 사다리를 다시 짤 때마다 바뀌는 값. 가로선이 날아드는 연출을 다시 튼다. */
  buildToken: number
  /** 경로 애니메이션을 다시 트는 토큰. 값이 바뀔 때마다 처음부터 재생된다. */
  playToken: number
  /** null이면 전원, 숫자면 그 사람만 그린다. */
  activeIndex: number | null
  /** true면 경로를 아래에서 위로 거슬러 그린다(거꾸로 타기). */
  reverse: boolean
  /** 애니메이션 없이 최종 상태로 그린다(공유 링크로 바로 들어온 경우). */
  instant: boolean
  /** 카메라가 원기둥 안에 있는지. 안에서는 바깥면에 붙은 이름표가 보이지 않는다. */
  inside: boolean
  /** 펼침 목표(0=원기둥, 1=평면). 실제 전개는 매 프레임 이 값으로 수렴한다. */
  unfoldTarget: number
  /** 전개가 끝난 뒤의 배치. 트레일 도형은 이 값에서만 다시 굽는다. */
  settledUnfold: number
  onUnfoldSettle: (value: number) => void
  onSelectPerson: (index: number) => void
  /** 결과 칸을 눌렀을 때. 거꾸로 타기의 출발점이 된다. */
  onSelectSlot: (slotIndex: number) => void
}

function LadderRigImpl({
  people,
  plan,
  geo,
  lanes,
  buildToken,
  playToken,
  activeIndex,
  reverse,
  instant,
  inside,
  unfoldTarget,
  settledUnfold,
  onUnfoldSettle,
  onSelectPerson,
  onSelectSlot,
}: LadderRigProps) {
  const count = people.length
  const top = CYLINDER_HEIGHT / 2

  /**
   * 경로는 "탄 뒤"에만 존재한다.
   * 미리 그려 두면 아직 타지도 않았는데 결과가 새어 나간다.
   */
  const showTrails = instant || playToken > 0

  /**
   * 가로선이 촘촘할수록 얇아진다.
   * 지옥은 행이 120줄을 넘어 행 간격이 0.04까지 좁아지는데, 기본 굵기를 그대로
   * 두면 서로 겹쳐 한 덩어리로 보인다.
   */
  const rows = plan?.ladder.rows ?? 0
  const rungRadius = rows > 40 ? 0.013 : 0.032
  const trailRadius = rows > 40 ? 0.017 : 0.025

  /** 가로선 하나하나. 인스턴싱에 넘길 평평한 목록으로 미리 편다. */
  const rungItems = useMemo<RungItem[]>(() => {
    if (!plan) return []

    return plan.ladder.rungs.flatMap((rungs, row) =>
      rungs.map((rung, orderInRow) => {
        const [a, b] =
          rung.kind === 'edge' ? [rung.gap, mod(rung.gap + 1, count)] : [rung.from, rung.to]

        return {
          railA: a,
          railB: b,
          y: geo.rowY(row),
          through: rung.kind === 'through',
          delayMs: instant ? 0 : rungDelayMs(row, orderInRow),
          seed: row * 31 + a * 17 + b * 7,
        }
      }),
    )
  }, [plan, geo, count, instant])

  /* ── 전개 ─────────────────────────────────────────────────
     세로줄과 이름표는 매 프레임 자리를 옮겨 부드럽게 펴진다.
     트레일만은 한 번 구운 고정 도형이라 중간 형태를 만들 수 없어서, 펼치는
     동안 감췄다가 끝난 자리에서 다시 굽는다(settledUnfold).             */

  const railsRef = useRef<Array<Mesh | null>>([])
  const labelsRef = useRef<Array<Group | null>>([])
  const unfoldRef = useRef(unfoldTarget)
  const settleRef = useRef(onUnfoldSettle)
  settleRef.current = onUnfoldSettle

  const registerRail = useCallback((index: number, node: Mesh | null) => {
    railsRef.current[index] = node
  }, [])
  const registerLabel = useCallback((index: number, node: Group | null) => {
    labelsRef.current[index] = node
  }, [])

  useFrame(() => {
    const current = unfoldRef.current
    const next = current + (unfoldTarget - current) * 0.1
    const done = Math.abs(unfoldTarget - next) < 0.004
    unfoldRef.current = done ? unfoldTarget : next

    for (let i = 0; i < count; i += 1) {
      const rail = railsRef.current[i]
      if (rail) rail.position.copy(geo.blendPoint(i, 0, unfoldRef.current))

      const label = labelsRef.current[i]
      if (label) {
        // 위·아래 라벨을 한 쌍으로 묶어 두므로 x·z만 맞춰 주면 된다.
        const anchor = geo.blendPoint(i, 0, unfoldRef.current)
        label.position.set(anchor.x, 0, anchor.z)
      }
    }

    if (done && settledUnfold !== unfoldTarget) settleRef.current(unfoldTarget)
  })

  /** 전개 중에는 트레일을 감춘다. 중간 형태를 만들 수 없기 때문이다. */
  const folding = settledUnfold !== unfoldTarget

  if (count === 0) return null

  return (
    <group>
      {/* 세로줄 */}
      {people.map((person, index) => (
        <mesh key={person.id} ref={(node) => registerRail(index, node)}>
          <cylinderGeometry args={[0.024, 0.024, CYLINDER_HEIGHT, 12]} />
          <meshStandardMaterial color="#c9ced6" metalness={0.98} roughness={0.24} />
        </mesh>
      ))}

      {/* 가로선 — 사다리를 새로 짤 때마다 사방에서 날아와 꽂힌다 */}
      {plan && (
        <Rungs
          key={`rungs-${buildToken}-${plan.ladder.rows}`}
          items={rungItems}
          radius={rungRadius}
          instant={instant}
          geo={geo}
          unfoldRef={unfoldRef}
        />
      )}

      {/* 지나간 길 */}
      {plan && showTrails && !folding && (
        <Fragment key={`trail-${playToken}-${activeIndex ?? 'all'}-${reverse ? 'up' : 'down'}`}>
          {lanes
            .filter((lane) => activeIndex === null || lane.personIndex === activeIndex)
            .map((lane) => (
              <Trail
                key={lane.personIndex}
                // 점 순서를 뒤집으면 셰이더가 그대로 아래에서 위로 그린다.
                points={reverse ? [...lane.points].reverse() : lane.points}
                color={personColor(lane.personIndex)}
                delayMs={activeIndex === null ? lane.delayMs : 0}
                durationMs={lane.durationMs}
                instant={instant}
                // 한 사람만 볼 때는 굵게 그려 또렷하게 보이도록 한다.
                radius={activeIndex !== null ? trailRadius * 1.5 : trailRadius}
              />
            ))}
        </Fragment>
      )}

      {/*
        이름표와 결과표는 원기둥 바깥면에 붙어 있다. 카메라가 안으로 들어가면
        뒷면만 보이므로 아예 감춘다. 안에서는 구조 자체가 볼거리다.

        위·아래 라벨을 사람별 그룹으로 묶어 두면, 전개할 때 그룹 하나만 옮겨도
        둘이 같이 따라온다.
      */}
      {!inside &&
        people.map((person, index) => {
          const isWin = plan?.prizeSlots[index] ?? false

          return (
            <group key={person.id} ref={(node) => registerLabel(index, node)}>
              <FacingLabel azimuth={geo.azimuth(index)} position={[0, top + 0.5, 0]}>
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

              {plan && (
                <>
                  {isWin && <PrizeBeacon position={[0, -top - 0.12, 0]} />}
                  <FacingLabel azimuth={geo.azimuth(index)} position={[0, -top - 0.62, 0]}>
                    <button
                      type="button"
                      onClick={() => onSelectSlot(index)}
                      title="이 칸의 주인을 거꾸로 찾아 올라갑니다"
                      className={cn(
                        'flex min-w-[3.5rem] items-center justify-center rounded-xl px-3 py-1.5',
                        'text-[13px] font-extrabold whitespace-nowrap backdrop-blur',
                        'transition-transform hover:scale-105',
                        isWin
                          ? 'bg-amber-400 text-neutral-950 shadow-[0_0_28px_rgba(251,191,36,0.9)]'
                          : 'bg-neutral-800/70 text-neutral-500',
                      )}
                    >
                      {isWin ? '당첨' : '꽝'}
                    </button>
                  </FacingLabel>
                </>
              )}
            </group>
          )
        })}

    </group>
  )
}

/* ── 당첨 칸 표식 ───────────────────────────────────────────── */

/**
 * 당첨 칸 바닥에서 천천히 맥동하는 발광 고리.
 *
 * 라벨만으로는 원기둥 뒤쪽 당첨 칸을 알 수 없다. 고리는 3D 물체라 원기둥을
 * 돌리지 않아도 "저쪽 어딘가에 당첨이 있다"는 감각을 준다. 블룸이 이 발광을
 * 받아 번지면서 멀리서도 눈에 띈다.
 */
function PrizeBeacon({ position }: { position: [number, number, number] }) {
  const ref = useRef<Mesh>(null)

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    // 1.6초 주기로 부드럽게 밝아졌다 어두워진다.
    const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1600) * Math.PI * 2)
    mesh.scale.setScalar(1 + pulse * 0.18)
    ;(mesh.material as MeshBasicMaterial).opacity = 0.55 + pulse * 0.45
  })

  return (
    <mesh ref={ref} position={position} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.17, 0.035, 10, 28]} />
      <meshBasicMaterial color="#fbbf24" transparent toneMapped={false} />
    </mesh>
  )
}

/* ── 가로선 ─────────────────────────────────────────────────── */

interface RungItem {
  /** 잇는 두 세로줄. 전개에 따라 위치가 바뀌므로 좌표가 아니라 번호로 들고 있는다. */
  railA: number
  railB: number
  y: number
  /** 원통 속을 관통하는 선인지. 겉면 가로선과 다르게 칠해 눈에 띄게 한다. */
  through: boolean
  delayMs: number
  seed: number
}

/**
 * 가로선 전체를 두 번의 드로우콜로 그린다(겉면 하나, 관통 하나).
 *
 * 지옥 난이도는 가로선이 400개에 육박한다. 하나씩 메시로 만들면 지오메트리도
 * 드로우콜도 400개가 되어 블룸·반사와 겹치는 순간 프레임이 무너진다. 모양이
 * 전부 같은 원기둥이므로 InstancedMesh가 정확히 들어맞는다.
 *
 * 길이는 인스턴스마다 다른데, 지오메트리를 길이 1로 만들어 두고 y축 배율로
 * 늘이면 한 벌로 해결된다.
 */
function Rungs({
  items,
  radius,
  instant,
  geo,
  unfoldRef,
}: {
  items: RungItem[]
  radius: number
  instant: boolean
  geo: LadderGeometry
  /** 매 프레임 갱신되는 전개 진행도. Rig가 하나만 들고 있고 여기서 읽는다. */
  unfoldRef: { current: number }
}) {
  const edgeRef = useRef<InstancedMesh>(null)
  const throughRef = useRef<InstancedMesh>(null)

  /** 겉면/관통을 따로 모아 둔다. 재질이 달라 인스턴스 묶음도 나뉜다. */
  const groups = useMemo(() => {
    const edge: RungItem[] = []
    const through: RungItem[] = []
    for (const item of items) (item.through ? through : edge).push(item)
    return { edge, through }
  }, [items])

  /** 어디서 날아올지. 최종 위치는 전개에 따라 바뀌므로 매 프레임 다시 구한다. */
  const plans = useMemo(() => {
    const build = (list: RungItem[]) =>
      list.map((item) => {
        // 방위를 흩뜨려 사방에서 모여드는 그림을 만든다.
        const angle = hash(item.seed) * Math.PI * 2
        const lift = (hash(item.seed + 7) - 0.5) * 6
        const distance = 7 + hash(item.seed + 13) * 5

        return {
          item,
          launchPosition: new Vector3(
            Math.sin(angle) * distance,
            item.y + lift,
            Math.cos(angle) * distance,
          ),
          launchQuaternion: new Quaternion().setFromAxisAngle(
            new Vector3(
              hash(item.seed + 3),
              hash(item.seed + 5),
              hash(item.seed + 11),
            ).normalize(),
            hash(item.seed + 17) * Math.PI * 2,
          ),
        }
      })

    return { edge: build(groups.edge), through: build(groups.through) }
  }, [groups])

  // 행렬을 조립할 임시 객체들. 인스턴스마다 새로 만들면 GC가 매 프레임 돈다.
  const dummy = useMemo(() => new Object3D(), [])
  const a = useMemo(() => new Vector3(), [])
  const b = useMemo(() => new Vector3(), [])
  const middle = useMemo(() => new Vector3(), [])
  const direction = useMemo(() => new Vector3(), [])
  const aim = useMemo(() => new Quaternion(), [])
  const elapsedRef = useRef(0)

  useFrame((_, delta) => {
    elapsedRef.current += delta * 1000
    const elapsed = elapsedRef.current
    const unfold = unfoldRef.current

    const apply = (mesh: InstancedMesh | null, list: typeof plans.edge) => {
      if (!mesh) return

      for (let i = 0; i < list.length; i += 1) {
        const plan = list[i]
        const { item } = plan

        // 전개 중에는 양 끝 세로줄이 움직이므로 최종 자리를 매번 다시 구한다.
        a.copy(geo.blendPoint(item.railA, item.y, unfold))
        b.copy(geo.blendPoint(item.railB, item.y, unfold))
        middle.copy(a).add(b).multiplyScalar(0.5)
        direction.copy(b).sub(a)
        const length = direction.length()
        aim.setFromUnitVectors(UP, direction.normalize())

        const t = instant ? 1 : clamp((elapsed - item.delayMs) / RUNG_FLY_MS, 0, 1)
        const eased = easeOutCubic(t)

        dummy.position.lerpVectors(plan.launchPosition, middle, eased)
        dummy.quaternion.slerpQuaternions(plan.launchQuaternion, aim, eased)

        // 길이 1짜리 지오메트리를 실제 길이로 늘인다. 도착 전에는 짧게 보인다.
        const grow = t === 0 ? 0.0001 : 0.35 + 0.65 * eased
        dummy.scale.set(grow, length * grow, grow)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }

      mesh.instanceMatrix.needsUpdate = true
    }

    apply(edgeRef.current, plans.edge)
    apply(throughRef.current, plans.through)
  })

  return (
    <group>
      {plans.edge.length > 0 && (
        <instancedMesh
          ref={edgeRef}
          args={[undefined, undefined, plans.edge.length]}
          frustumCulled={false}
        >
          <cylinderGeometry args={[radius, radius, 1, 10]} />
          <meshStandardMaterial color="#e8eaee" metalness={0.95} roughness={0.18} />
        </instancedMesh>
      )}

      {plans.through.length > 0 && (
        <instancedMesh
          ref={throughRef}
          args={[undefined, undefined, plans.through.length]}
          frustumCulled={false}
        >
          <cylinderGeometry args={[radius * 0.85, radius * 0.85, 1, 10]} />
          {/* 관통선은 스스로 빛나게 해서 "이건 특별한 선"임을 알린다. */}
          <meshStandardMaterial
            color="#fbbf24"
            emissive="#f59e0b"
            emissiveIntensity={1.6}
            metalness={0.6}
            roughness={0.3}
            toneMapped={false}
          />
        </instancedMesh>
      )}
    </group>
  )
}

/* ── 지나간 길 ──────────────────────────────────────────────── */

/**
 * 트레일 셰이더.
 *
 * TubeGeometry의 uv.x는 튜브 길이를 따라 0→1로 흐른다. 그 값을 진행률과 비교해
 *   - 아직 지나지 않은 구간은 버리고(discard)
 *   - 머리 쪽은 흰색으로 타오르게, 꼬리는 조금 어둡게
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
  radius,
}: {
  points: Vector3[]
  color: string
  delayMs: number
  durationMs: number
  instant: boolean
  radius: number
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

  /**
   * 튜브 분할 수.
   *
   * 경로는 직선의 연속이라 코너마다 몇 분할이면 형태가 충분히 나온다. 점 개수에
   * 큰 계수를 곱하면 지옥(경로점 300개)에서 5천 분할까지 치솟아, 재생을 누르는
   * 순간 8명분 지오메트리를 만드느라 화면이 끊긴다. 상한을 둔다.
   *
   * 진행 표시는 uv.x를 분할 인덱스에 대응시키므로, 7초에 1200분할이면 한 프레임에
   * 세 칸씩 나아간다 — 눈으로는 이어져 보인다.
   */
  const geometry = useMemo(
    () => new TubeGeometry(curve, clamp(points.length * 5, 200, 1600), radius, 7, false),
    [curve, points.length, radius],
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
  // 가로선과 같은 이유로 프레임 델타를 누적한다. (위 Rung 주석 참고)
  const elapsedRef = useRef(0)

  useFrame((_, delta) => {
    elapsedRef.current += delta * 1000
    const raw = instant ? 1 : clamp((elapsedRef.current - delayMs) / Math.max(durationMs, 1), 0, 1)
    // 결과 칸에 닿기 직전이 눈에 띄게 느려진다.
    const t = playEase(raw)
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
        <sphereGeometry args={[radius * 2.4, 12, 12]} />
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
  position: [number, number, number]
  children: ReactNode
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
