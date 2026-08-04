import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial, useTexture } from '@react-three/drei'
import { AdditiveBlending, RepeatWrapping, ShaderMaterial, SRGBColorSpace, Vector2 } from 'three'
import type { Texture } from 'three'
import type { Difficulty } from '../lib/types'
import { CYLINDER_HEIGHT } from '../lib/geometry'

/**
 * 난이도마다 다른 바닥.
 *
 * 사진 텍스처(Poly Haven, CC0)를 깔고 그 위에 절차적 발광을 얹는다. 사진만으로는
 * 흐르는 마그마를 만들 수 없고, 셰이더만으로는 실제 흙과 풀의 질감이 나오지 않는다.
 * 둘을 겹쳐야 "진짜 땅 위에서 용암이 흐른다"가 된다.
 *
 * 텍스처는 저장소에 함께 담겨 있어 외부 네트워크에 의존하지 않는다.
 */

const FLOOR_Y = -CYLINDER_HEIGHT / 2 - 1.1
const FLOOR_SIZE = 90
/** 사진 한 장을 바닥에 몇 번 반복해 깔 것인가. */
const TILING = 26

/** 내려받은 텍스처를 타일링·색공간까지 맞춘 뒤 돌려준다. */
function usePreparedTextures(diffuse: string, normal: string) {
  const [map, normalMap] = useTexture([diffuse, normal])

  return useMemo(() => {
    const prepare = (texture: Texture, srgb: boolean) => {
      texture.wrapS = RepeatWrapping
      texture.wrapT = RepeatWrapping
      texture.repeat.set(TILING, TILING)
      texture.anisotropy = 8
      // 색으로 쓰는 맵만 sRGB다. 노멀맵은 방향 데이터라 변환하면 망가진다.
      if (srgb) texture.colorSpace = SRGBColorSpace
      return texture
    }
    return { map: prepare(map, true), normalMap: prepare(normalMap, false) }
  }, [map, normalMap])
}

/** 두 발광 셰이더가 공유하는 잡음 함수. */
const NOISE = /* glsl */ `
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);          // 부드럽게 보간
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // 주파수를 두 배씩 올리며 진폭을 반씩 줄여 겹친다(fractal Brownian motion).
  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += valueNoise(p) * amp;
      p *= 2.02;
      amp *= 0.5;
    }
    return sum;
  }
`

const GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * 사진 위에 얹는 마그마.
 *
 * 이 면은 땅을 그리지 않는다. 갈라진 틈에 해당하는 부분만 남기고 나머지는 버려서
 * (discard) 아래 깔린 탄 대지 사진 위로 빨간 빛만 더한다. 그래서 지각의 질감은
 * 사진 그대로 남고 그 사이로 용암만 흐르는 그림이 된다.
 *
 * 색은 초록·파랑을 0에 가깝게 눌러 순수한 빨강만 남긴다. 초록이 조금만 올라가도
 * 곧바로 주황·노랑으로 새기 때문이다.
 */
const LAVA_GLOW = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  ${NOISE}

  void main() {
    vec2 p = (vUv - 0.5) * 26.0;

    // 두 겹이 서로 다른 속도로 흘러야 "굳은 표면 밑에서 움직이는" 느낌이 난다.
    float flow = fbm(p + vec2(uTime * 0.06, uTime * -0.04));
    float crack = fbm(p * 0.6 + flow * 1.4 + vec2(0.0, uTime * 0.02));

    // 좁게 잡아야 틈만 타오르고 나머지는 사진의 검은 지각이 남는다.
    float molten = smoothstep(0.50, 0.33, crack);
    if (molten < 0.01) discard;

    vec3 magma = mix(vec3(1.6, 0.03, 0.010), vec3(6.5, 0.18, 0.04), molten);

    // 가장자리로 갈수록 잦아들어 바닥 끝이 무한히 빛나 보이지 않게 한다.
    float fade = 1.0 - smoothstep(0.16, 0.56, distance(vUv, vec2(0.5)));
    gl_FragColor = vec4(magma * (0.45 + fade * 0.9), molten);
  }
`

/** 풀밭 위에 얹는 햇빛 얼룩. 사진만 깔면 평평해 보여 밝고 어두운 결을 더한다. */
const SUN_GLOW = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  ${NOISE}

  void main() {
    vec2 p = (vUv - 0.5) * 12.0;

    // 구름 그림자가 아주 천천히 흘러가는 느낌
    float patch = fbm(p * 0.5 + vec2(uTime * 0.02, uTime * 0.012));
    float sun = smoothstep(0.45, 0.72, patch);
    if (sun < 0.01) discard;

    float fade = 1.0 - smoothstep(0.2, 0.6, distance(vUv, vec2(0.5)));
    // 연둣빛으로 밝히는 얇은 빛. 알파를 낮게 둬 사진을 덮지 않는다.
    gl_FragColor = vec4(vec3(0.55, 0.85, 0.28) * (0.4 + fade * 0.6), sun * 0.5);
  }
`

/** 사진 바닥 위 아주 살짝 띄워 얹는 발광 면. */
function GlowOverlay({ fragmentShader }: { fragmentShader: string }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: GLOW_VERTEX,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        // 색이 1을 넘어야 블룸이 받아 번진다.
        toneMapped: false,
      }),
    [fragmentShader],
  )

  useEffect(() => () => material.dispose(), [material])

  const elapsed = useRef(0)
  useFrame((_, delta) => {
    elapsed.current += delta
    material.uniforms.uTime.value = elapsed.current
  })

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, FLOOR_Y + 0.02, 0]}
      material={material}
    >
      <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
    </mesh>
  )
}

function PhotoGround({
  diffuse,
  normal,
  tint,
  roughness,
  normalScale,
}: {
  diffuse: string
  normal: string
  tint: string
  roughness: number
  normalScale: number
}) {
  const { map, normalMap } = usePreparedTextures(diffuse, normal)
  const scale = useMemo(() => new Vector2(normalScale, normalScale), [normalScale])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]}>
      <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
      <meshStandardMaterial
        map={map}
        normalMap={normalMap}
        normalScale={scale}
        color={tint}
        roughness={roughness}
        metalness={0}
      />
    </mesh>
  )
}

export function Ground({ difficulty }: { difficulty: Difficulty }) {
  if (difficulty === 'hell') {
    return (
      <>
        <PhotoGround
          diffuse="/textures/scorched_diff.jpg"
          normal="/textures/scorched_nor.jpg"
          // 사진을 어둡게 눌러야 틈의 빨강이 더 뜨거워 보인다.
          tint="#3a1410"
          roughness={0.95}
          normalScale={1.6}
        />
        <GlowOverlay fragmentShader={LAVA_GLOW} />
      </>
    )
  }

  if (difficulty === 'easy') {
    return (
      <>
        <PhotoGround
          diffuse="/textures/grass_diff.jpg"
          normal="/textures/grass_nor.jpg"
          // 사진의 짙은 초록을 연두 쪽으로 끌어올린다.
          tint="#cfe86a"
          roughness={0.85}
          normalScale={1.2}
        />
        <GlowOverlay fragmentShader={SUN_GLOW} />
      </>
    )
  }

  // 보통 난이도는 원기둥이 반사되는 매끈한 바닥을 그대로 쓴다.
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]}>
      <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
      <MeshReflectorMaterial
        resolution={1024}
        mixBlur={1}
        mixStrength={42}
        blur={[320, 110]}
        mirror={0.55}
        depthScale={1.1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.35}
        color="#181822"
        metalness={0.65}
        roughness={0.92}
      />
    </mesh>
  )
}
