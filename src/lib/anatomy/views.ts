import { normalize, type Vec3 } from './math'

/**
 * The views used everywhere: photo coverage, viewer presets and result
 * renders. `direction` points from the head to the camera, in the canonical
 * frame (+X patient left, +Y superior, +Z anterior).
 */
export type ViewDefinition = {
  id: string
  label: string
  group: 'standard' | 'axial' | 'oblique'
  direction: Vec3
  up: Vec3
  /** How to take the photograph of this view. */
  photoGuide: string
}

const deg = (value: number) => (value * Math.PI) / 180
/** Camera direction from azimuth (positive toward the patient's left) and elevation (positive from above). */
function orbit(azimuth: number, elevation: number): Vec3 {
  return normalize([Math.sin(deg(azimuth)) * Math.cos(deg(elevation)), Math.sin(deg(elevation)), Math.cos(deg(azimuth)) * Math.cos(deg(elevation))])
}

const UP: Vec3 = [0, 1, 0]

export const VIEW_DEFINITIONS: ViewDefinition[] = [
  { id: 'front', label: 'Front', group: 'standard', direction: orbit(0, 0), up: UP, photoGuide: 'Facing the camera, head level, neutral expression.' },
  { id: 'profile-right', label: 'Right profile', group: 'standard', direction: orbit(-90, 0), up: UP, photoGuide: "The patient's right side toward the camera, head level." },
  { id: 'profile-left', label: 'Left profile', group: 'standard', direction: orbit(90, 0), up: UP, photoGuide: "The patient's left side toward the camera, head level." },
  { id: 'three-quarter-right', label: 'Three-quarter right', group: 'standard', direction: orbit(-45, 0), up: UP, photoGuide: "Camera 45° toward the patient's right." },
  { id: 'three-quarter-left', label: 'Three-quarter left', group: 'standard', direction: orbit(45, 0), up: UP, photoGuide: "Camera 45° toward the patient's left." },
  { id: 'posterior', label: 'Posterior', group: 'standard', direction: orbit(180, 0), up: UP, photoGuide: 'Back of the head, head level.' },
  { id: 'superior', label: 'Superior', group: 'axial', direction: [0, 1, 0], up: [0, 0, 1], photoGuide: 'From above the head, nose toward the top of the picture.' },
  { id: 'inferior', label: 'Inferior (submental)', group: 'axial', direction: [0, -1, 0], up: [0, 0, 1], photoGuide: 'From below the chin, head tilted back.' },
  { id: 'chin-up', label: 'Chin up', group: 'oblique', direction: orbit(0, -30), up: UP, photoGuide: 'Facing the camera with the head tilted back about 30°.' },
  { id: 'chin-down', label: 'Chin down', group: 'oblique', direction: orbit(0, 30), up: UP, photoGuide: 'Facing the camera with the head tilted forward about 30°.' },
  { id: 'chin-up-right', label: 'Chin up, right side', group: 'oblique', direction: orbit(-45, -30), up: UP, photoGuide: "Head tilted back, camera 45° toward the patient's right." },
  { id: 'chin-up-left', label: 'Chin up, left side', group: 'oblique', direction: orbit(45, -30), up: UP, photoGuide: "Head tilted back, camera 45° toward the patient's left." },
  { id: 'chin-down-right', label: 'Chin down, right side', group: 'oblique', direction: orbit(-45, 30), up: UP, photoGuide: "Head tilted forward, camera 45° toward the patient's right." },
  { id: 'chin-down-left', label: 'Chin down, left side', group: 'oblique', direction: orbit(45, 30), up: UP, photoGuide: "Head tilted forward, camera 45° toward the patient's left." },
]

export const VIEW_IDS = VIEW_DEFINITIONS.map(view => view.id)

/** Every result has these three; the three-quarter views are optional. */
export const RESULT_VIEWS = ['front', 'profile-left', 'profile-right'] as const
export const OPTIONAL_RESULT_VIEWS = ['three-quarter-left', 'three-quarter-right'] as const

export function viewDefinition(id: string): ViewDefinition | undefined {
  return VIEW_DEFINITIONS.find(view => view.id === id)
}

export function isViewId(value: unknown): value is string {
  return typeof value === 'string' && VIEW_IDS.includes(value)
}
