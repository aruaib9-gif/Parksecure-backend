/* Seeds the initial super admin (from ADMIN_EMAIL / ADMIN_PASSWORD env vars)
   and default app config + legal documents. Safe to run repeatedly. */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const existing = await prisma.user.findUnique({ where: { email: adminEmail.toLowerCase() } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email: adminEmail.toLowerCase(),
          password_hash: await bcrypt.hash(adminPassword, 12),
          full_name: 'Super Admin',
          role: 'super_admin',
        },
      });
      console.log(`Created super admin: ${adminEmail}`);
    } else if (existing.role !== 'super_admin') {
      await prisma.user.update({ where: { id: existing.id }, data: { role: 'super_admin' } });
      console.log(`Promoted ${adminEmail} to super_admin`);
    } else {
      console.log(`Super admin ${adminEmail} already exists`);
    }
  } else {
    console.log('ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin seed (first registered user becomes super admin)');
  }

  const configs = [
    { key: 'overstay_threshold_hours', value: '24', label: 'Overstay threshold (hours)', category: 'alerts' },
    { key: 'discrepancy_alerts_enabled', value: 'true', label: 'Item discrepancy alerts', category: 'alerts' },
  ];
  for (const cfg of configs) {
    await prisma.appConfig.upsert({ where: { key: cfg.key }, create: cfg, update: {} });
  }

  const docs = [
    {
      document_type: 'privacy_policy',
      title: 'Privacy Policy',
      content:
        '# Privacy Policy\n\nParkSecure collects vehicle and contact information solely to operate facility security: ' +
        'entry/exit logging, exit approvals and billing. Data is retained per facility policy and never sold to third parties. ' +
        'Contact your facility administrator for data access or deletion requests.',
      version: '1.0',
    },
    {
      document_type: 'terms_of_service',
      title: 'Terms of Service',
      content:
        '# Terms of Service\n\nBy using ParkSecure you agree to accurate vehicle registration, timely response to exit ' +
        'approval requests, and settlement of parking fees billed by your facility. Facilities may suspend access for misuse.',
      version: '1.0',
    },
  ];
  for (const doc of docs) {
    const existing = await prisma.legalDocument.findFirst({ where: { document_type: doc.document_type } });
    if (!existing) await prisma.legalDocument.create({ data: doc });
  }

  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
