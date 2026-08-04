import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import type { Difficulty } from '../lib/types'
import { CinematicCamera } from './CinematicCamera'
import { GhostRig } from './GhostRig'
import { Ground } from './Ground'
import { LadderRig, type LadderRigProps } from './LadderRig'
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
    background: '#08150c',
    fog: [18, 40],
    ambient: 0.8,
    keyLight: '#eaffd8',
    rimLights: ['#6ee7b7', '#fde68a'],
    lightformers: ['#ffffff', '#a7f3d0', '#fef3c7'],
    bloom: 0.75,
    vignette: 0.5,
  },
  normal: {
    background: '#08080b',
    fog: [16, 34],
    ambient: 0.5,
    keyLight: '#ffffff',
    rimLights: ['#4f8dff', '#ffab2e'],
    lightformers: ['#ffffff', '#7dd3fc', '#fbbf24'],
    bloom: 1.15,
    vignette: 0.72,
  },
  hell: {
    background: '#0d0301',
    fog: [12, 30],
    ambient: 0.42,
    keyLight: '#ffd8b0',
    rimLights: ['#ff3d10', '#ff8a1f'],
    lightformers: ['#ff6a1f', '#ff2d05', '#ffb347'],
    bloom: 1.6,
    vignette: 0.86,
  },
}

interface LadderSceneProps extends LadderRigProps {
  difficulty: Difficulty
  /** 애니메이션이 도는 동안에는 자동 회전을 멈춰 눈이 따라가기 쉽게 한다. */
  running: boolean
  onPlayEnd: () => void
  /** 재생이 끝나는 데 걸리는 시간(ms). 사람 수와 경로 길이에 따라 달라진다. */
  playDurationMs: number
  /** WebGL 컨텍스트가 준비되어 첫 프레임을 그릴 수 있게 된 순간. */
  onReady: () => void
}

export function LadderScene({
  difficulty,
  running,
  onPlayEnd,
  playDurationMs,
  onReady,
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

        {/* 재생이 실제로 끝났는지는 그린 프레임을 세어 판단한다 */}
        <PlayClock active={running} durationMs={playDurationMs} onEnd={onPlayEnd} />

        {/* 재생 중에는 카메라가 선두를 따라 내려간다 */}
        <CinematicCamera
          active={running}
          lanes={rig.lanes}
          activeIndex={rig.activeIndex}
          reverse={rig.reverse}
        />

        <Ground difficulty={difficulty} />
        <Motes difficulty={difficulty} />
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={5.5}
        maxDistance={18}
        minPolarAngle={Math.PI * 0.18}
        maxPolarAngle={Math.PI * 0.72}
        autoRotate={rig.people.length === 0 || (!rig.instant && !running)}
        autoRotateSpeed={0.55}
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
 * 재생이 끝나는 시점을 알린다.
 *
 * setTimeout으로 재면 안 된다. 백그라운드 탭에서는 rAF가 멈춰 그림은 그대로인데
 * 타이머만 흘러서, 돌아왔을 때 "이미 끝났다"고 통보받는다. 프레임 델타를 쌓으면
 * 화면이 실제로 다 그려진 뒤에만 끝난다.
 */
function PlayClock({
  active,
  durationMs,
  onEnd,
}: {
  active: boolean
  durationMs: number
  onEnd: () => void
}) {
  const elapsedRef = useRef(0)
  const firedRef = useRef(false)
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd

  useFrame((_, delta) => {
    if (!active) {
      elapsedRef.current = 0
      firedRef.current = false
      return
    }
    if (firedRef.current) return

    elapsedRef.current += delta * 1000
    // 마지막 한 조각이 그려질 여유를 조금 준다.
    if (elapsedRef.current >= durationMs + 220) {
      firedRef.current = true
      onEndRef.current()
    }
  })

  return null
}
