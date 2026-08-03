import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer, MeshReflectorMaterial, OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { CYLINDER_HEIGHT } from '../lib/geometry'
import { LadderRig, type LadderRigProps } from './LadderRig'

/**
 * 3D 씬 전체.
 *
 * CSS 3D로는 얻을 수 없는 것들을 여기서 얻는다 — 금속 반사(환경맵), 발광 번짐(블룸),
 * 바닥 반사, 카메라 궤도. 특히 트레일의 네온 느낌은 `toneMapped={false}` 재질과
 * 블룸의 조합에서 나온다. 그림자 흉내가 아니라 실제 광량 계산이다.
 */

interface LadderSceneProps extends LadderRigProps {
  dark: boolean
  /** 애니메이션이 도는 동안에는 자동 회전을 멈춰 눈이 따라가기 쉽게 한다. */
  running: boolean
  onPlayEnd: () => void
  /** 재생이 끝나는 데 걸리는 시간(ms). 사람 수와 경로 길이에 따라 달라진다. */
  playDurationMs: number
}

export function LadderScene({
  dark,
  running,
  onPlayEnd,
  playDurationMs,
  ...rig
}: LadderSceneProps) {
  const background = dark ? '#08080b' : '#e9e7e4'

  const onPlayEndRef = useRef(onPlayEnd)
  onPlayEndRef.current = onPlayEnd

  // 재생 종료는 씬 밖에서 시간으로 판단한다. 3D 내부 상태에 의존하지 않아 단순하다.
  useEffect(() => {
    if (!running) return
    const timer = window.setTimeout(() => onPlayEndRef.current(), playDurationMs + 220)
    return () => window.clearTimeout(timer)
  }, [running, playDurationMs])

  const floorY = useMemo(() => -CYLINDER_HEIGHT / 2 - 1.1, [])

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 1.6, 12.5], fov: 42 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 16, 34]} />

      <ambientLight intensity={dark ? 0.5 : 1.1} />
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

        <LadderRig {...rig} />

        {/* 바닥 반사 — 원기둥이 공중에 떠 있지 않고 어딘가에 서 있게 만든다 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]}>
          <planeGeometry args={[60, 60]} />
          <MeshReflectorMaterial
            resolution={1024}
            mixBlur={1}
            mixStrength={dark ? 42 : 14}
            blur={[320, 110]}
            mirror={0.55}
            depthScale={1.1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.35}
            color={dark ? '#0c0c10' : '#d6d3d0'}
            metalness={0.65}
            roughness={0.92}
          />
        </mesh>
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={7}
        maxDistance={20}
        minPolarAngle={Math.PI * 0.18}
        maxPolarAngle={Math.PI * 0.72}
        autoRotate={!rig.instant && !running}
        autoRotateSpeed={0.55}
        enableDamping
        dampingFactor={0.08}
      />

      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={dark ? 1.5 : 0.7}
          luminanceThreshold={0.62}
          luminanceSmoothing={0.25}
        />
        <Vignette offset={0.28} darkness={dark ? 0.72 : 0.35} />
      </EffectComposer>
    </Canvas>
  )
}
