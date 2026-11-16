import * as THREE from 'three'

/** Camera pose of the stage, as angles around the skull. */
export type StagePose = {
  /** Degrees; positive turns the skull to show the patient's left side. */
  yaw: number
  /** Degrees; positive looks at the skull from above. */
  pitch: number
  /** 1 fits the whole skull; larger moves closer. */
  zoom: number
  /** Where the view centres, as a fraction of the skull's height above (+) or below (-) its middle. */
  lift: number
}

const BONE = new THREE.Color('#e9e1cf')
const SHADE = new THREE.Color('#15100b')
const FOV = 22

/** Reads public/models/skull.bin: positions in mm, baked occlusion, indices. */
export async function loadSkullGeometry(url = '/models/skull.bin'): Promise<THREE.BufferGeometry> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('The 3D model could not be loaded.')
  const buffer = await response.arrayBuffer()
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== 0x314c4b53) throw new Error('Unexpected model file.')
  const vertices = view.getUint32(4, true)
  const triangles = view.getUint32(8, true)
  const positions = new Float32Array(buffer, 12, vertices * 3)
  const occlusion = new Uint8Array(buffer, 12 + vertices * 12, vertices)
  const indexOffset = 12 + vertices * 12 + Math.ceil(vertices / 4) * 4
  const indices = vertices > 65535 ? new Uint32Array(buffer, indexOffset, triangles * 3) : new Uint16Array(buffer, indexOffset, triangles * 3)

  // Occlusion darkens crevices toward a warm shadow instead of plain grey.
  const colours = new Float32Array(vertices * 3)
  const colour = new THREE.Color()
  for (let v = 0; v < vertices; v += 1) {
    colour.copy(SHADE).lerp(BONE, (occlusion[v]! / 255) ** 1.7)
    colours[v * 3] = colour.r
    colours[v * 3 + 1] = colour.g
    colours[v * 3 + 2] = colour.b
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  return geometry
}

/**
 * A lit skull mannequin on a transparent canvas, posed from outside (for the
 * scroll-driven slideshow). Renders only when the pose or the size changes.
 */
export class SkullStage {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 10, 5000)
  private readonly pivot = new THREE.Group()
  private readonly observer: ResizeObserver
  private radius = 120
  private height = 220
  private frame = 0
  private pose: StagePose = { yaw: 0, pitch: 0, zoom: 1, lift: 0 }

  constructor(private readonly container: HTMLElement, geometry: THREE.BufferGeometry) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    Object.assign(this.renderer.domElement.style, { display: 'block', width: '100%', height: '100%' })
    container.appendChild(this.renderer.domElement)

    const box = geometry.boundingBox!
    const centre = box.getCenter(new THREE.Vector3())
    this.height = box.max.y - box.min.y
    this.radius = box.getBoundingSphere(new THREE.Sphere()).radius
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.02 }))
    mesh.position.copy(centre).multiplyScalar(-1)
    this.pivot.add(mesh)
    this.scene.add(this.pivot)

    // Key from the upper left, a cool fill, and a rim from behind to lift the outline off the dark page.
    const key = new THREE.DirectionalLight(0xfff4e6, 2.6)
    key.position.set(-260, 320, 420)
    const fill = new THREE.DirectionalLight(0xbfd0ff, 0.55)
    fill.position.set(380, -40, 260)
    const rim = new THREE.DirectionalLight(0xffffff, 1.5)
    rim.position.set(120, 200, -420)
    this.scene.add(key, fill, rim, new THREE.HemisphereLight(0xffffff, 0x20180f, 0.55))

    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(container)
    this.resize()
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.setPose(this.pose)
  }

  setPose(pose: StagePose): void {
    this.pose = pose
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      const { yaw, pitch, zoom, lift } = this.pose
      // The skull turns; camera and lights stay, so the light models the form as it rotates.
      this.pivot.rotation.set((pitch * Math.PI) / 180, (-yaw * Math.PI) / 180, 0)
      const vertical = (FOV * Math.PI) / 180
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect)
      const distance = (this.radius * 1.08) / Math.sin(Math.min(vertical, horizontal) / 2) / zoom
      this.camera.position.set(0, lift * this.height, distance)
      this.camera.lookAt(0, lift * this.height, 0)
      this.renderer.render(this.scene, this.camera)
    })
  }

  /** PNG of the current pose at a fixed size, for generating placeholder images. */
  snapshot(pose: StagePose, width: number, height: number, background: string): string {
    const size = this.renderer.getSize(new THREE.Vector2())
    const ratio = this.renderer.getPixelRatio()
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.scene.background = new THREE.Color(background)
    const { yaw, pitch, zoom, lift } = pose
    this.pivot.rotation.set((pitch * Math.PI) / 180, (-yaw * Math.PI) / 180, 0)
    const vertical = (FOV * Math.PI) / 180
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect)
    const distance = (this.radius * 1.08) / Math.sin(Math.min(vertical, horizontal) / 2) / zoom
    this.camera.position.set(0, lift * this.height, distance)
    this.camera.lookAt(0, lift * this.height, 0)
    this.renderer.render(this.scene, this.camera)
    const data = this.renderer.domElement.toDataURL('image/png')
    this.scene.background = null
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(size.x, size.y, false)
    this.resize()
    return data
  }
}
