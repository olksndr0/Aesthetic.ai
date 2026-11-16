'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'

import { ZONES, buildHead, buildHeadGrid, type ZoneName } from './head-geometry'

export type SceneMode = 'hero' | 'idle' | 'zones' | 'sweep'

/** Where the cursor is, in the canvas's own -1..1 space. It may lie outside it: the head still looks that way. */
type Pointer = { target: THREE.Vector2; smooth: THREE.Vector2; isActive: boolean }

// One vertex program for the three layers of the head (depth shell, contour
// lines, light points), so they morph and react to the cursor together.
const VERTEX = /* glsl */ `
  attribute vec3 aAfter;
  attribute float aSeed;
  uniform float uTime;
  uniform float uSweep;
  uniform float uSweepOn;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3 uZone;
  uniform float uZoneOn;
  uniform vec3 uRayOrigin;
  uniform vec3 uRayDir;
  uniform float uHover;
  uniform float uShrink;
  varying float vAlpha;

  void main() {
    vec4 worldBefore = modelMatrix * vec4(position, 1.0);
    // Right of the sweep line the head takes its refined shape.
    float refined = uSweepOn * smoothstep(uSweep - 0.05, uSweep + 0.05, worldBefore.x);
    vec3 p = mix(position, aAfter, refined);

    // The cursor's ray, in the head's own space: the surface under it lifts and ripples.
    vec3 rel = p - uRayOrigin;
    vec3 off = rel - uRayDir * dot(rel, uRayDir);
    float dist = length(off);
    float facing = smoothstep(0.0, 0.35, dot(normal, -uRayDir));
    float touch = uHover * facing * smoothstep(0.44, 0.0, dist);
    float ripple = 0.5 + 0.5 * sin(dist * 26.0 - uTime * 5.0);
    float drift = sin(uTime * 2.3 + aSeed * 60.0);
    p += normal * touch * (0.045 + 0.05 * ripple + 0.035 * drift);
    p += (off / max(dist, 0.001)) * touch * 0.035;
    p *= uShrink;

    vec4 world = modelMatrix * vec4(p, 1.0);
    vec4 mv = viewMatrix * world;
    vec3 n = normalize(normalMatrix * normal);

    float rim = pow(1.0 - abs(n.z), 2.5);
    // A key light from the upper left models the features; the rim outlines the head.
    float lit = pow(max(dot(n, normalize(vec3(-0.62, 0.38, 0.68))), 0.0), 2.4);
    float band = uSweepOn * exp(-pow((world.x - uSweep) / 0.04, 2.0));
    float zone = uZoneOn * smoothstep(0.34, 0.0, distance(position, uZone));
    float twinkle = 0.85 + 0.15 * sin(uTime * 1.3 + aSeed * 40.0);

    // A weak fill from the lower right keeps the shadow side readable as a surface.
    float fill = pow(max(dot(n, normalize(vec3(0.7, -0.15, 0.6))), 0.0), 2.0);
    vAlpha = (0.05 + 1.15 * lit + 0.28 * fill + 0.35 * rim + 0.1 * refined) * twinkle + 0.9 * band + 0.85 * zone + 0.75 * touch;
    vAlpha *= mix(0.22, 1.0, smoothstep(-0.15, 0.15, n.z));

    gl_PointSize = uSize * uPixelRatio * (1.0 + 1.5 * band + 1.3 * zone + 0.9 * touch) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const POINT_FRAGMENT = /* glsl */ `
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float soft = smoothstep(0.5, 0.12, d);
    gl_FragColor = vec4(vec3(1.0), vAlpha * soft);
  }
`

const LINE_FRAGMENT = /* glsl */ `
  varying float vAlpha;

  void main() {
    gl_FragColor = vec4(vec3(1.0), (0.1 + min(vAlpha, 1.6)) * 0.24);
  }
`

const SHELL_FRAGMENT = /* glsl */ `
  void main() {
    gl_FragColor = vec4(0.0);
  }
`

const ZONE_CYCLE: ZoneName[] = ['nose', 'lips', 'jaw', 'eyes']

function createHead(count: number) {
  const cloud = buildHead(count)
  const grid = buildHeadGrid()

  const points = new THREE.BufferGeometry()
  points.setAttribute('position', new THREE.BufferAttribute(cloud.before, 3))
  points.setAttribute('aAfter', new THREE.BufferAttribute(cloud.after, 3))
  points.setAttribute('normal', new THREE.BufferAttribute(cloud.normals, 3))
  points.setAttribute('aSeed', new THREE.BufferAttribute(cloud.seeds, 1))

  const gridAttributes = {
    position: new THREE.BufferAttribute(grid.positions, 3),
    aAfter: new THREE.BufferAttribute(grid.after, 3),
    normal: new THREE.BufferAttribute(grid.normals, 3),
    aSeed: new THREE.BufferAttribute(new Float32Array(grid.positions.length / 3), 1),
  }
  const shell = new THREE.BufferGeometry()
  const lines = new THREE.BufferGeometry()
  for (const [name, attribute] of Object.entries(gridAttributes)) {
    shell.setAttribute(name, attribute)
    lines.setAttribute(name, attribute)
  }
  shell.setIndex(new THREE.BufferAttribute(grid.triangles, 1))
  lines.setIndex(new THREE.BufferAttribute(grid.lines, 1))

  // The three materials share these objects, so one write per frame drives all of them.
  const uniforms = {
    uTime: { value: 0 },
    uSweep: { value: 0 },
    uSweepOn: { value: 0 },
    uSize: { value: 15 },
    uPixelRatio: { value: 1 },
    uZone: { value: new THREE.Vector3() },
    uZoneOn: { value: 0 },
    uRayOrigin: { value: new THREE.Vector3(0, 0, 10) },
    uRayDir: { value: new THREE.Vector3(0, 0, -1) },
    uHover: { value: 0 },
  }

  const pointMaterial = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...uniforms, uShrink: { value: 1 } },
  })
  const lineMaterial = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: LINE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...uniforms, uShrink: { value: 0.995 } },
  })
  // Writes depth only: it hides the far side of the head, which is what makes it a volume.
  const shellMaterial = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: SHELL_FRAGMENT,
    colorWrite: false,
    side: THREE.DoubleSide,
    uniforms: { ...uniforms, uShrink: { value: 0.965 } },
  })

  return { uniforms, geometries: [points, shell, lines], materials: [pointMaterial, lineMaterial, shellMaterial], points, shell, lines, pointMaterial, lineMaterial, shellMaterial }
}

function Head({ mode, count, pointer }: { mode: SceneMode; count: number; pointer: MutableRefObject<Pointer> }) {
  const group = useRef<THREE.Group>(null)
  const line = useRef<THREE.Mesh>(null)
  const head = useMemo(() => createHead(count), [count])
  const scratch = useMemo(
    () => ({ raycaster: new THREE.Raycaster(), inverse: new THREE.Matrix4(), zone: new THREE.Vector3(), ndc: new THREE.Vector2() }),
    [],
  )

  useEffect(
    () => () => {
      for (const geometry of head.geometries) geometry.dispose()
      for (const material of head.materials) material.dispose()
    },
    [head],
  )

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const { uniforms } = head
    const ease = Math.min(1, delta * 3)
    const sweeping = mode === 'hero' || mode === 'sweep'
    const sweepX = Math.sin(t * 0.55) * 0.72

    // The smoothed cursor trails the real one; the gap between them is how fast it is moving.
    const { target, smooth, isActive } = pointer.current
    smooth.lerp(target, 1 - Math.exp(-delta * 6))
    const lag = smooth.distanceTo(target)
    const lookX = THREE.MathUtils.clamp(smooth.x, -1.5, 1.5)
    const lookY = THREE.MathUtils.clamp(smooth.y, -1.5, 1.5)
    const isOver = isActive && Math.abs(smooth.x) < 1.1 && Math.abs(smooth.y) < 1.1

    uniforms.uTime.value = t
    uniforms.uPixelRatio.value = state.viewport.dpr
    uniforms.uSweep.value = sweepX
    uniforms.uSweepOn.value = THREE.MathUtils.lerp(uniforms.uSweepOn.value, sweeping ? 1 : 0, ease)
    uniforms.uZoneOn.value = THREE.MathUtils.lerp(uniforms.uZoneOn.value, mode === 'zones' ? 1 : 0, ease)
    uniforms.uHover.value = THREE.MathUtils.lerp(uniforms.uHover.value, isOver ? 0.6 + Math.min(0.4, lag * 1.6) : 0, Math.min(1, delta * 5))

    if (mode === 'zones') {
      const zone = ZONES[ZONE_CYCLE[Math.floor(t / 1.8) % ZONE_CYCLE.length] ?? 'nose']
      uniforms.uZone.value.lerp(scratch.zone.set(zone[0], zone[1], zone[2]), ease)
    }

    if (group.current) {
      // The head keeps a slow life of its own and turns towards the cursor on top of it.
      const sway = mode === 'idle' ? t * 0.35 : Math.sin(t * 0.32) * (mode === 'zones' ? 0.2 : 0.24)
      const targetY = sway + lookX * 0.4
      const targetX = -lookY * 0.26 + Math.sin(t * 0.21) * 0.03
      group.current.rotation.y = mode === 'idle' ? targetY : THREE.MathUtils.lerp(group.current.rotation.y, targetY, ease)
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, targetX, ease)
      group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, -lookX * 0.04, ease)
      group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, lookX * 0.05, ease)
      group.current.position.y = 0.22 + Math.sin(t * 0.6) * 0.012
      group.current.updateMatrixWorld()

      scratch.raycaster.setFromCamera(scratch.ndc.copy(smooth), state.camera)
      scratch.inverse.copy(group.current.matrixWorld).invert()
      uniforms.uRayOrigin.value.copy(scratch.raycaster.ray.origin).applyMatrix4(scratch.inverse)
      uniforms.uRayDir.value.copy(scratch.raycaster.ray.direction).transformDirection(scratch.inverse)
    }

    if (line.current) {
      line.current.position.x = sweepX
      const lineMaterial = line.current.material as THREE.MeshBasicMaterial
      lineMaterial.opacity = THREE.MathUtils.lerp(lineMaterial.opacity, sweeping ? 0.55 : 0, ease)
    }
  })

  return (
    <>
      <group ref={group} position={[0, 0.22, 0]}>
        <mesh geometry={head.shell} material={head.shellMaterial} frustumCulled={false} renderOrder={0} />
        <lineSegments geometry={head.lines} material={head.lineMaterial} frustumCulled={false} renderOrder={1} />
        <points geometry={head.points} material={head.pointMaterial} frustumCulled={false} renderOrder={2} />
      </group>
      <mesh ref={line} position={[0, 0, 1.2]} renderOrder={3}>
        <planeGeometry args={[0.004, 3.2]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  )
}

function Dust({ pointer }: { pointer: MutableRefObject<Pointer> }) {
  const points = useRef<THREE.Points>(null)
  const geometry = useMemo(() => {
    const positions = new Float32Array(260 * 3)
    for (let i = 0; i < 260; i += 1) {
      // Deterministic scatter: the same field on the server pass and every visit.
      positions[i * 3] = (((i * 0.754877) % 1) - 0.5) * 7
      positions[i * 3 + 1] = (((i * 0.569840) % 1) - 0.5) * 4.5
      positions[i * 3 + 2] = (((i * 0.362437) % 1) - 0.5) * 3 - 1
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((state, delta) => {
    if (!points.current) return
    const { smooth } = pointer.current
    const ease = Math.min(1, delta * 2)
    // The field slides against the cursor, which sets it behind the head.
    points.current.rotation.y = state.clock.elapsedTime * 0.012
    points.current.position.x = THREE.MathUtils.lerp(points.current.position.x, -THREE.MathUtils.clamp(smooth.x, -1.5, 1.5) * 0.14, ease)
    points.current.position.y = THREE.MathUtils.lerp(
      points.current.position.y,
      Math.sin(state.clock.elapsedTime * 0.2) * 0.05 - THREE.MathUtils.clamp(smooth.y, -1.5, 1.5) * 0.09,
      ease,
    )
  })

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial color="#ffffff" size={0.012} transparent opacity={0.28} depthWrite={false} sizeAttenuation />
    </points>
  )
}

function Scene({ mode, count }: { mode: SceneMode; count: number }) {
  const canvas = useThree(state => state.gl.domElement)
  const pointer = useRef<Pointer>({ target: new THREE.Vector2(), smooth: new THREE.Vector2(), isActive: false })

  // Listens on the window, not the canvas: the head follows the cursor across the whole page.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      pointer.current.target.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1))
      pointer.current.isActive = true
    }
    const release = () => {
      pointer.current.isActive = false
    }
    // A finger leaves no cursor behind: let the surface settle when it lifts.
    const onUp = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') release()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', release, { passive: true })
    document.documentElement.addEventListener('mouseleave', release)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', release)
      document.documentElement.removeEventListener('mouseleave', release)
    }
  }, [canvas])

  return (
    <>
      <Head mode={mode} count={count} pointer={pointer} />
      <Dust pointer={pointer} />
    </>
  )
}

export default function FaceScene({ mode, label }: { mode: SceneMode; label: string }) {
  const wrapper = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(true)
  const [settings, setSettings] = useState({ count: 9000, isReduced: false })

  useEffect(() => {
    setSettings({
      count: window.innerWidth < 768 ? 5200 : 11000,
      isReduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })

    const node = wrapper.current
    if (!node) return
    // The scene stops rendering while it is off screen.
    const observer = new IntersectionObserver(entries => setIsVisible(entries[0]?.isIntersecting ?? true), { rootMargin: '120px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={wrapper} role="img" aria-label={label} className="h-full w-full">
      <Canvas
        dpr={[1, 1.6]}
        camera={{ position: [0, 0, 5.1], fov: 32 }}
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
        frameloop={isVisible && !settings.isReduced ? 'always' : 'demand'}
      >
        <Scene mode={mode} count={settings.count} />
      </Canvas>
    </div>
  )
}
