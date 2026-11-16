import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import type { Vec3 } from '@/lib/anatomy/math'
import type { Mesh } from '@/lib/anatomy/mesh'
import type { ViewDefinition } from '@/lib/anatomy/views'

import { STATUS_COLOURS, type MarkerStatus } from './status'

export type LayerName = 'skull' | 'face'
export type ModelState = 'before' | 'after'
export type Marker = { id: string; label: string; position: Vec3; status: MarkerStatus }
export type MeasureLine = { points: Vec3[]; label: string }
export type PickHit = { layer: LayerName | 'implant'; point: Vec3 }

const LAYER_COLOURS: Record<LayerName, string> = { skull: '#e9e3d3', face: '#d2c7bd' }
const IMPLANT_COLOUR = '#7fb2ff'
const CHANGE_COLOUR = new THREE.Color('#ffb454')
// A long lens, as in clinical photography: little perspective distortion.
const FOV_DEG = 14
const CAPTURE_BACKGROUND = '#c8c8c8'

type Layer = { object: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; before: Float32Array; after: Float32Array | null; change: Float32Array | null }
type Label = { element: HTMLElement; position: THREE.Vector3 }

/**
 * The 3D view of a case: skull, facial surface and implants as separate
 * layers in the canonical frame (mm), landmarks and measures on top, and the
 * fixed cameras used to render result views. Every view of a result is drawn
 * from the geometry held here, so all views share one model state.
 */
export class AnatomyViewer {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 1, 10_000)
  private readonly controls: OrbitControls
  private readonly headlight = new THREE.DirectionalLight(0xffffff, 2.1)
  private readonly overlay: HTMLDivElement
  private readonly layers = new Map<LayerName, Layer>()
  private readonly implants = new THREE.Group()
  private readonly markers = new THREE.Group()
  private readonly lines = new THREE.Group()
  private labels: Label[] = []
  private axisLabels: Label[] = []
  private state: ModelState = 'before'
  private highlight = true
  private frameRequest = 0
  private readonly resizeObserver: ResizeObserver
  private pointerDown: { x: number; y: number } | null = null

  onPick: ((hit: PickHit) => void) | null = null
  /** Layers a click may land on. Empty disables picking. */
  pickLayers: Array<LayerName | 'implant'> = []

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    container.appendChild(this.renderer.domElement)

    this.overlay = document.createElement('div')
    Object.assign(this.overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' })
    container.appendChild(this.overlay)

    this.scene.background = new THREE.Color('#0c0c0c')
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1), this.headlight, this.implants, this.markers, this.lines)
    this.camera.position.set(0, 0, 900)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = false
    this.controls.addEventListener('change', () => this.requestRender())

    const canvas = this.renderer.domElement
    canvas.addEventListener('pointerdown', event => {
      this.pointerDown = { x: event.clientX, y: event.clientY }
    })
    canvas.addEventListener('pointerup', event => {
      const start = this.pointerDown
      this.pointerDown = null
      // A click, not the end of a drag.
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) this.pick(event)
    })

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
  }

  dispose(): void {
    cancelAnimationFrame(this.frameRequest)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    for (const name of [...this.layers.keys()]) this.setLayer(name, null)
    this.setImplants([])
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.overlay.remove()
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.requestRender()
  }

  requestRender(): void {
    if (this.frameRequest) return
    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = 0
      this.render()
    })
  }

  private render(): void {
    this.placeHeadlight(this.camera)
    this.renderer.render(this.scene, this.camera)
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    const projected = new THREE.Vector3()
    for (const label of [...this.labels, ...this.axisLabels]) {
      projected.copy(label.position).project(this.camera)
      const visible = projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05
      label.element.style.display = visible ? 'block' : 'none'
      if (visible) label.element.style.transform = `translate(${((projected.x + 1) / 2) * width}px, ${((1 - projected.y) / 2) * height}px)`
    }
  }

  private placeHeadlight(camera: THREE.Camera): void {
    const offset = new THREE.Vector3(-0.35, 0.45, 1).applyQuaternion(camera.quaternion)
    this.headlight.position.copy(this.controls.target).add(offset.multiplyScalar(1000))
    this.headlight.target.position.copy(this.controls.target)
    this.headlight.target.updateMatrixWorld()
  }

  /** Sets or removes a layer. The mesh must be in the canonical frame, millimetres. */
  setLayer(name: LayerName, mesh: Mesh | null): void {
    const existing = this.layers.get(name)
    if (existing) {
      this.scene.remove(existing.object)
      existing.object.geometry.dispose()
      existing.object.material.dispose()
      this.layers.delete(name)
    }
    if (mesh) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.positions), 3))
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()
      const material = new THREE.MeshStandardMaterial({ color: LAYER_COLOURS[name], roughness: 0.75, metalness: 0, side: THREE.DoubleSide })
      const object = new THREE.Mesh(geometry, material)
      object.userData.layer = name
      object.renderOrder = name === 'face' ? 2 : 0
      this.scene.add(object)
      this.layers.set(name, { object, before: mesh.positions, after: null, change: null })
    }
    this.updateAxisLabels()
    this.requestRender()
  }

  hasLayer(name: LayerName): boolean {
    return this.layers.has(name)
  }

  /** Simulated positions of a layer (same vertices, moved) and, for the face, how far each vertex moved. */
  setAfter(name: LayerName, positions: Float32Array | null, change: Float32Array | null = null): void {
    const layer = this.layers.get(name)
    if (!layer) return
    layer.after = positions
    layer.change = change
    this.applyState()
  }

  setState(state: ModelState): void {
    this.state = state
    this.applyState()
  }

  setHighlight(enabled: boolean): void {
    this.highlight = enabled
    this.applyState()
  }

  private applyState(): void {
    for (const [name, layer] of this.layers) {
      const showAfter = this.state === 'after' && layer.after !== null
      this.writePositions(layer, showAfter ? layer.after! : layer.before)
      this.writeColours(layer, name, showAfter && this.highlight ? layer.change : null)
    }
    this.implants.visible = this.implantsWanted && this.state === 'after'
    this.requestRender()
  }

  private writePositions(layer: Layer, positions: Float32Array): void {
    const attribute = layer.object.geometry.getAttribute('position') as THREE.BufferAttribute
    ;(attribute.array as Float32Array).set(positions)
    attribute.needsUpdate = true
    layer.object.geometry.computeVertexNormals()
  }

  /** Tints the skin the simulation moved, in proportion to the displacement. */
  private writeColours(layer: Layer, name: LayerName, change: Float32Array | null): void {
    const geometry = layer.object.geometry
    const material = layer.object.material
    if (!change) {
      if (material.vertexColors) {
        material.vertexColors = false
        material.color.set(LAYER_COLOURS[name])
        material.needsUpdate = true
      }
      return
    }
    let max = 0
    for (let i = 0; i < change.length; i += 3) max = Math.max(max, Math.hypot(change[i]!, change[i + 1]!, change[i + 2]!))
    const base = new THREE.Color(LAYER_COLOURS[name])
    const colours = new Float32Array(change.length)
    for (let i = 0; i < change.length; i += 3) {
      const t = max > 0 ? Math.min(1, Math.hypot(change[i]!, change[i + 1]!, change[i + 2]!) / max) : 0
      colours[i] = base.r + (CHANGE_COLOUR.r - base.r) * t
      colours[i + 1] = base.g + (CHANGE_COLOUR.g - base.g) * t
      colours[i + 2] = base.b + (CHANGE_COLOUR.b - base.b) * t
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    material.vertexColors = true
    material.color.set('#ffffff')
    material.needsUpdate = true
  }

  private implantsWanted = true

  setImplants(meshes: Mesh[]): void {
    for (const child of [...this.implants.children]) {
      const object = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>
      object.geometry.dispose()
      object.material.dispose()
      this.implants.remove(object)
    }
    for (const mesh of meshes) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
      geometry.computeVertexNormals()
      const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: IMPLANT_COLOUR, roughness: 0.4, side: THREE.DoubleSide }))
      object.userData.layer = 'implant'
      object.renderOrder = 1
      this.implants.add(object)
    }
    this.applyState()
  }

  setVisibility(visible: { skull: boolean; face: boolean; implant: boolean; landmarks: boolean }): void {
    const skull = this.layers.get('skull')
    const face = this.layers.get('face')
    if (skull) skull.object.visible = visible.skull
    if (face) face.object.visible = visible.face
    this.implantsWanted = visible.implant
    this.implants.visible = visible.implant && this.state === 'after'
    this.markers.visible = visible.landmarks
    this.lines.visible = visible.landmarks
    this.overlay.style.visibility = visible.landmarks ? 'visible' : 'hidden'
    this.requestRender()
  }

  setFaceOpacity(opacity: number): void {
    const face = this.layers.get('face')
    if (!face) return
    face.object.material.transparent = opacity < 1
    face.object.material.opacity = opacity
    face.object.material.depthWrite = opacity >= 1
    face.object.material.needsUpdate = true
    this.requestRender()
  }

  private makeLabel(text: string, colour: string, position: Vec3, muted = false): Label {
    const element = document.createElement('span')
    element.textContent = text
    Object.assign(element.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      margin: muted ? '-8px 0 0 -5px' : '-22px 0 0 8px',
      font: `${muted ? 12 : 11}px ui-monospace, monospace`,
      letterSpacing: '0.04em',
      color: colour,
      opacity: muted ? '0.7' : '1',
      textShadow: '0 0 4px #000, 0 0 2px #000',
      whiteSpace: 'nowrap',
    })
    this.overlay.appendChild(element)
    return { element, position: new THREE.Vector3(...position) }
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      const object = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>
      object.geometry.dispose()
      object.material.dispose()
      group.remove(object)
    }
  }

  /** Landmarks and measure lines. Positions are canonical millimetres, taken from the calibrated geometry. */
  setAnnotations(markers: Marker[], lines: MeasureLine[]): void {
    this.clearGroup(this.markers)
    this.clearGroup(this.lines)
    for (const label of this.labels) label.element.remove()
    this.labels = []

    for (const marker of markers) {
      const colour = STATUS_COLOURS[marker.status]
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), new THREE.MeshBasicMaterial({ color: colour, depthTest: false }))
      sphere.position.set(...marker.position)
      sphere.renderOrder = 10
      this.markers.add(sphere)
      this.labels.push(this.makeLabel(marker.label, colour, marker.position))
    }
    for (const line of lines) {
      const geometry = new THREE.BufferGeometry().setFromPoints(line.points.map(point => new THREE.Vector3(...point)))
      const object = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, opacity: 0.85 }))
      object.renderOrder = 9
      this.lines.add(object)
      const middle = line.points[Math.floor(line.points.length / 2)]!
      const anchor: Vec3 = line.points.length === 2 ? [(line.points[0]![0] + line.points[1]![0]) / 2, (line.points[0]![1] + line.points[1]![1]) / 2, (line.points[0]![2] + line.points[1]![2]) / 2] : middle
      this.labels.push(this.makeLabel(line.label, '#ffffff', anchor))
    }
    this.requestRender()
  }

  private bounds(): THREE.Sphere | null {
    const box = new THREE.Box3()
    for (const layer of this.layers.values()) {
      box.union(new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(layer.before, 3)))
    }
    return box.isEmpty() ? null : box.getBoundingSphere(new THREE.Sphere())
  }

  /** Anatomical direction letters at the edges of the model, so left and right are never ambiguous. */
  private updateAxisLabels(): void {
    for (const label of this.axisLabels) label.element.remove()
    this.axisLabels = []
    const box = new THREE.Box3()
    for (const layer of this.layers.values()) box.union(new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(layer.before, 3)))
    if (box.isEmpty()) return
    const c = box.getCenter(new THREE.Vector3())
    const pad = 6
    const letters: Array<[string, Vec3]> = [
      ['L', [box.max.x + pad, c.y, c.z]],
      ['R', [box.min.x - pad, c.y, c.z]],
      ['S', [c.x, box.max.y + pad, c.z]],
      ['I', [c.x, box.min.y - pad, c.z]],
      ['A', [c.x, c.y, box.max.z + pad]],
      ['P', [c.x, c.y, box.min.z - pad]],
    ]
    this.axisLabels = letters.map(([text, position]) => this.makeLabel(text, '#ffffff', position, true))
  }

  private fitDistance(radius: number, aspect: number): number {
    const vertical = (FOV_DEG * Math.PI) / 180
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect)
    return (radius * 1.04) / Math.sin(Math.min(vertical, horizontal) / 2)
  }

  /** Moves the interactive camera to a predefined view. */
  setView(view: ViewDefinition): void {
    const sphere = this.bounds()
    if (!sphere) return
    const distance = this.fitDistance(sphere.radius, this.camera.aspect)
    const direction = new THREE.Vector3(...view.direction)
    // Straight up or down is degenerate for an orbit camera: a hair of tilt keeps the nose toward the top of the picture.
    if (Math.abs(direction.y) > 0.999) direction.z = -1e-3 * Math.sign(direction.y)
    this.controls.target.copy(sphere.center)
    this.camera.position.copy(sphere.center).add(direction.normalize().multiplyScalar(distance))
    this.camera.near = Math.max(1, distance - sphere.radius * 3)
    this.camera.far = distance + sphere.radius * 3
    this.camera.updateProjectionMatrix()
    this.controls.update()
    this.requestRender()
  }

  private pick(event: PointerEvent): void {
    if (!this.onPick || this.pickLayers.length === 0) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1))
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, this.camera)
    const targets: THREE.Object3D[] = []
    for (const [name, layer] of this.layers) if (this.pickLayers.includes(name) && layer.object.visible) targets.push(layer.object)
    if (this.pickLayers.includes('implant') && this.implants.visible) targets.push(...this.implants.children)
    const hit = raycaster.intersectObjects(targets, false)[0]
    if (hit) this.onPick({ layer: hit.object.userData.layer as PickHit['layer'], point: [hit.point.x, hit.point.y, hit.point.z] })
  }

  private captureCamera(view: ViewDefinition, width: number, height: number): { camera: THREE.PerspectiveCamera; mmPerPixel: number } | null {
    // Framed on the original face (or skull), so "before" and "after" share camera, scale and pose.
    const reference = this.layers.get('face') ?? this.layers.get('skull')
    if (!reference) return null
    const sphere = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(reference.before, 3)).getBoundingSphere(new THREE.Sphere())
    const distance = this.fitDistance(sphere.radius, width / height)
    const camera = new THREE.PerspectiveCamera(FOV_DEG, width / height, Math.max(1, distance - sphere.radius * 3), distance + sphere.radius * 3)
    camera.up.set(...view.up)
    camera.position.copy(sphere.center).add(new THREE.Vector3(...view.direction).multiplyScalar(distance))
    camera.lookAt(sphere.center)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    return { camera, mmPerPixel: (2 * distance * Math.tan((FOV_DEG * Math.PI) / 360)) / height }
  }

  /** What a result shows: the face when there is one, otherwise the skull with its implants. */
  private subject(): { layer: Layer; name: LayerName } | null {
    const face = this.layers.get('face')
    if (face) return { layer: face, name: 'face' }
    const skull = this.layers.get('skull')
    return skull ? { layer: skull, name: 'skull' } : null
  }

  /**
   * Renders the subject of the result from a fixed camera: the facial
   * surface, or the skull (with implants, after) when no face is loaded.
   * `lit` is the geometric render on a plain background; `outline` is the
   * silhouette (white on black) used to check generated photographs.
   */
  async capture(view: ViewDefinition, options: { state: ModelState; width: number; height: number; mode: 'lit' | 'outline' }): Promise<{ blob: Blob; mmPerPixel: number } | null> {
    const subject = this.subject()
    const setup = this.captureCamera(view, options.width, options.height)
    if (!subject || !setup) return null
    const showImplants = subject.name === 'skull' && options.state === 'after'

    const saved = {
      state: this.state,
      highlight: this.highlight,
      background: this.scene.background,
      pixelRatio: this.renderer.getPixelRatio(),
      size: this.renderer.getSize(new THREE.Vector2()),
      visible: new Map<THREE.Object3D, boolean>(),
      opacity: subject.layer.object.material.opacity,
      transparent: subject.layer.object.material.transparent,
      override: this.scene.overrideMaterial,
    }
    const others: THREE.Object3D[] = [this.implants, this.markers, this.lines, ...[...this.layers.values()].map(layer => layer.object)]
    for (const object of others) saved.visible.set(object, object.visible)
    const material = subject.layer.object.material

    try {
      this.state = options.state
      this.highlight = false
      this.applyState()
      for (const object of others) object.visible = object === subject.layer.object || (object === this.implants && showImplants)
      material.transparent = false
      material.opacity = 1
      material.depthWrite = true
      material.needsUpdate = true
      this.scene.background = new THREE.Color(options.mode === 'outline' ? '#000000' : CAPTURE_BACKGROUND)
      this.scene.overrideMaterial = options.mode === 'outline' ? new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }) : null
      this.renderer.setPixelRatio(1)
      this.renderer.setSize(options.width, options.height, false)
      this.placeHeadlight(setup.camera)
      this.renderer.render(this.scene, setup.camera)
      const blob = await new Promise<Blob | null>(resolve => this.renderer.domElement.toBlob(resolve, 'image/png'))
      return blob ? { blob, mmPerPixel: setup.mmPerPixel } : null
    } finally {
      this.scene.overrideMaterial?.dispose()
      this.scene.overrideMaterial = saved.override
      this.scene.background = saved.background
      for (const [object, visible] of saved.visible) object.visible = visible
      material.transparent = saved.transparent
      material.opacity = saved.opacity
      material.depthWrite = !saved.transparent
      material.needsUpdate = true
      this.renderer.setPixelRatio(saved.pixelRatio)
      this.renderer.setSize(saved.size.x, saved.size.y, false)
      this.state = saved.state
      this.highlight = saved.highlight
      this.applyState()
      this.render()
    }
  }

  /** Bounding box, in pixels of a capture, of what the simulation changed: moved skin, or moved bone and implants when no face is loaded. */
  changedRegion(view: ViewDefinition, width: number, height: number): { x: number; y: number; width: number; height: number } | null {
    const subject = this.subject()
    const setup = this.captureCamera(view, width, height)
    if (!subject?.layer.after || !setup) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const point = new THREE.Vector3()
    const include = (x: number, y: number, z: number) => {
      point.set(x, y, z).project(setup.camera)
      const px = ((point.x + 1) / 2) * width
      const py = ((1 - point.y) / 2) * height
      minX = Math.min(minX, px)
      maxX = Math.max(maxX, px)
      minY = Math.min(minY, py)
      maxY = Math.max(maxY, py)
    }
    const { before, after } = subject.layer
    for (let i = 0; i < after.length; i += 3) {
      if (Math.hypot(after[i]! - before[i]!, after[i + 1]! - before[i + 1]!, after[i + 2]! - before[i + 2]!) >= 0.1) include(after[i]!, after[i + 1]!, after[i + 2]!)
    }
    if (subject.name === 'skull') {
      for (const child of this.implants.children) {
        const positions = (child as THREE.Mesh).geometry.getAttribute('position')
        for (let i = 0; i < positions.count; i += 1) include(positions.getX(i), positions.getY(i), positions.getZ(i))
      }
    }
    if (minX === Infinity) return null
    return { x: Math.max(0, minX), y: Math.max(0, minY), width: Math.max(1, Math.min(width, maxX) - Math.max(0, minX)), height: Math.max(1, Math.min(height, maxY) - Math.max(0, minY)) }
  }
}
