export type ProcedureArea = 'face' | 'body'

export type FocusOption = { id: string; label: string; prompt: string }

export type Procedure = {
  slug: string
  name: string
  area: ProcedureArea
  region: string
  /** Which zone the line illustration lights up. */
  zone: 'nose' | 'lips' | 'chin' | 'jaw' | 'cheeks' | 'face' | 'eyes' | 'brow' | 'forehead' | 'chest' | 'waist' | 'abdomen'
  summary: string
  recovery: string
  /** Available on the free Starter plan. */
  starter: boolean
  /** The anatomical change, written for the image model. `{amount}` is replaced by the intensity wording. */
  edit: string
  focus: FocusOption[]
  photoGuide: string
}

export const PROCEDURES: Procedure[] = [
  {
    slug: 'rhinoplasty',
    name: 'Rhinoplasty',
    area: 'face',
    region: 'Nose',
    zone: 'nose',
    summary: 'Reshapes the bridge, tip or width of the nose while keeping it in proportion with the rest of the face.',
    recovery: '1 to 2 weeks before returning to work; swelling settles over months',
    starter: true,
    edit: 'Apply a {amount} rhinoplasty: refine the shape of the nose only',
    focus: [
      { id: 'balanced', label: 'Balanced refinement', prompt: 'slightly smooth the bridge and refine the tip together' },
      { id: 'bridge', label: 'Smoother bridge', prompt: 'reduce the dorsal hump so the bridge profile is straighter' },
      { id: 'tip', label: 'Refined tip', prompt: 'make the nasal tip slightly narrower and better defined' },
      { id: 'width', label: 'Narrower width', prompt: 'slightly narrow the nostril base and the width of the nose' },
    ],
    photoGuide: 'Front or three-quarter portrait, face fully visible, even light.',
  },
  {
    slug: 'lip-fillers',
    name: 'Lip Fillers',
    area: 'face',
    region: 'Lips',
    zone: 'lips',
    summary: 'Adds volume and definition to the lips with injectable filler.',
    recovery: '1 to 3 days of swelling',
    starter: true,
    edit: 'Apply a {amount} lip filler result: add natural volume to the lips only',
    focus: [
      { id: 'balanced', label: 'Balanced volume', prompt: 'add volume evenly to the upper and lower lip, keeping their natural ratio' },
      { id: 'upper', label: 'Upper lip', prompt: 'add volume mainly to the upper lip and define the cupid’s bow' },
      { id: 'definition', label: 'Border definition', prompt: 'define the lip border with very little added volume' },
    ],
    photoGuide: 'Front portrait, mouth closed and relaxed.',
  },
  {
    slug: 'chin-augmentation',
    name: 'Chin Augmentation',
    area: 'face',
    region: 'Chin',
    zone: 'chin',
    summary: 'Brings the chin forward or adds length to balance the lower face and profile.',
    recovery: '1 to 2 weeks',
    starter: true,
    edit: 'Apply a {amount} chin augmentation: increase the projection of the chin only',
    focus: [
      { id: 'projection', label: 'More projection', prompt: 'bring the chin slightly forward' },
      { id: 'length', label: 'More length', prompt: 'add slight vertical length to the chin' },
      { id: 'shape', label: 'Softer shape', prompt: 'round and balance the chin contour' },
    ],
    photoGuide: 'Front or profile portrait with the chin and neck visible.',
  },
  {
    slug: 'jawline-contouring',
    name: 'Jawline Contouring',
    area: 'face',
    region: 'Jaw',
    zone: 'jaw',
    summary: 'Sharpens the line from ear to chin for a cleaner lower-face contour.',
    recovery: 'A few days to 2 weeks, depending on technique',
    starter: true,
    edit: 'Apply a {amount} jawline contouring result: define the jawline only',
    focus: [
      { id: 'definition', label: 'Sharper definition', prompt: 'make the jawline edge cleaner and better defined' },
      { id: 'slim', label: 'Slimmer lower face', prompt: 'slightly slim the jaw angle for a narrower lower face' },
      { id: 'angle', label: 'Stronger angle', prompt: 'make the jaw angle slightly more structured' },
    ],
    photoGuide: 'Front or three-quarter portrait, hair away from the jaw.',
  },
  {
    slug: 'cheek-enhancement',
    name: 'Cheek Enhancement',
    area: 'face',
    region: 'Cheeks',
    zone: 'cheeks',
    summary: 'Restores or adds volume over the cheekbones.',
    recovery: '2 to 7 days',
    starter: false,
    edit: 'Apply a {amount} cheek enhancement: add volume over the cheekbones only',
    focus: [
      { id: 'lift', label: 'Lifted cheekbones', prompt: 'add volume high on the cheekbones for a lifted look' },
      { id: 'fullness', label: 'Mid-cheek fullness', prompt: 'restore soft fullness to the mid cheek' },
    ],
    photoGuide: 'Front portrait, neutral expression.',
  },
  {
    slug: 'facelift',
    name: 'Facelift',
    area: 'face',
    region: 'Lower face and neck',
    zone: 'face',
    summary: 'Tightens the lower face and neck to soften jowls and deep folds.',
    recovery: '2 to 4 weeks',
    starter: false,
    edit: 'Apply a {amount} facelift result: gently tighten the skin of the lower face and neck, softening jowls and nasolabial folds',
    focus: [
      { id: 'lower', label: 'Lower face', prompt: 'focus on jowls and the folds beside the mouth' },
      { id: 'neck', label: 'Face and neck', prompt: 'include the neck and the area under the chin' },
    ],
    photoGuide: 'Front portrait with the neck visible, neutral expression.',
  },
  {
    slug: 'blepharoplasty',
    name: 'Blepharoplasty',
    area: 'face',
    region: 'Eyelids',
    zone: 'eyes',
    summary: 'Removes excess skin or puffiness from the upper or lower eyelids.',
    recovery: '1 to 2 weeks',
    starter: false,
    edit: 'Apply a {amount} blepharoplasty result: refine the eyelids only, keeping eye shape, iris colour and gaze identical',
    focus: [
      { id: 'upper', label: 'Upper eyelids', prompt: 'reduce excess skin and hooding on the upper eyelids' },
      { id: 'lower', label: 'Lower eyelids', prompt: 'reduce puffiness and bags under the eyes' },
      { id: 'both', label: 'Upper and lower', prompt: 'reduce upper-lid hooding and under-eye puffiness' },
    ],
    photoGuide: 'Front portrait, eyes open, no glasses.',
  },
  {
    slug: 'brow-lift',
    name: 'Brow Lift',
    area: 'face',
    region: 'Brow and forehead',
    zone: 'brow',
    summary: 'Raises the brow line and smooths the forehead.',
    recovery: '1 to 2 weeks',
    starter: false,
    edit: 'Apply a {amount} brow lift result: raise the eyebrows slightly and smooth the forehead',
    focus: [
      { id: 'even', label: 'Even lift', prompt: 'raise the whole brow evenly by a small amount' },
      { id: 'lateral', label: 'Outer brow', prompt: 'lift mainly the outer third of the brows' },
    ],
    photoGuide: 'Front portrait, forehead uncovered.',
  },
  {
    slug: 'botox',
    name: 'Botox Simulation',
    area: 'face',
    region: 'Forehead and eye area',
    zone: 'forehead',
    summary: 'Softens expression lines on the forehead, between the brows and around the eyes.',
    recovery: 'No downtime; effect appears within days',
    starter: false,
    edit: 'Apply a {amount} botulinum toxin result: soften dynamic wrinkles while keeping natural skin texture and pores',
    focus: [
      { id: 'forehead', label: 'Forehead lines', prompt: 'soften the horizontal forehead lines' },
      { id: 'frown', label: 'Frown lines', prompt: 'soften the vertical lines between the eyebrows' },
      { id: 'crow', label: 'Crow’s feet', prompt: 'soften the lines at the outer corners of the eyes' },
      { id: 'all', label: 'All three areas', prompt: 'soften forehead lines, frown lines and crow’s feet' },
    ],
    photoGuide: 'Front portrait, neutral expression.',
  },
  {
    slug: 'breast-augmentation',
    name: 'Breast Augmentation',
    area: 'body',
    region: 'Chest',
    zone: 'chest',
    summary: 'Increases breast volume in proportion with the frame of the torso.',
    recovery: '4 to 6 weeks before full activity',
    starter: false,
    edit: 'Apply a {amount} breast augmentation result: increase bust volume under the existing clothing, in proportion with the shoulders, ribcage and waist',
    focus: [
      { id: 'natural', label: 'Natural profile', prompt: 'use a natural teardrop profile' },
      { id: 'fuller', label: 'Fuller profile', prompt: 'use a fuller, rounder upper profile' },
    ],
    photoGuide: 'Clothed photo of the torso, front or three-quarter view, in a fitted top or sportswear.',
  },
  {
    slug: 'liposuction',
    name: 'Liposuction',
    area: 'body',
    region: 'Waist and flanks',
    zone: 'waist',
    summary: 'Reduces localised fat deposits to refine the body contour.',
    recovery: '1 to 2 weeks; contour settles over months',
    starter: false,
    edit: 'Apply a {amount} liposuction result: reduce localised fat while keeping the skeleton, height and overall build unchanged',
    focus: [
      { id: 'waist', label: 'Waist and flanks', prompt: 'slim the waist and flanks' },
      { id: 'abdomen', label: 'Abdomen', prompt: 'reduce fullness of the abdomen' },
      { id: 'thighs', label: 'Thighs', prompt: 'slim the outer and inner thighs' },
    ],
    photoGuide: 'Clothed photo in fitted clothing or sportswear, standing, front or side view.',
  },
  {
    slug: 'tummy-tuck',
    name: 'Tummy Tuck',
    area: 'body',
    region: 'Abdomen',
    zone: 'abdomen',
    summary: 'Flattens and tightens the abdomen by removing excess skin and tightening the wall.',
    recovery: '4 to 6 weeks',
    starter: false,
    edit: 'Apply a {amount} abdominoplasty result: flatten and tighten the abdomen, keeping the ribcage, hips and proportions unchanged',
    focus: [
      { id: 'full', label: 'Full abdomen', prompt: 'flatten the whole abdomen from ribcage to hips' },
      { id: 'lower', label: 'Lower abdomen', prompt: 'flatten mainly the area below the navel' },
    ],
    photoGuide: 'Clothed photo in fitted clothing or sportswear, standing, front or side view.',
  },
]

export function getProcedure(slug: string): Procedure | undefined {
  return PROCEDURES.find(procedure => procedure.slug === slug)
}

export function intensityWord(intensity: number): string {
  if (intensity <= 33) return 'subtle, conservative'
  if (intensity <= 66) return 'moderate, natural-looking'
  return 'clearly visible but anatomically realistic'
}

export type SimulationParams = { intensity: number; focus: string }

/**
 * The instruction sent to the image-to-image model. Identity preservation comes
 * first: everything not named by the procedure must stay as photographed.
 */
export function buildPrompt(procedure: Procedure, params: SimulationParams): string {
  const focus = procedure.focus.find(option => option.id === params.focus) ?? procedure.focus[0]
  const change = procedure.edit.replace('{amount}', intensityWord(params.intensity))
  const lines = [
    'Edit this exact photograph. Do not generate a new person or a new photo.',
    `${change}${focus ? `; ${focus.prompt}` : ''}.`,
    procedure.area === 'face'
      ? 'Keep the identity of the person exactly: the same eyes and eye colour, eyebrows, skin tone, skin texture, moles and freckles, hairline and hair, ears, expression, age and every facial proportion outside the treated area.'
      : 'Keep the identity of the person exactly: the same face, skin tone, height, bone structure, posture and every body proportion outside the treated area. Keep all clothing exactly as it is, with the same coverage; do not remove clothing or show more skin than the original.',
    'Keep the original lighting, shadows, background, camera angle, framing, crop, focus and image grain.',
    'The result must be photorealistic and look like a plausible post-recovery outcome, with no beautification, no makeup, no skin smoothing, no reshaping of untreated features and no distortion.',
  ]
  return lines.join(' ')
}
