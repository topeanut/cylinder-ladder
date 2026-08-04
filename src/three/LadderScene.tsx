import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, MeshReflectorMaterial, OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { CYLINDER_HEIGHT } from '../lib/geometry'
import { CinematicCamera } from './CinematicCamera'
import { GhostRig } from './GhostRig'
import { LadderRig, type LadderRigProps } from './LadderRig'

/**
 * 3D 씬 전체.
 *
 * CSS 3D로는 얻을 수 없는 것들을 여기서 얻는다 — 금속 반사(환경맵), 발광 번짐(블룸),
 * 바닥 반사, 카메라 궤도. 특히 트레일의 네온 느낌은 `toneMapped={false}` 재질과
 * 블룸의 조합에서 나온다. 그림자 흉내가 아니라 실제 광량 계산이다.
 */

interface LadderSceneProps extends LadderRigProps {
  /** 애니메이션이 도는 동안에는 자동 회전을 멈춰 눈이 따라가기 쉽게 한다. */
  running: boolean
  onPlayEnd: () => void
  /** 재생이 끝나는 데 걸리는 시간(ms). 사람 수와 경로 길이에 따라 달라진다. */
  playDurationMs: number
  /** WebGL 컨텍스트가 준비되어 첫 프레임을 그릴 수 있게 된 순간. */
  onReady: () => void
}

export function LadderScene({
  running,
  onPlayEnd,
  playDurationMs,
  onReady,
  ...rig
}: LadderSceneProps) {
  // 다크 전용이다. 발광·반사·블룸이 전부 어두운 배경을 전제로 맞춰져 있다.
  const background = '#08080b'

  const floorY = useMemo(() => -CYLINDER_HEIGHT / 2 - 1.1, [])

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 1.2, 11.2], fov: 44 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={onReady}
    >
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 16, 34]} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 9, 7]} intensity={1.4} />
      <pointLight position={[-7, 3, -5]} intensity={45} color="#4f8dff" />
      <pointLight position={[7, -2, 5]} intensity={32} color="#ffab2e" />

      <Suspense fallback={null}>
        {/*
          환경맵을 CDN에서 받지 않고 조명판(Lightformer)으로 직접 굽는다.
          네트워크 의존이 사라지고 오프라인에서도 금속 반사가 그대로 나온다.
        */}
        <Environment resolution={192} frames={1}>
          <Lightformer form="rect" intensity={4} position={[0, 6, -8]} scale={[14, 6, 1]} />
          <Lightformer
            form="rect"
            intensity={2.4}
            color="#7dd3fc"
            position={[-9, 2, 4]}
            scale={[8, 10, 1]}
            rotation={[0, Math.PI / 2, 0]}
          />
          <Lightformer
            form="rect"
            intensity={2}
            color="#fbbf24"
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
        />

        {/* 바닥 반사 — 원기둥이 공중에 떠 있지 않고 어딘가에 서 있게 만든다 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]}>
          <planeGeometry args={[60, 60]} />
          <MeshReflectorMaterial
            resolution={1024}
            mixBlur={1}
            mixStrength={42}
            blur={[320, 110]}
            mirror={0.55}
            depthScale={1.1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.35}
            color="#0c0c10"
            metalness={0.65}
            roughness={0.92}
          />
        </mesh>
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
          intensity={1.15}
          luminanceThreshold={0.7}
          luminanceSmoothing={0.2}
        />
        <Vignette offset={0.28} darkness={0.72} />
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
