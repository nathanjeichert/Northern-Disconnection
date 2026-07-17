'use client'

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import { makeBlurredTreeTexture, makeGlowTexture, makeRayTexture, makeRidgeTexture, makeTreeTexture, makeWispTexture, mulberry32, SCENE_BG } from './textures'

/*
  The sitewide backdrop: a real 3D redwood grove replacing the flat
  gradient wash. Silhouette planes sit in depth-fogged space — exponential
  fog does the tonal grading the old gradient faked — with a moon, light
  shafts, drifting fog wisps, and gold motes. The camera eases toward the
  pointer and sinks slowly as you scroll, so every page descends a little
  further into the grove.
*/

// scroll progress shared between the rig and the effects that dim with depth
const scrollState = { p: 0 }

interface SceneConfig {
  compact: boolean
}

function Trees({ compact }: SceneConfig) {
  const textures = useMemo(() => [makeTreeTexture(1), makeTreeTexture(2), makeTreeTexture(3)], [])
  const trees = useMemo(() => {
    const rng = mulberry32(4021)
    const rows = [
      { z: -3.5, n: compact ? 2 : 4, hMin: 7, hMax: 10, edge: 6.2 },
      { z: -7, n: compact ? 4 : 6, hMin: 6, hMax: 9, spread: 11 },
      { z: -12, n: compact ? 5 : 7, hMin: 7, hMax: 11, spread: 14 },
      { z: -19, n: 8, hMin: 9, hMax: 14, spread: 18 },
      { z: -28, n: 9, hMin: 12, hMax: 18, spread: 24 },
    ]
    const out: { x: number; y: number; z: number; h: number; tex: number; flip: boolean }[] = []
    for (const row of rows) {
      for (let i = 0; i < row.n; i++) {
        const h = row.hMin + rng() * (row.hMax - row.hMin)
        let x: number
        if ('edge' in row && row.edge != null) {
          // near trees hug the edges so page content stays clear
          x = (i % 2 === 0 ? -1 : 1) * (row.edge + rng() * 4)
        } else {
          x = (rng() * 2 - 1) * (row.spread ?? 12)
          if (Math.abs(x) < 2.2 && row.z > -12) x += Math.sign(x || 1) * 3
        }
        out.push({
          x,
          y: -2.4 + h / 2,
          z: row.z + (rng() - 0.5) * 1.5,
          h,
          tex: Math.floor(rng() * 3),
          flip: rng() > 0.5,
        })
      }
    }
    return out
  }, [compact])

  return (
    <group>
      {trees.map((t, i) => (
        <mesh key={i} position={[t.x, t.y, t.z]} scale={[t.h * 0.42 * (t.flip ? -1 : 1), t.h, 1]}>
          <planeGeometry />
          <meshBasicMaterial map={textures[t.tex]} transparent alphaTest={0.2} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

// Out-of-focus giants just in front of the camera plane: at this depth the
// pointer/scroll parallax throws them far across the frame, which is the
// strongest "this is really 3D" cue in the scene.
function NearBokeh({ compact }: SceneConfig) {
  const textures = useMemo(() => [makeBlurredTreeTexture(1), makeBlurredTreeTexture(2)], [])
  if (compact) return null
  return (
    <group>
      <mesh position={[-7.8, 1.2, -1.4]} scale={[7, 17, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={textures[0]} transparent depthWrite={false} opacity={0.88} fog={false} color="#030c07" />
      </mesh>
      <mesh position={[8.4, 0.4, -1.8]} scale={[-6.4, 15.5, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={textures[1]} transparent depthWrite={false} opacity={0.85} fog={false} color="#030c07" />
      </mesh>
    </group>
  )
}

// Broad translucent mist sheets slotted between the tree rows; parallax
// slides the rows against them, so the depth layering stays legible.
function MistSheets() {
  const tex = useMemo(() => makeWispTexture(), [])
  const sheets = [
    { z: -6, y: -1.2, w: 34, opacity: 0.055 },
    { z: -10.5, y: -0.6, w: 44, opacity: 0.075 },
    { z: -16, y: 0.2, w: 60, opacity: 0.095 },
  ]
  return (
    <group>
      {sheets.map((s, i) => (
        <mesh key={i} position={[0, s.y, s.z]}>
          <planeGeometry args={[s.w, s.w * 0.22]} />
          <meshBasicMaterial map={tex} transparent opacity={s.opacity} depthWrite={false} fog={false} />
        </mesh>
      ))}
    </group>
  )
}

function FarRidge() {
  const tex = useMemo(() => makeRidgeTexture(1), [])
  return (
    <mesh position={[0, 3.6, -36]}>
      <planeGeometry args={[110, 13.75]} />
      <meshBasicMaterial map={tex} transparent alphaTest={0.15} depthWrite={false} />
    </mesh>
  )
}

function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -2.4, -18]}>
      <planeGeometry args={[220, 90]} />
      <meshBasicMaterial color="#071510" />
    </mesh>
  )
}

function Moon() {
  const glow = useMemo(() => makeGlowTexture(), [])
  return (
    <group position={[8.4, 6.6, -27]}>
      <sprite scale={[9, 9, 1]}>
        <spriteMaterial map={glow} blending={THREE.AdditiveBlending} depthWrite={false} opacity={0.4} fog={false} />
      </sprite>
      <mesh>
        <circleGeometry args={[1.1, 48]} />
        <meshBasicMaterial color="#f2ecdc" fog={false} />
      </mesh>
    </group>
  )
}

function Rays() {
  const tex = useMemo(() => makeRayTexture(), [])
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const rays = [
    { x: 4.2, w: 2.6, tilt: -0.34, base: 0.1, speed: 0.21 },
    { x: 6.0, w: 1.7, tilt: -0.28, base: 0.085, speed: 0.33 },
    { x: 2.2, w: 3.4, tilt: -0.4, base: 0.07, speed: 0.15 },
  ]
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    rays.forEach((r, i) => {
      const m = mats.current[i]
      if (m) m.opacity = (r.base + 0.035 * (0.5 + 0.5 * Math.sin(t * r.speed + i * 2.1))) * (1 - scrollState.p * 0.75)
      const mesh = meshes.current[i]
      if (mesh) mesh.rotation.z = r.tilt + Math.sin(t * 0.07 + i * 1.7) * 0.025
    })
  })
  return (
    <group position={[0, 1.5, -20]}>
      {rays.map((r, i) => (
        <mesh key={i} ref={(m) => { meshes.current[i] = m }} position={[r.x, 0, 0]} rotation-z={r.tilt}>
          <planeGeometry args={[r.w, 22]} />
          <meshBasicMaterial
            ref={(m) => { mats.current[i] = m }}
            map={tex}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            fog={false}
            opacity={r.base}
          />
        </mesh>
      ))}
    </group>
  )
}

function Wisps({ animate }: { animate: boolean }) {
  const tex = useMemo(() => makeWispTexture(), [])
  const group = useRef<THREE.Group>(null)
  const wisps = useMemo(() => {
    const rng = mulberry32(77)
    return Array.from({ length: 5 }, (_, i) => ({
      baseX: (rng() * 2 - 1) * 8,
      y: -1.6 + rng() * 2.4,
      z: -5 - i * 4 - rng() * 2,
      w: 13 + rng() * 8,
      speed: 0.02 + rng() * 0.025,
      phase: rng() * Math.PI * 2,
      opacity: 0.07 + rng() * 0.06,
    }))
  }, [])
  useFrame((state) => {
    if (!animate || !group.current) return
    const t = state.clock.elapsedTime
    group.current.children.forEach((child, i) => {
      const w = wisps[i]
      child.position.x = w.baseX + Math.sin(t * w.speed + w.phase) * 4
    })
  })
  return (
    <group ref={group}>
      {wisps.map((w, i) => (
        <mesh key={i} position={[w.baseX, w.y, w.z]}>
          <planeGeometry args={[w.w, w.w * 0.34]} />
          <meshBasicMaterial map={tex} transparent opacity={w.opacity} depthWrite={false} fog={false} />
        </mesh>
      ))}
    </group>
  )
}

const MOTE_VERT = `
attribute float aPhase;
attribute float aSize;
uniform float uTime;
varying float vTwinkle;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.06 + aPhase * 13.0) * 1.4;
  p.y += sin(uTime * 0.045 + aPhase * 7.0) * 0.9;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * (240.0 / -mv.z);
  vTwinkle = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * (0.4 + aPhase) + aPhase * 31.0), 2.0);
  gl_Position = projectionMatrix * mv;
}
`

const MOTE_FRAG = `
precision mediump float;
varying float vTwinkle;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.08, d) * vTwinkle;
  gl_FragColor = vec4(vec3(0.914, 0.725, 0.286) * a, a);
}
`

function Motes({ compact }: SceneConfig) {
  const count = compact ? 130 : 240
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
  const { positions, phases, sizes } = useMemo(() => {
    const rng = mulberry32(9)
    const positions = new Float32Array(count * 3)
    const phases = new Float32Array(count)
    const sizes = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rng() * 2 - 1) * 13
      positions[i * 3 + 1] = -2.2 + rng() * 6
      positions[i * 3 + 2] = -3 - rng() * 26
      phases[i] = rng() * Math.PI * 2
      sizes[i] = 0.7 + rng() * 1.7
    }
    return { positions, phases, sizes }
  }, [count])
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
        vertexShader={MOTE_VERT}
        fragmentShader={MOTE_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

function CameraRig({ animate }: { animate: boolean }) {
  const { camera, scene } = useThree()
  useFrame((state) => {
    if (!animate) return
    const doc = document.documentElement
    const max = Math.max(1, doc.scrollHeight - window.innerHeight)
    const target = Math.min(1, window.scrollY / max)
    scrollState.p += (target - scrollState.p) * 0.06
    const p = scrollState.p
    const t = state.clock.elapsedTime
    // idle drift keeps the parallax visible even before the pointer moves
    const driftX = Math.sin(t * 0.05) * 0.4
    camera.position.x += (state.pointer.x * 1.6 + driftX - camera.position.x) * 0.03
    camera.position.y += (0.5 - p * 3.0 + state.pointer.y * 0.5 - camera.position.y) * 0.05
    camera.lookAt(camera.position.x * 0.35, 0.1 - p * 1.9, -14)
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = 0.032 + p * 0.02
  })
  return null
}

export default function ForestScene() {
  const reducedMotion = useReducedMotion()
  const compact = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
    []
  )
  const animate = !reducedMotion

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.5, 9], fov: 55, near: 0.1, far: 90 }}
      gl={{ antialias: true, toneMapping: THREE.NoToneMapping, powerPreference: 'high-performance' }}
      frameloop={animate ? 'always' : 'demand'}
      fallback={null}
    >
      <color attach="background" args={[SCENE_BG]} />
      <fogExp2 attach="fog" args={[SCENE_BG, 0.032]} />
      <FarRidge />
      <Trees compact={compact} />
      <MistSheets />
      <NearBokeh compact={compact} />
      <Ground />
      <Moon />
      <Rays />
      <Wisps animate={animate} />
      <Motes compact={compact} />
      <CameraRig animate={animate} />
    </Canvas>
  )
}
