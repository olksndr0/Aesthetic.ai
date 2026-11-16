import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

import { DEFAULT_FAQS } from '../src/lib/content-defaults'
import { DEFAULT_PLANS } from '../src/lib/plans'

const db = new PrismaClient()

async function main(): Promise<void> {
  for (const plan of DEFAULT_PLANS) {
    // Existing plans keep the prices an admin has set.
    await db.plan.upsert({ where: { slug: plan.slug }, update: {}, create: plan })
  }

  if ((await db.faq.count()) === 0) {
    await db.faq.createMany({ data: DEFAULT_FAQS.map((faq, index) => ({ ...faq, sortOrder: index })) })
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD

  if (email && password) {
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      await db.user.update({ where: { email }, data: { role: 'ADMIN' } })
      console.log(`Admin role confirmed for ${email}`)
    } else {
      await db.user.create({
        data: { email, name: 'Administrator', role: 'ADMIN', credits: 5, passwordHash: await bcrypt.hash(password, 12) },
      })
      console.log(`Admin created: ${email}`)
    }
  } else {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set: no admin created.')
  }
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
