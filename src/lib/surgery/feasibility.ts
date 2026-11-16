import { PROFILE_FIELDS, ageOn, bmiOf, type ProfileData } from '../profile/fields'

import type { SurgeryProcedure } from './catalog'

/**
 * Preliminary indication, version 0.
 *
 * A transparent set of rules over the recorded profile: it lists what is
 * missing and which recorded facts a surgeon would want to review. It is a
 * placeholder for the predictive model to be developed, it has not been
 * validated, and it never states that an operation is or is not possible:
 * that is a clinical decision.
 */
export const FEASIBILITY_MODEL = { name: 'rules-draft', version: 0, validated: false } as const

export type Factor = { weight: 'info' | 'caution' | 'major'; text: string }

export type Assessment = {
  /** `insufficient_data` whenever a required field is empty, whatever else is recorded. */
  indication: 'insufficient_data' | 'no_flag' | 'review' | 'major_factors'
  /** 100 minus 30 per major factor and 10 per caution; null without the required data. A rough ordering, not a probability. */
  score: number | null
  factors: Factor[]
  /** Labels of the required fields that are empty. */
  missing: string[]
}

const ORTHOGNATHIC = new Set(['bsso', 'le-fort-1', 'bimax', 'le-fort-2', 'le-fort-3'])
const BONE = (procedure: SurgeryProcedure) => procedure.category !== 'Nose'

export function assessFeasibility(procedure: SurgeryProcedure, data: ProfileData, now = new Date()): Assessment {
  const factors: Factor[] = []
  const add = (weight: Factor['weight'], text: string) => factors.push({ weight, text })
  const number = (key: string) => (typeof data[key] === 'number' ? (data[key] as number) : null)
  const flag = (key: string) => data[key] === true
  const conditions = Array.isArray(data.conditions) ? data.conditions : []

  const missing = procedure.requires
    .filter(key => data[key] === undefined || data[key] === '')
    .map(key => PROFILE_FIELDS.find(field => field.key === key)?.label ?? key)

  // ── Any elective operation under general anaesthesia ──
  const age = ageOn(data.dateOfBirth, now)
  if (age !== null && age < 18) add('major', `Age ${age}: facial growth may not be complete, and elective surgery is normally deferred.`)
  if (data.pregnancy === 'Pregnant') add('major', 'Pregnancy: elective surgery is normally deferred.')
  if (data.pregnancy === 'Breastfeeding') add('caution', 'Breastfeeding: timing and medication need review.')
  if (data.smoking === 'Current' || flag('vaping')) add('caution', 'Nicotine use slows bone and wound healing; stopping before surgery is usually required.')
  if (conditions.includes('Bleeding or clotting disorder')) add('major', 'A bleeding or clotting disorder is recorded.')
  if (flag('anticoagulants')) add('caution', 'Anticoagulant or antiplatelet medication must be managed around surgery.')
  if (conditions.includes('Diabetes')) {
    const hba1c = number('hba1c')
    add(hba1c !== null && hba1c >= 8 ? 'major' : 'caution', hba1c !== null ? `Diabetes recorded, HbA1c ${hba1c}%.` : 'Diabetes recorded; no HbA1c on file.')
  }
  if (typeof data.asaClass === 'string' && data.asaClass.startsWith('IV')) add('major', 'ASA class IV.')
  if (typeof data.asaClass === 'string' && data.asaClass.startsWith('III')) add('caution', 'ASA class III.')
  const bmi = bmiOf(data)
  if (bmi !== null && bmi >= 35) add('caution', `Body-mass index ${bmi}: higher anaesthetic and airway risk.`)
  if (bmi !== null && bmi < 17) add('caution', `Body-mass index ${bmi}: nutritional status needs review.`)
  const systolic = number('systolicMmHg')
  const diastolic = number('diastolicMmHg')
  if ((systolic !== null && systolic >= 160) || (diastolic !== null && diastolic >= 100)) add('caution', 'Blood pressure on file is high.')
  if (flag('immunosuppressants')) add('caution', 'Corticosteroid or immunosuppressant therapy affects healing and infection risk.')
  if (flag('bodyImageScreeningPositive')) add('major', 'Body-image screening is positive: a psychological assessment comes before any aesthetic operation.')
  const inr = number('inr')
  if (inr !== null && inr > 1.5) add('caution', `INR ${inr}.`)
  const platelets = number('platelets')
  if (platelets !== null && platelets < 100) add('caution', `Platelets ${platelets} ×10⁹/L.`)
  const haemoglobin = number('haemoglobin')
  if (haemoglobin !== null && haemoglobin < 10) add('caution', `Haemoglobin ${haemoglobin} g/dL.`)
  if (typeof data.anaesthesiaHistory === 'string' && /difficult|malignant|reaction/i.test(data.anaesthesiaHistory)) add('caution', 'The anaesthesia history mentions a past problem.')

  // ── Operations on bone ──
  if (BONE(procedure)) {
    if (flag('bisphosphonates')) add('major', 'Antiresorptive medication (bisphosphonates) is recorded: risk of impaired healing of the jaw bone.')
    if (conditions.includes('Head and neck radiotherapy')) add('major', 'Previous radiotherapy to the head and neck is recorded.')
    if (conditions.includes('Osteoporosis or bone disease')) add('caution', 'A bone disease is recorded.')
    if (data.periodontalStatus === 'Periodontitis') add('caution', 'Periodontitis is recorded; it is normally treated first.')
  }

  // ── Jaw osteotomies ──
  if (ORTHOGNATHIC.has(procedure.slug)) {
    const anb = number('anb')
    const overjet = number('overjetMm')
    const noDiscrepancy = data.angleClass === 'Class I' && anb !== null && anb >= 0 && anb <= 4 && overjet !== null && overjet >= 1 && overjet <= 4 && data.openBite !== 'Anterior' && data.crossbite === 'None'
    if (noDiscrepancy) add('major', 'The recorded bite and jaw relationship (Class I, ANB and overjet within the usual range) show no skeletal discrepancy of the kind jaw surgery corrects.')
    if (data.orthodontics === 'None') add('caution', 'No orthodontic treatment is recorded; jaw surgery is normally coordinated with it.')
    if (flag('tmjPain') || flag('tmjLocking')) add('caution', 'Jaw-joint pain or locking is recorded and needs assessment before the jaws are repositioned.')
    const ahi = number('ahi')
    if (ahi !== null && ahi >= 15 && data.angleClass === 'Class III') add('caution', `Sleep apnoea (AHI ${ahi}): moving the lower jaw back can narrow the airway.`)
    if (procedure.slug === 'bsso' && data.thirdMolars === 'Impacted') add('info', 'Impacted lower third molars are usually removed before a sagittal split.')
    if (procedure.slug === 'bimax' && anb !== null && (anb >= 8 || anb <= -4)) add('info', `ANB ${anb}°: discrepancies of this size are often treated in both jaws.`)
    if ((procedure.slug === 'le-fort-2' || procedure.slug === 'le-fort-3') && data.angleClass !== 'Class III') add('caution', 'These operations treat marked midface deficiency, which usually presents with a Class III relationship; none is recorded.')
    if (procedure.slug === 'le-fort-2' || procedure.slug === 'le-fort-3') add('info', 'Rarely indicated; assessed by a craniofacial team.')
  }

  // ── Titanium implants ──
  if (procedure.category === 'Titanium implants') {
    if (data.metalAllergy === 'Titanium') add('major', 'A titanium allergy is recorded.')
    if (data.metalAllergy === 'Nickel' || data.metalAllergy === 'Other metal') add('caution', 'A metal allergy is recorded: the alloy of the implant and screws must be confirmed.')
    const overjet = number('overjetMm')
    if (procedure.slug === 'titanium-chin' && overjet !== null && overjet >= 6) add('info', `Overjet ${overjet} mm: a chin implant changes the contour of the chin, not the position of the jaw or the bite.`)
  }

  // ── Rhinoplasty ──
  if (procedure.slug === 'rhinoplasty') {
    if (flag('previousRhinoplasty')) add('caution', 'A previous nasal operation is recorded: a revision is more complex.')
    if (flag('isotretinoinRecent')) add('caution', 'Isotretinoin in the last 12 months is recorded.')
    if (data.nasalObstruction && data.nasalObstruction !== 'None') add('info', 'Nasal obstruction is recorded: the functional part is planned together with the shape.')
    if (data.skinThickness === 'Thick') add('info', 'Thick skin shows changes of the underlying framework less.')
  }

  const major = factors.filter(factor => factor.weight === 'major').length
  const caution = factors.filter(factor => factor.weight === 'caution').length
  if (missing.length > 0) return { indication: 'insufficient_data', score: null, factors, missing }
  return {
    indication: major > 0 ? 'major_factors' : caution > 0 ? 'review' : 'no_flag',
    score: Math.max(0, 100 - 30 * major - 10 * caution),
    factors,
    missing,
  }
}

export const INDICATION_TEXT: Record<Assessment['indication'], string> = {
  insufficient_data: 'Not enough data recorded',
  no_flag: 'No flag raised by the recorded data',
  review: 'Points for the surgeon to review',
  major_factors: 'Major factors to resolve first',
}
