/**
 * Surgical procedures the clinic offers, with indicative price ranges.
 *
 * The prices are PLACEHOLDERS for the operating clinic to replace with its
 * own: they are not quotes, and they are separate from the price of the
 * simulation service (the plans). `requires` lists the profile fields that
 * must be recorded before a preliminary indication is given.
 */
export type SurgeryCategory = 'Nose' | 'Jaws' | 'Titanium implants'

export type SurgeryProcedure = {
  slug: string
  name: string
  /** The abbreviation surgeons use, when there is one. */
  short: string | null
  category: SurgeryCategory
  summary: string
  priceFromCents: number
  priceToCents: number
  /** Preconditions, in words. Shown beside the price. */
  conditions: string[]
  requires: string[]
  /** How the 3D planning module can represent it, if it can. */
  planning: 'implant' | 'osteotomy' | null
}

const ORTHOGNATHIC_DATA = ['dateOfBirth', 'angleClass', 'overjetMm', 'sna', 'snb', 'anb', 'orthodontics', 'cbctDate']
const ORTHOGNATHIC_CONDITIONS = [
  'Facial growth complete.',
  'A skeletal discrepancy between the jaws, documented by cephalometric analysis and a CT or CBCT.',
  'Orthodontic preparation agreed with the orthodontist.',
  'Fit for general anaesthesia.',
]

export const SURGERY_CATALOG: SurgeryProcedure[] = [
  {
    slug: 'rhinoplasty',
    name: 'Rhinoplasty',
    short: null,
    category: 'Nose',
    summary: 'Reshapes the bone and cartilage of the nose; can be combined with correction of the septum.',
    priceFromCents: 600_000,
    priceToCents: 1_000_000,
    conditions: ['Facial growth complete.', 'Nasal breathing assessed before surgery.', 'Realistic expectations, confirmed at consultation.'],
    requires: ['dateOfBirth', 'nasalObstruction', 'skinThickness', 'previousRhinoplasty'],
    planning: null,
  },
  {
    slug: 'bsso',
    name: 'Bilateral sagittal split osteotomy',
    short: 'BSSO',
    category: 'Jaws',
    summary: 'Splits the mandible on both sides so the tooth-bearing part can be moved forward or back.',
    priceFromCents: 900_000,
    priceToCents: 1_400_000,
    conditions: ORTHOGNATHIC_CONDITIONS,
    requires: ORTHOGNATHIC_DATA,
    planning: 'osteotomy',
  },
  {
    slug: 'le-fort-1',
    name: 'Le Fort I osteotomy',
    short: 'Le Fort I',
    category: 'Jaws',
    summary: 'Frees the upper jaw above the teeth so it can be moved forward, up, down or levelled.',
    priceFromCents: 900_000,
    priceToCents: 1_400_000,
    conditions: ORTHOGNATHIC_CONDITIONS,
    requires: ORTHOGNATHIC_DATA,
    planning: 'osteotomy',
  },
  {
    slug: 'bimax',
    name: 'Bimaxillary osteotomy',
    short: 'Bi-Max',
    category: 'Jaws',
    summary: 'A Le Fort I and a sagittal split in one operation, repositioning both jaws.',
    priceFromCents: 1_400_000,
    priceToCents: 2_200_000,
    conditions: ORTHOGNATHIC_CONDITIONS,
    requires: ORTHOGNATHIC_DATA,
    planning: 'osteotomy',
  },
  {
    slug: 'le-fort-2',
    name: 'Le Fort II osteotomy',
    short: 'Le Fort II',
    category: 'Jaws',
    summary: 'Advances the upper jaw together with the nasal pyramid, for a deficient central midface.',
    priceFromCents: 1_800_000,
    priceToCents: 2_800_000,
    conditions: [...ORTHOGNATHIC_CONDITIONS, 'Marked deficiency of the central midface. Performed by a craniofacial team.'],
    requires: ORTHOGNATHIC_DATA,
    planning: 'osteotomy',
  },
  {
    slug: 'le-fort-3',
    name: 'Le Fort III osteotomy',
    short: 'Le Fort III',
    category: 'Jaws',
    summary: 'Advances the whole midface, including the cheekbones and orbital rims.',
    priceFromCents: 2_500_000,
    priceToCents: 4_000_000,
    conditions: [...ORTHOGNATHIC_CONDITIONS, 'Severe deficiency of the whole midface. Performed by a craniofacial team, with intensive-care support.'],
    requires: ORTHOGNATHIC_DATA,
    planning: 'osteotomy',
  },
  {
    slug: 'titanium-chin',
    name: 'Titanium chin implant, patient-specific',
    short: null,
    category: 'Titanium implants',
    summary: 'An implant designed on the CT of the mandible and fixed with screws, to change the projection or shape of the chin.',
    priceFromCents: 600_000,
    priceToCents: 900_000,
    conditions: ['A CT or CBCT of the mandible, on which the implant is designed.', 'No known titanium allergy.', 'Healthy bone and soft tissue at the site.'],
    requires: ['dateOfBirth', 'metalAllergy', 'cbctDate'],
    planning: 'implant',
  },
  {
    slug: 'titanium-jaw-angles',
    name: 'Titanium jaw-angle implants, patient-specific (pair)',
    short: null,
    category: 'Titanium implants',
    summary: 'Two implants on the mandibular angles, to widen or define the lower face.',
    priceFromCents: 900_000,
    priceToCents: 1_400_000,
    conditions: ['A CT or CBCT of the mandible, on which the implants are designed.', 'No known titanium allergy.', 'Healthy bone and soft tissue at the site.'],
    requires: ['dateOfBirth', 'metalAllergy', 'cbctDate'],
    planning: 'implant',
  },
  {
    slug: 'titanium-malar',
    name: 'Titanium cheekbone implants, patient-specific (pair)',
    short: null,
    category: 'Titanium implants',
    summary: 'Two implants on the zygomatic bones, to add projection to the cheekbones.',
    priceFromCents: 800_000,
    priceToCents: 1_200_000,
    conditions: ['A CT or CBCT of the midface, on which the implants are designed.', 'No known titanium allergy.', 'Healthy maxillary sinuses.'],
    requires: ['dateOfBirth', 'metalAllergy', 'cbctDate'],
    planning: 'implant',
  },
  {
    slug: 'titanium-custom',
    name: 'Titanium implant, other site or several sites',
    short: null,
    category: 'Titanium implants',
    summary: 'A patient-specific implant for another region (orbital rim, forehead, mandibular border) or a set covering several regions.',
    priceFromCents: 1_400_000,
    priceToCents: 2_600_000,
    conditions: ['A CT or CBCT of the region.', 'No known titanium allergy.', 'Feasibility of the design confirmed by the surgeon and the manufacturer.'],
    requires: ['dateOfBirth', 'metalAllergy', 'cbctDate'],
    planning: 'implant',
  },
]

export const SURGERY_CATEGORIES: SurgeryCategory[] = ['Nose', 'Jaws', 'Titanium implants']

export function surgeryProcedure(slug: string): SurgeryProcedure | undefined {
  return SURGERY_CATALOG.find(item => item.slug === slug)
}

export function formatRange(procedure: SurgeryProcedure): string {
  const euro = (cents: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
  return `${euro(procedure.priceFromCents)} – ${euro(procedure.priceToCents)}`
}
