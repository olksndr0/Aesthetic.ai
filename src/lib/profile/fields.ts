import { z } from 'zod'

/**
 * The clinical record a surgeon may ask for before facial or orthognathic
 * surgery. One definition drives the form, the validation and the display.
 * Every field is optional: an empty field means "not recorded", never "no".
 */
export type FieldDefinition =
  | { key: string; label: string; type: 'number'; unit?: string; min: number; max: number; step?: number; hint?: string }
  | { key: string; label: string; type: 'text' | 'textarea' | 'date'; hint?: string }
  | { key: string; label: string; type: 'boolean'; hint?: string }
  | { key: string; label: string; type: 'select'; options: readonly string[]; hint?: string }
  | { key: string; label: string; type: 'multi'; options: readonly string[]; hint?: string }

export type SectionDefinition = { id: string; title: string; lead: string; fields: FieldDefinition[] }

const num = (key: string, label: string, unit: string, min: number, max: number, step = 1, hint?: string): FieldDefinition => ({ key, label, type: 'number', unit, min, max, step, hint })
const yes = (key: string, label: string, hint?: string): FieldDefinition => ({ key, label, type: 'boolean', hint })
const pick = (key: string, label: string, options: readonly string[], hint?: string): FieldDefinition => ({ key, label, type: 'select', options, hint })
const text = (key: string, label: string, hint?: string): FieldDefinition => ({ key, label, type: 'text', hint })
const long = (key: string, label: string, hint?: string): FieldDefinition => ({ key, label, type: 'textarea', hint })
const date = (key: string, label: string): FieldDefinition => ({ key, label, type: 'date' })

export const PROFILE_SECTIONS: SectionDefinition[] = [
  {
    id: 'identity',
    title: 'Identity',
    lead: 'Who this record describes. Age and sex set the reference values of a cephalometric analysis.',
    fields: [
      date('dateOfBirth', 'Date of birth'),
      pick('sexAtBirth', 'Sex assigned at birth', ['Female', 'Male', 'Intersex']),
      text('genderIdentity', 'Gender identity', 'If different, and relevant to the goals of surgery.'),
      pick('ancestry', 'Ancestry', ['European', 'East Asian', 'South Asian', 'African', 'Middle Eastern', 'Latin American', 'Mixed', 'Other', 'Prefer not to say'], 'Cephalometric norms differ between populations.'),
    ],
  },
  {
    id: 'body',
    title: 'Body measurements',
    lead: 'Height and weight give the body-mass index used in the anaesthetic assessment.',
    fields: [
      num('heightCm', 'Height', 'cm', 100, 230),
      num('weightKg', 'Weight', 'kg', 25, 300, 0.1),
      num('neckCircumferenceCm', 'Neck circumference', 'cm', 20, 70, 0.5, 'Relevant to the airway.'),
      num('headCircumferenceCm', 'Head circumference', 'cm', 40, 70, 0.5),
    ],
  },
  {
    id: 'vitals',
    title: 'Vital signs',
    lead: 'Resting values, as measured at the last visit.',
    fields: [
      num('systolicMmHg', 'Blood pressure, systolic', 'mmHg', 60, 260),
      num('diastolicMmHg', 'Blood pressure, diastolic', 'mmHg', 30, 160),
      num('restingHeartRate', 'Resting heart rate', 'bpm', 30, 200),
      num('oxygenSaturation', 'Oxygen saturation', '%', 70, 100),
      pick('bloodType', 'Blood group', ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−', 'Unknown']),
    ],
  },
  {
    id: 'medical',
    title: 'Medical history',
    lead: 'Conditions that change the risk of surgery, anaesthesia or healing.',
    fields: [
      pick('asaClass', 'ASA physical status', ['I: healthy', 'II: mild systemic disease', 'III: severe systemic disease', 'IV: constant threat to life'], 'Assigned by an anaesthetist.'),
      {
        key: 'conditions',
        label: 'Diagnosed conditions',
        type: 'multi',
        options: [
          'Hypertension', 'Heart disease', 'Diabetes', 'Bleeding or clotting disorder', 'Thyroid disease', 'Autoimmune disease', 'Asthma or COPD', 'Obstructive sleep apnoea',
          'Epilepsy', 'Kidney disease', 'Liver disease', 'Immunodeficiency', 'Osteoporosis or bone disease', 'Head and neck radiotherapy', 'Psychiatric condition',
        ],
      },
      long('conditionsNotes', 'Details of the conditions above', 'Control, treatment, last review.'),
      long('previousSurgery', 'Previous surgery', 'Any operation, with year.'),
      yes('previousRhinoplasty', 'Previous rhinoplasty or septoplasty'),
      yes('previousOrthognathic', 'Previous jaw surgery'),
      long('facialTrauma', 'Facial trauma or fractures'),
      long('anaesthesiaHistory', 'Anaesthesia history', 'Problems with past anaesthetics, difficult intubation, post-operative nausea.'),
      yes('keloidTendency', 'Tendency to keloid or hypertrophic scars'),
      long('familyHistory', 'Family history', 'Bleeding disorders, malignant hyperthermia, thrombosis.'),
    ],
  },
  {
    id: 'medication',
    title: 'Medication and allergies',
    lead: 'Several drugs must be paused or managed around surgery.',
    fields: [
      long('medications', 'Current medication', 'Name, dose and frequency.'),
      yes('anticoagulants', 'Anticoagulants or antiplatelet drugs'),
      yes('isotretinoinRecent', 'Isotretinoin in the last 12 months'),
      yes('bisphosphonates', 'Bisphosphonates or other antiresorptive drugs', 'Affect bone healing of the jaws.'),
      yes('immunosuppressants', 'Corticosteroids or immunosuppressants'),
      yes('hormonalTherapy', 'Hormonal therapy or oral contraceptive'),
      text('supplements', 'Supplements and herbal products'),
      text('drugAllergies', 'Drug allergies'),
      yes('latexAllergy', 'Latex allergy'),
      pick('metalAllergy', 'Metal allergy', ['None known', 'Nickel', 'Titanium', 'Other metal'], 'Relevant to plates, screws and implants.'),
      text('otherAllergies', 'Other allergies'),
    ],
  },
  {
    id: 'lifestyle',
    title: 'Lifestyle',
    lead: 'Factors that affect healing and anaesthesia.',
    fields: [
      pick('smoking', 'Smoking', ['Never', 'Former', 'Current']),
      num('cigarettesPerDay', 'Cigarettes per day', '', 0, 100),
      num('packYears', 'Pack-years', '', 0, 200, 0.5),
      yes('vaping', 'Vaping or other nicotine'),
      num('alcoholUnitsPerWeek', 'Alcohol', 'units/week', 0, 200),
      yes('recreationalDrugs', 'Recreational drug use'),
      pick('pregnancy', 'Pregnancy', ['Not applicable', 'Not pregnant', 'Pregnant', 'Breastfeeding']),
    ],
  },
  {
    id: 'occlusion',
    title: 'Teeth and occlusion',
    lead: 'How the jaws meet. The basis of any orthognathic plan.',
    fields: [
      pick('angleClass', 'Molar relationship (Angle)', ['Class I', 'Class II division 1', 'Class II division 2', 'Class III']),
      num('overjetMm', 'Overjet', 'mm', -15, 20, 0.5, 'Negative when the lower incisors are in front.'),
      num('overbiteMm', 'Overbite', 'mm', -10, 15, 0.5, 'Negative for an open bite.'),
      num('midlineDeviationMm', 'Dental midline deviation', 'mm', -10, 10, 0.5, 'Positive toward the patient’s left.'),
      pick('crossbite', 'Crossbite', ['None', 'Anterior', 'Posterior, one side', 'Posterior, both sides']),
      pick('openBite', 'Open bite', ['None', 'Anterior', 'Posterior']),
      pick('crowding', 'Crowding', ['None', 'Mild', 'Moderate', 'Severe']),
      text('missingTeeth', 'Missing teeth', 'FDI numbers.'),
      pick('thirdMolars', 'Third molars', ['Present', 'Impacted', 'Extracted', 'Absent']),
      pick('orthodontics', 'Orthodontic treatment', ['None', 'Planned', 'In treatment', 'Completed']),
      pick('periodontalStatus', 'Periodontal status', ['Healthy', 'Gingivitis', 'Periodontitis']),
      yes('tmjPain', 'Jaw-joint pain'),
      yes('tmjClicking', 'Jaw-joint clicking'),
      yes('tmjLocking', 'Jaw-joint locking'),
      num('mouthOpeningMm', 'Maximum mouth opening', 'mm', 5, 75),
      yes('bruxism', 'Clenching or grinding'),
    ],
  },
  {
    id: 'cephalometry',
    title: 'Cephalometric analysis',
    lead: 'Angles and distances from a lateral cephalogram or a CBCT. Enter measured values only.',
    fields: [
      num('sna', 'SNA', '°', 60, 100, 0.5),
      num('snb', 'SNB', '°', 60, 100, 0.5),
      num('anb', 'ANB', '°', -15, 20, 0.5),
      num('witsMm', 'Wits appraisal', 'mm', -20, 20, 0.5),
      num('mandibularPlaneAngle', 'Mandibular plane angle (SN–GoGn)', '°', 10, 60, 0.5),
      num('upperIncisorSn', 'Upper incisor to SN', '°', 70, 140, 0.5),
      num('impa', 'Lower incisor to mandibular plane (IMPA)', '°', 60, 130, 0.5),
      num('lowerFaceHeightPct', 'Lower anterior face height', '% of total', 40, 70, 0.5),
      num('chinToNPerpMm', 'Pogonion to nasion perpendicular', 'mm', -30, 20, 0.5),
      num('nasolabialAngle', 'Nasolabial angle', '°', 60, 140),
      num('nasofrontalAngle', 'Nasofrontal angle', '°', 100, 160),
      num('mentolabialAngle', 'Mentolabial angle', '°', 80, 170),
    ],
  },
  {
    id: 'face',
    title: 'Facial analysis',
    lead: 'Direct measurements of the face and soft tissue.',
    fields: [
      num('upperThirdMm', 'Upper third (hairline to glabella)', 'mm', 30, 100),
      num('middleThirdMm', 'Middle third (glabella to subnasale)', 'mm', 30, 100),
      num('lowerThirdMm', 'Lower third (subnasale to menton)', 'mm', 30, 110),
      num('bizygomaticWidthMm', 'Bizygomatic width', 'mm', 90, 180),
      num('bigonialWidthMm', 'Bigonial width', 'mm', 70, 160),
      num('intercanthalMm', 'Intercanthal distance', 'mm', 20, 50),
      num('interpupillaryMm', 'Interpupillary distance', 'mm', 45, 80),
      num('chinDeviationMm', 'Chin deviation from the midline', 'mm', -20, 20, 0.5, 'Positive toward the patient’s left.'),
      long('asymmetry', 'Asymmetries observed'),
      pick('fitzpatrick', 'Skin phototype (Fitzpatrick)', ['I', 'II', 'III', 'IV', 'V', 'VI']),
      pick('skinThickness', 'Skin thickness', ['Thin', 'Medium', 'Thick'], 'Matters for how the nose and chin show a change.'),
    ],
  },
  {
    id: 'airway',
    title: 'Nose and airway',
    lead: 'Breathing before surgery, which jaw and nasal operations can change.',
    fields: [
      pick('nasalObstruction', 'Nasal obstruction', ['None', 'Left', 'Right', 'Both sides']),
      yes('septalDeviation', 'Septal deviation'),
      yes('turbinateHypertrophy', 'Turbinate hypertrophy'),
      yes('allergicRhinitis', 'Allergic rhinitis'),
      yes('mouthBreathing', 'Habitual mouth breathing'),
      yes('snoring', 'Snoring'),
      num('ahi', 'Apnoea–hypopnoea index', 'events/h', 0, 150, 0.1, 'From a sleep study.'),
      yes('previousSinusSurgery', 'Previous sinus surgery'),
    ],
  },
  {
    id: 'imaging',
    title: 'Imaging and records available',
    lead: 'What exists, and when it was taken. The 3D data itself is loaded in a planning case.',
    fields: [
      date('cbctDate', 'CT or CBCT of the skull'),
      date('cephalogramDate', 'Lateral cephalogram'),
      date('panoramicDate', 'Panoramic radiograph'),
      date('tmjMriDate', 'MRI of the jaw joints'),
      yes('intraoralScan', 'Intraoral scan of the dental arches'),
      yes('facialScan', '3D surface scan of the face'),
      yes('dentalCasts', 'Dental casts'),
    ],
  },
  {
    id: 'laboratory',
    title: 'Laboratory results',
    lead: 'Recent blood tests.',
    fields: [
      date('labDate', 'Date of the tests'),
      num('haemoglobin', 'Haemoglobin', 'g/dL', 4, 22, 0.1),
      num('platelets', 'Platelets', '×10⁹/L', 10, 1000),
      num('inr', 'INR', '', 0.5, 8, 0.01),
      num('apttSeconds', 'aPTT', 's', 15, 150, 0.1),
      num('fastingGlucose', 'Fasting glucose', 'mg/dL', 30, 500),
      num('hba1c', 'HbA1c', '%', 3, 16, 0.1),
      num('creatinine', 'Creatinine', 'mg/dL', 0.2, 15, 0.01),
    ],
  },
  {
    id: 'goals',
    title: 'Goals and expectations',
    lead: 'What the person wants to change, in their own words.',
    fields: [
      long('goals', 'What should change'),
      long('concerns', 'Main concerns about surgery'),
      pick('priority', 'What matters most', ['Function (bite, breathing)', 'Appearance', 'Both equally']),
      yes('bodyImageScreeningPositive', 'Body-image screening positive', 'A positive screen calls for a psychological assessment before surgery.'),
      yes('psychologicalSupport', 'Currently in psychological care'),
    ],
  },
]

export const PROFILE_FIELDS = PROFILE_SECTIONS.flatMap(section => section.fields)

export type ProfileValue = string | number | boolean | string[]
export type ProfileData = Record<string, ProfileValue>

function schemaOf(field: FieldDefinition): z.ZodTypeAny {
  switch (field.type) {
    case 'number':
      return z.number().finite().min(field.min, `${field.label}: at least ${field.min}`).max(field.max, `${field.label}: at most ${field.max}`)
    case 'boolean':
      return z.boolean()
    case 'select':
      return z.enum(field.options as [string, ...string[]])
    case 'multi':
      return z.array(z.enum(field.options as [string, ...string[]])).max(field.options.length)
    case 'date':
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${field.label}: use a date`)
    case 'textarea':
      return z.string().trim().max(2000)
    default:
      return z.string().trim().max(200)
  }
}

/** Unknown keys are refused; every known key is optional. */
export const profileDataSchema: z.ZodType<ProfileData> = z.object(Object.fromEntries(PROFILE_FIELDS.map(field => [field.key, schemaOf(field).optional()]))).strict() as unknown as z.ZodType<ProfileData>

export function ageOn(dateOfBirth: unknown, now = new Date()): number | null {
  if (typeof dateOfBirth !== 'string') return null
  const born = new Date(`${dateOfBirth}T00:00:00Z`)
  if (Number.isNaN(born.getTime())) return null
  const before = now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate())
  return now.getUTCFullYear() - born.getUTCFullYear() - (before ? 1 : 0)
}

export function bmiOf(data: ProfileData): number | null {
  const height = data.heightCm
  const weight = data.weightKg
  if (typeof height !== 'number' || typeof weight !== 'number' || height <= 0) return null
  return Math.round((weight / (height / 100) ** 2) * 10) / 10
}

/** Share of the record that is filled in, per section and overall. */
export function completeness(data: ProfileData): { overall: number; sections: Record<string, number> } {
  const filled = (field: FieldDefinition) => {
    const value = data[field.key]
    return value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0 && field.type !== 'multi')
  }
  const sections: Record<string, number> = {}
  for (const section of PROFILE_SECTIONS) sections[section.id] = section.fields.filter(filled).length / section.fields.length
  return { overall: PROFILE_FIELDS.filter(filled).length / PROFILE_FIELDS.length, sections }
}

/** Accounts keep up to this many people; development access is not limited. */
export const MAX_PROFILES = 5
