import type { ProfileData } from './fields'

/**
 * Fictional records used by development access, so every screen has data to
 * show. They describe nobody; the values are plausible, not clinical advice.
 */
export const EXAMPLE_PROFILES: Array<{ label: string; data: ProfileData }> = [
  {
    label: 'Example A · Class II, retruded mandible',
    data: {
      dateOfBirth: '1996-04-18', sexAtBirth: 'Female', ancestry: 'European',
      heightCm: 168, weightKg: 59.5, neckCircumferenceCm: 32, headCircumferenceCm: 55.5,
      systolicMmHg: 114, diastolicMmHg: 72, restingHeartRate: 64, oxygenSaturation: 98, bloodType: 'A+',
      asaClass: 'I: healthy', conditions: [], conditionsNotes: 'No chronic conditions.', previousSurgery: 'Wisdom teeth extraction, 2016.',
      previousRhinoplasty: false, previousOrthognathic: false, facialTrauma: 'None.', anaesthesiaHistory: 'General anaesthesia in 2016 without problems.',
      keloidTendency: false, familyHistory: 'No bleeding disorders or anaesthetic reactions known.',
      medications: 'None.', anticoagulants: false, isotretinoinRecent: false, bisphosphonates: false, immunosuppressants: false, hormonalTherapy: true,
      supplements: 'Vitamin D 1000 IU daily.', drugAllergies: 'None known.', latexAllergy: false, metalAllergy: 'None known', otherAllergies: 'Seasonal pollen.',
      smoking: 'Never', cigarettesPerDay: 0, packYears: 0, vaping: false, alcoholUnitsPerWeek: 3, recreationalDrugs: false, pregnancy: 'Not pregnant',
      angleClass: 'Class II division 1', overjetMm: 8.5, overbiteMm: 4.5, midlineDeviationMm: 0.5, crossbite: 'None', openBite: 'None', crowding: 'Mild',
      missingTeeth: '18, 28, 38, 48', thirdMolars: 'Extracted', orthodontics: 'In treatment', periodontalStatus: 'Healthy',
      tmjPain: false, tmjClicking: true, tmjLocking: false, mouthOpeningMm: 46, bruxism: true,
      sna: 81.5, snb: 74, anb: 7.5, witsMm: 6, mandibularPlaneAngle: 36, upperIncisorSn: 106, impa: 99, lowerFaceHeightPct: 57, chinToNPerpMm: -14,
      nasolabialAngle: 108, nasofrontalAngle: 132, mentolabialAngle: 112,
      upperThirdMm: 58, middleThirdMm: 63, lowerThirdMm: 66, bizygomaticWidthMm: 128, bigonialWidthMm: 98, intercanthalMm: 31, interpupillaryMm: 61, chinDeviationMm: 0.5,
      asymmetry: 'Mild cant of the occlusal plane, lower on the right.', fitzpatrick: 'II', skinThickness: 'Medium',
      nasalObstruction: 'None', septalDeviation: false, turbinateHypertrophy: false, allergicRhinitis: true, mouthBreathing: false, snoring: true, ahi: 6.2, previousSinusSurgery: false,
      cbctDate: '2026-09-22', cephalogramDate: '2026-09-22', panoramicDate: '2026-05-10', intraoralScan: true, facialScan: false, dentalCasts: true,
      labDate: '2026-10-30', haemoglobin: 13.4, platelets: 262, inr: 1.0, apttSeconds: 29.5, fastingGlucose: 86, hba1c: 5.1, creatinine: 0.78,
      goals: 'Bring the lower jaw forward, close the gap between the front teeth, a more defined chin.', concerns: 'Numbness of the lower lip, time off work.',
      priority: 'Both equally', bodyImageScreeningPositive: false, psychologicalSupport: false,
    },
  },
  {
    label: 'Example B · Class III, midface deficiency',
    data: {
      dateOfBirth: '1991-11-02', sexAtBirth: 'Male', ancestry: 'East Asian',
      heightCm: 179, weightKg: 82, neckCircumferenceCm: 40.5, headCircumferenceCm: 58,
      systolicMmHg: 128, diastolicMmHg: 82, restingHeartRate: 71, oxygenSaturation: 97, bloodType: 'O+',
      asaClass: 'II: mild systemic disease', conditions: ['Hypertension', 'Obstructive sleep apnoea'], conditionsNotes: 'Hypertension controlled with one drug. CPAP since 2024.',
      previousSurgery: 'Septoplasty, 2019.', previousRhinoplasty: true, previousOrthognathic: false, facialTrauma: 'Nasal fracture at 17.',
      anaesthesiaHistory: 'Post-operative nausea after septoplasty.', keloidTendency: false, familyHistory: 'Father: deep-vein thrombosis.',
      medications: 'Ramipril 5 mg daily.', anticoagulants: false, isotretinoinRecent: false, bisphosphonates: false, immunosuppressants: false, hormonalTherapy: false,
      supplements: 'None.', drugAllergies: 'Penicillin (rash).', latexAllergy: false, metalAllergy: 'Nickel', otherAllergies: 'None.',
      smoking: 'Former', cigarettesPerDay: 0, packYears: 4, vaping: false, alcoholUnitsPerWeek: 6, recreationalDrugs: false, pregnancy: 'Not applicable',
      angleClass: 'Class III', overjetMm: -4, overbiteMm: 1, midlineDeviationMm: -2, crossbite: 'Anterior', openBite: 'None', crowding: 'Moderate',
      missingTeeth: '18, 28', thirdMolars: 'Impacted', orthodontics: 'Completed', periodontalStatus: 'Gingivitis',
      tmjPain: false, tmjClicking: false, tmjLocking: false, mouthOpeningMm: 51, bruxism: false,
      sna: 77, snb: 82.5, anb: -5.5, witsMm: -9.5, mandibularPlaneAngle: 29, upperIncisorSn: 112, impa: 82, lowerFaceHeightPct: 56, chinToNPerpMm: 6,
      nasolabialAngle: 86, nasofrontalAngle: 138, mentolabialAngle: 142,
      upperThirdMm: 62, middleThirdMm: 64, lowerThirdMm: 74, bizygomaticWidthMm: 142, bigonialWidthMm: 114, intercanthalMm: 35, interpupillaryMm: 65, chinDeviationMm: -2.5,
      asymmetry: 'Chin and lower dental midline deviated to the right.', fitzpatrick: 'III', skinThickness: 'Thick',
      nasalObstruction: 'Both sides', septalDeviation: true, turbinateHypertrophy: true, allergicRhinitis: false, mouthBreathing: true, snoring: true, ahi: 21.4, previousSinusSurgery: false,
      cbctDate: '2026-10-08', cephalogramDate: '2026-10-08', panoramicDate: '2026-10-08', tmjMriDate: '2025-12-01', intraoralScan: true, facialScan: true, dentalCasts: false,
      labDate: '2026-11-03', haemoglobin: 15.1, platelets: 231, inr: 1.05, apttSeconds: 31, fastingGlucose: 97, hba1c: 5.6, creatinine: 1.02,
      goals: 'A correct bite, a less prominent lower jaw, better breathing at night.', concerns: 'Recovery of chewing, swelling.',
      priority: 'Function (bite, breathing)', bodyImageScreeningPositive: false, psychologicalSupport: false,
    },
  },
]
