import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Environment, Lightformer, OrbitControls, Sky } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import type { Difficulty } from '../lib/types'
import type { Lane } from '../lib/trail'
import { clamp } from '../lib/utils'
import { CinematicCamera } from './CinematicCamera'
import { GhostRig } from './GhostRig'
import { Ground } from './Ground'
import { LadderRig, type LadderRigProps } from './LadderRig'
import { playEase } from '../lib/trail'
import type { PlayClock } from '../lib/playClock'
import { Motes } from './Motes'

/**
 * 3D 씬 전체.
 *
 * CSS 3D로는 얻을 수 없는 것들을 여기서 얻는다 — 금속 반사(환경맵), 발광 번짐(블룸),
 * 바닥, 카메라 궤도. 특히 트레일의 네온 느낌은 `toneMapped={false}` 재질과 블룸의
 * 조합에서 나온다. 그림자 흉내가 아니라 실제 광량 계산이다.
 */

/** 난이도마다 세계관이 통째로 바뀐다. 색·안개·조명·블룸이 한 벌로 묶여 있다. */
const THEMES: Record<
  Difficulty,
  {
    background: string
    fog: [near: number, far: number]
    ambient: number
    keyLight: string
    rimLights: [string, string]
    lightformers: [string, string, string]
    bloom: number
    vignette: number
  }
> = {
  easy: {
    /*
      해질 무렵의 들판.
      한낮으로 두면 하늘이 너무 밝아 밝은 금속 세로줄이 배경에 묻힌다. 밝기가
      아니라 대비 문제라, 태양을 지평선 쪽으로 내리고 환경광을 낮춰 사다리가
      배경에서 떠오르게 한다.
    */
    background: '#6d8a9e',
    fog: [22, 54],
    ambient: 0.62,
    keyLight: '#ffe6bd',
    rimLights: ['#a3e635', '#fbbf24'],
    lightformers: ['#ffe9c4', '#bef264', '#fcd34d'],
    bloom: 0.7,
    vignette: 0.52,
  },
  normal: {
    background: '#14141c',
    fog: [18, 40],
    ambient: 0.75,
    keyLight: '#ffffff',
    rimLights: ['#4f8dff', '#ffab2e'],
    lightformers: ['#ffffff', '#7dd3fc', '#fbbf24'],
    bloom: 1.05,
    vignette: 0.5,
  },
  hell: {
    // 그을음이 낀 검붉은 공기. 빛은 바닥의 용암에서만 올라온다.
    background: '#180301',
    fog: [12, 32],
    ambient: 0.5,
    keyLight: '#ff8f70',
    rimLights: ['#ff1204', '#c41003'],
    lightformers: ['#ff1a05', '#8a0a02', '#ff4a1a'],
    bloom: 1.7,
    vignette: 0.8,
  },
}

interface LadderSceneProps extends LadderRigProps {
  difficulty: Difficulty
  /** 값이 바뀔 때마다 카메라가 원기둥 안팎으로 이동한다. */
  insideToken: number
  /** 애니메이션이 도는 동안에는 자동 회전을 멈춰 눈이 따라가기 쉽게 한다. */
  running: boolean
  onPlayEnd: () => void
  /** 재생이 끝나는 데 걸리는 시간(ms). 사람 수와 경로 길이에 따라 달라진다. */
  playDurationMs: number
  /** WebGL 컨텍스트가 준비되어 첫 프레임을 그릴 수 있게 된 순간. */
  onReady: () => void
  /** 가로선을 건널 때 울릴 음. 경로가 곧 멜로디가 된다. */
  onCrossRung: (personIndex: number, step: number) => void
}

export function LadderScene({
  difficulty,
  insideToken,
  running,
  onPlayEnd,
  playDurationMs,
  onReady,
  onCrossRung,
  ...rig
}: LadderSceneProps) {
  const theme = THEMES[difficulty]

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 1.2, 11.2], fov: 44 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={onReady}
    >
      <color attach="background" args={[theme.background]} />
      <fog attach="fog" args={[theme.background, ...theme.fog]} />

      {/*
        쉬움 모드에만 진짜 하늘을 씌운다. drei의 Sky는 대기 산란을 실시간으로
        계산하므로 이미지 파일이 필요 없다. 풀밭 위에 파란 하늘이 얹혀야
        비로소 "들판"으로 읽힌다.
      */}
      {difficulty === 'easy' && (
        <Sky
          sunPosition={[9, 1.4, -15]}
          turbidity={12}
          rayleigh={3}
          mieCoefficient={0.01}
          mieDirectionalG={0.85}
          distance={4000}
        />
      )}

      <ambientLight intensity={theme.ambient} />
      <directionalLight position={[6, 9, 7]} intensity={1.4} color={theme.keyLight} />
      <pointLight position={[-7, 3, -5]} intensity={45} color={theme.rimLights[0]} />
      <pointLight position={[7, -2, 5]} intensity={32} color={theme.rimLights[1]} />

      <Suspense fallback={null}>
        {/*
          환경맵을 CDN에서 받지 않고 조명판(Lightformer)으로 직접 굽는다.
          네트워크 의존이 사라지고 오프라인에서도 금속 반사가 그대로 나온다.
          난이도가 바뀌면 key가 바뀌어 환경맵을 새 색으로 다시 굽는다.
        */}
        <Environment key={difficulty} resolution={192} frames={1}>
          <Lightformer
            form="rect"
            intensity={4}
            color={theme.lightformers[0]}
            position={[0, 6, -8]}
            scale={[14, 6, 1]}
          />
          <Lightformer
            form="rect"
            intensity={2.4}
            color={theme.lightformers[1]}
            position={[-9, 2, 4]}
            scale={[8, 10, 1]}
            rotation={[0, Math.PI / 2, 0]}
          />
          <Lightformer
            form="rect"
            intensity={2}
            color={theme.lightformers[2]}
            position={[9, -1, 4]}
            scale={[8, 10, 1]}
            rotation={[0, -Math.PI / 2, 0]}
          />
        </Environment>

        {/* 명단이 비었으면 실제 사다리 대신 흐릿한 원기둥이 천천히 돈다 */}
        {rig.people.length === 0 ? <GhostRig /> : <LadderRig {...rig} />}

        {/* 시계를 굴리는 곳은 여기 한 군데뿐. 나머지는 읽기만 한다 */}
        <ClockDriver
          clock={rig.clock}
          active={running}
          durationMs={playDurationMs}
          onEnd={onPlayEnd}
        />

        {/* 경로가 가로선을 건널 때마다 음을 낸다 */}
        <Melody
          clock={rig.clock}
          lanes={rig.lanes}
          activeIndex={rig.activeIndex}
          playing={running}
          onCross={onCrossRung}
        />

        {/* 재생 중에는 카메라가 선두를 따라 내려간다 */}
        <CinematicCamera
          active={running}
          lanes={rig.lanes}
          activeIndex={rig.activeIndex}
          reverse={rig.reverse}
          clock={rig.clock}
        />

        {/* 안에서는 밖의 빛이 닿지 않으므로 중심에 등 하나를 켠다 */}
        {rig.inside && <pointLight position={[0, 0, 0]} intensity={12} distance={9} />}

        <CameraDock inside={rig.inside} token={insideToken} />

        <Ground difficulty={difficulty} />
        <Motes difficulty={difficulty} />
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        // 안에서 보기를 위해 축 가까이까지 들어갈 수 있어야 한다.
        minDistance={0.4}
        maxDistance={18}
        minPolarAngle={Math.PI * 0.18}
        maxPolarAngle={Math.PI * 0.72}
        autoRotate={rig.people.length === 0 || (!rig.instant && !running)}
        autoRotateSpeed={rig.inside ? 1.4 : 0.55}
        enableDamping
        dampingFactor={0.08}
      />

      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={theme.bloom}
          luminanceThreshold={0.7}
          luminanceSmoothing={0.2}
        />
        <Vignette offset={0.28} darkness={theme.vignette} />
      </EffectComposer>
    </Canvas>
  )
}

/**
 * 시계를 굴리고, 재생이 끝나는 시점을 알린다.
 *
 * setTimeout으로 재면 안 된다. 백그라운드 탭에서는 rAF가 멈춰 그림은 그대로인데
 * 타이머만 흘러서, 돌아왔을 때 "이미 끝났다"고 통보받는다. 프레임 델타를 쌓으면
 * 화면이 실제로 다 그려진 뒤에만 끝난다.
 *
 * 배속은 여기서 한 번만 곱한다. 트레일·카메라·멜로디는 이 시계를 읽기만 하므로
 * 배속과 되감기가 저절로 따라온다.
 */
function ClockDriver({
  clock,
  active,
  durationMs,
  onEnd,
}: {
  clock: { current: PlayClock }
  active: boolean
  durationMs: number
  onEnd: () => void
}) {
  const firedRef = useRef(false)
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd

  useFrame((_, delta) => {
    const state = clock.current
    state.total = durationMs

    if (!active) {
      firedRef.current = false
      return
    }
    // 타임라인을 잡고 있는 동안에는 시계를 멈춘다.
    if (state.scrubbing || firedRef.current) return

    state.elapsed += delta * 1000 * state.speed

    // 마지막 한 조각이 그려질 여유를 조금 준다.
    if (state.elapsed >= durationMs + 220) {
      firedRef.current = true
      onEndRef.current()
    }
  })

  return null
}

/**
 * 경로가 가로선을 건널 때마다 음을 낸다.
 *
 * 건너는 지점은 경로 길이 대비 위치(0~1)로 미리 계산돼 있다. 매 프레임 진행률이
 * 그 값을 지나갔는지 보고 밀린 만큼 소리를 낸다. 시계를 되감으면 커서도 함께
 * 되돌려, 뒤로 간 구간이 다시 울리지 않게 한다.
 */
function Melody({
  clock,
  lanes,
  activeIndex,
  playing,
  onCross,
}: {
  clock: { current: PlayClock }
  lanes: Lane[]
  activeIndex: number | null
  playing: boolean
  onCross: (personIndex: number, step: number) => void
}) {
  const cursors = useRef(new Map<number, number>())
  const onCrossRef = useRef(onCross)
  onCrossRef.current = onCross

  useFrame(() => {
    if (!playing) {
      cursors.current.clear()
      return
    }

    const elapsed = clock.current.elapsed

    for (const lane of lanes) {
      if (activeIndex !== null && lane.personIndex !== activeIndex) continue

      const raw = clamp((elapsed - lane.delayMs) / Math.max(lane.durationMs, 1), 0, 1)
      const progress = playEase(raw)

      let cursor = cursors.current.get(lane.personIndex) ?? 0

      // 되감았다면 커서를 되돌리되 소리는 내지 않는다.
      while (cursor > 0 && lane.crossings[cursor - 1] > progress) cursor -= 1

      while (cursor < lane.crossings.length && lane.crossings[cursor] <= progress) {
        onCrossRef.current(lane.personIndex, cursor)
        cursor += 1
      }

      cursors.current.set(lane.personIndex, cursor)
    }
  })

  return null
}

/**
 * 안에서 보기 / 밖에서 보기 전환.
 *
 * 카메라를 순간이동시키면 어디로 갔는지 알 수 없다. 지금 보고 있는 방위를 유지한
 * 채 축까지의 거리만 좁히거나 벌리면, 원기둥 껍질을 통과해 들어가는 것처럼 보인다.
 */
function CameraDock({ inside, token }: { inside: boolean; token: number }) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null

  const goal = useRef<number | null>(null)

  // 토큰이 바뀔 때만 목표 거리를 새로 잡는다. 그 뒤에는 사용자가 휠로 자유롭게 조절한다.
  useEffect(() => {
    if (token === 0) return
    goal.current = inside ? 0.9 : 11.2
  }, [inside, token])

  useFrame(() => {
    if (goal.current === null || !controls) return

    const axis = Math.hypot(camera.position.x, camera.position.z) || 0.0001
    const next = axis + (goal.current - axis) * 0.12

    if (Math.abs(next - goal.current) < 0.02) goal.current = null

    const scale = next / axis
    camera.position.x *= scale
    camera.position.z *= scale
    camera.position.y += (0 - camera.position.y) * 0.12
    controls.target.set(0, 0, 0)
    controls.update()
  })

  return null
}
