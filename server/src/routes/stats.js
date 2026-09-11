const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const STAFF = ['security', 'facility_admin', 'park_admin', 'super_admin'];

// Dashboard stats, facility-scoped for non-super staff.
// GET /api/stats/dashboard?facility_id=...
router.get('/dashboard', authenticate, requireRole(...STAFF), async (req, res, next) => {
  try {
    let facilityId = req.query.facility_id || null;
    if (req.user.role !== 'super_admin' && req.user.assigned_facility_id) {
      facilityId = req.user.assigned_facility_id;
    }
    const fac = facilityId ? { facility_id: facilityId } : {};
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart.getTime() - 6 * 24 * 3600 * 1000);

    const [vehiclesTotal, vehiclesInside, entriesToday, exitsToday, pendingExits, openAlerts, weekScans, unpaid] =
      await Promise.all([
        prisma.vehicle.count({ where: fac }),
        prisma.vehicle.count({ where: { ...fac, is_inside: true } }),
        prisma.scanLog.count({ where: { ...fac, scan_type: 'entry', created_date: { gte: todayStart } } }),
        prisma.scanLog.count({ where: { ...fac, scan_type: 'exit', status: 'completed', created_date: { gte: todayStart } } }),
        prisma.exitRequest.count({ where: { ...fac, status: 'pending' } }),
        prisma.securityAlert.count({ where: { ...fac, status: 'open' } }),
        prisma.scanLog.findMany({
          where: { ...fac, created_date: { gte: weekStart } },
          select: { scan_type: true, created_date: true },
        }),
        prisma.payment.aggregate({ where: { ...fac, status: 'pending' }, _sum: { amount: true }, _count: true }),
      ]);

    // Bucket the last 7 days for the traffic chart.
    const weekly = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(todayStart.getTime() - i * 24 * 3600 * 1000);
      const next = new Date(day.getTime() + 24 * 3600 * 1000);
      weekly.push({
        date: day.toISOString().slice(0, 10),
        entries: weekScans.filter((s) => s.scan_type === 'entry' && s.created_date >= day && s.created_date < next).length,
        exits: weekScans.filter((s) => s.scan_type === 'exit' && s.created_date >= day && s.created_date < next).length,
      });
    }

    res.json({
      vehicles_total: vehiclesTotal,
      vehicles_inside: vehiclesInside,
      entries_today: entriesToday,
      exits_today: exitsToday,
      pending_exits: pendingExits,
      open_alerts: openAlerts,
      unpaid_amount: unpaid._sum.amount || 0,
      unpaid_count: unpaid._count,
      weekly_traffic: weekly,
    });
  } catch (err) {
    next(err);
  }
});

// Super admin: per-facility rollup.
router.get('/facilities', authenticate, requireRole('super_admin', 'park_admin'), async (req, res, next) => {
  try {
    const facilities = await prisma.facility.findMany({ orderBy: { created_date: 'asc' } });
    const results = await Promise.all(
      facilities.map(async (f) => {
        const [vehicles, inside, pending, revenue] = await Promise.all([
          prisma.vehicle.count({ where: { facility_id: f.id } }),
          prisma.vehicle.count({ where: { facility_id: f.id, is_inside: true } }),
          prisma.exitRequest.count({ where: { facility_id: f.id, status: 'pending' } }),
          prisma.payment.aggregate({ where: { facility_id: f.id, status: 'paid' }, _sum: { amount: true } }),
        ]);
        return { ...f, stats: { vehicles, inside, pending_exits: pending, revenue: revenue._sum.amount || 0 } };
      })
    );
    res.json(results);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
