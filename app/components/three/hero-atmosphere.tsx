'use client'

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import { makeWispTexture, mulberry32 } from './textures'

/*
  A transparent overlay for the home hero: the G-Fest photo stays the
  full-bleed star while fog wisps slide across the stage and fireflies
  drift up through the dusk. Pointer events pass through; this is pure
  atmosphere. (An edge-tree framing was tried and cut — hard silhouettes
  fight the photograph.)
*/

function HeroWisps() {
  const tex = useMemo(() => makeWispTexture(), [])
  const group = useRef<THREE.Group>(null)
  const wisps = useMemo(() => {
    const rng = mulberry32(31)
    return Array.from({ length: 4 }, () => ({
      baseX: (rng() * 2 - 1) * 5,
      y: -2.6 + rng() * 2.2,
      z: 1 + rng(),
      w: 9 + rng() * 6,
      speed: 0.025 + rng() * 0.03,
      phase: rng() * Math.PI * 2,
      opacity: 0.07 + rng() * 0.05,
    }))
  }, [])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    group.current?.children.forEach((child, i) => {
      const w = wisps[i]
      child.position.x = w.baseX + Math.sin(t * w.speed + w.phase) * 3.4
    })
  })
  return (
    <group ref={group}>
      {wisps.map((w, i) => (
        <mesh key={i} position={[w.baseX, w.y, w.z]}>
          <planeGeometry args={[w.w, w.w * 0.32]} />
          <meshBasicMaterial map={tex} transparent opacity={w.opacity} depthWrite={false} color="#e8dcc6" />
        </mesh>
      ))}
    </group>
  )
}

const FLY_VERT = `
attribute float aPhase;
attribute float aSize;
uniform float uTime;
varying float vTwinkle;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.09 + aPhase * 11.0) * 0.8;
  p.y += sin(uTime * 0.07 + aPhase * 5.0) * 0.6 + uTime * 0.01;
  p.y = mod(p.y + 3.5, 7.0) - 3.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * (170.0 / -mv.z);
  vTwinkle = 0.2 + 0.8 * pow(0.5 + 0.5 * sin(uTime * (0.5 + aPhase) + aPhase * 29.0), 2.4);
  gl_Position = projectionMatrix * mv;
}
`

const FLY_FRAG = `
precision mediump float;
varying float vTwinkle;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d) * vTwinkle;
  gl_FragColor = vec4(vec3(0.914, 0.725, 0.286) * a, a);
}
`

function Fireflies() {
  const count = 60
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
  const { positions, phases, sizes } = useMemo(() => {
    const rng = mulberry32(5)
    const positions = new Float32Array(count * 3)
    const phases = new Float32Array(count)
    const sizes = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rng() * 2 - 1) * 7.5
      positions[i * 3 + 1] = -3 + rng() * 5
      positions[i * 3 + 2] = -1 + rng() * 3
      phases[i] = rng() * Math.PI * 2
      sizes[i] = 0.4 + rng() * 1
    }
    return { positions, phases, sizes }
  }, [])
  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime
  })
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={FLY_VERT}
        fragmentShader={FLY_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

function SwayCam() {
  useFrame((state) => {
    const t = state.clock.elapsedTime
    state.camera.position.x = Math.sin(t * 0.05) * 0.25
    state.camera.lookAt(0, 0, 0)
  })
  return null
}

export default function HeroAtmosphere() {
  const reducedMotion = useReducedMotion()

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 8], fov: 50 }}
      gl={{ alpha: true, antialias: true, toneMapping: THREE.NoToneMapping }}
      frameloop={reducedMotion ? 'demand' : 'always'}
      fallback={null}
    >
      <HeroWisps />
      <Fireflies />
      {!reducedMotion && <SwayCam />}
    </Canvas>
  )
}
