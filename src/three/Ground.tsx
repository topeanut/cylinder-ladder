import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import { ShaderMaterial } from 'three'
import type { Difficulty } from '../lib/types'
import { CYLINDER_HEIGHT } from '../lib/geometry'

/**
 * 난이도마다 다른 바닥.
 *
 * 배경 이미지를 쓰지 않고 셰이더로 그린다. 파일이 붙지 않아 로딩이 없고,
 * 시간에 따라 흐르는 애니메이션이 공짜로 따라온다. 두 셰이더 모두 값싼
 * 값잡음(value noise)을 여러 겹 쌓는 FBM 하나에서 나온다.
 */

const FLOOR_Y = -CYLINDER_HEIGHT / 2 - 1.1
const FLOOR_SIZE = 90

/** 두 셰이더가 공유하는 잡음 함수. */
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

const GROUND_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * 용암.
 *
 * 갈라진 지각(어두운 부분)과 그 틈으로 보이는 마그마(밝은 부분)를 잡음 하나로
 * 나눈다. 임계값 근처를 부드럽게 이어 붙이면 식어 굳은 가장자리가 생긴다.
 */
const LAVA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  ${NOISE}

  void main() {
    vec2 p = (vUv - 0.5) * 26.0;

    // 두 겹이 서로 다른 속도로 흘러야 "굳은 표면 밑에서 움직이는" 느낌이 난다.
    float flow = fbm(p + vec2(uTime * 0.06, uTime * -0.04));
    float crack = fbm(p * 0.6 + flow * 1.4 + vec2(0.0, uTime * 0.02));

    // 0.5를 경계로 지각과 마그마를 가른다.
    float molten = smoothstep(0.52, 0.34, crack);

    vec3 crustColor = mix(vec3(0.05, 0.03, 0.03), vec3(0.16, 0.08, 0.07), flow);
    vec3 magmaColor = mix(vec3(1.6, 0.32, 0.03), vec3(3.0, 1.4, 0.12), molten);

    vec3 color = mix(crustColor, magmaColor, molten);

    // 중앙에서 멀어질수록 어둡게 해 원기둥에 시선이 모이게 한다.
    float fade = 1.0 - smoothstep(0.18, 0.5, distance(vUv, vec2(0.5)));
    gl_FragColor = vec4(color * (0.35 + fade * 0.9), 1.0);
  }
`

/** 풀밭. 잡음으로 초록의 농담을 흩뜨리고 옅은 이슬 반점을 얹는다. */
const GRASS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  ${NOISE}

  void main() {
    vec2 p = (vUv - 0.5) * 34.0;

    // 바람에 눕는 결. 가로로만 아주 천천히 흐른다.
    float sway = sin(p.y * 0.6 + uTime * 0.35) * 0.12;
    float patch = fbm(p + vec2(sway, 0.0));
    float blades = valueNoise(p * 6.0 + vec2(sway * 3.0, 0.0));

    vec3 dark = vec3(0.03, 0.11, 0.05);
    vec3 mid = vec3(0.09, 0.28, 0.12);
    vec3 light = vec3(0.24, 0.55, 0.22);

    vec3 color = mix(dark, mid, patch);
    color = mix(color, light, blades * patch * 0.55);

    float fade = 1.0 - smoothstep(0.2, 0.52, distance(vUv, vec2(0.5)));
    gl_FragColor = vec4(color * (0.3 + fade * 1.0), 1.0);
  }
`

function ShaderGround({ fragmentShader }: { fragmentShader: string }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: GROUND_VERTEX,
        fragmentShader,
        // 마그마가 1을 넘어야 블룸이 받아 번진다.
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
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]} material={material}>
      <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
    </mesh>
  )
}

export function Ground({ difficulty }: { difficulty: Difficulty }) {
  if (difficulty === 'hell') return <ShaderGround fragmentShader={LAVA_FRAGMENT} />
  if (difficulty === 'easy') return <ShaderGround fragmentShader={GRASS_FRAGMENT} />

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
        color="#0c0c10"
        metalness={0.65}
        roughness={0.92}
      />
    </mesh>
  )
}
