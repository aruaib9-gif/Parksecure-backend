const prisma = require('../db');

// Automated detections, run hourly by cron and on demand via
// POST /api/functions/detectSecurityAlerts:
//   - overstay: vehicle inside longer than the configured threshold
//   - guest_pass_expired: guest still inside after pass expiry
//   - exit request timeout: pending longer than facility exit_timeout_minutes
async function runSecurityDetection() {
  const now = new Date();
  const created = { overstay: 0, guest_expired: 0, exit_timeouts: 0 };

  const thresholdCfg = await prisma.appConfig.findUnique({ where: { key: 'overstay_threshold_hours' } });
  const thresholdHours = parseFloat(thresholdCfg?.value || '24') || 24;

  // --- Overstays ---
  const insideVehicles = await prisma.vehicle.findMany({ where: { is_inside: true, last_entry: { not: null } } });
  for (const vehicle of insideVehicles) {
    const hoursIn = (now - new Date(vehicle.last_entry)) / 3600000;
    if (hoursIn < thresholdHours) continue;
    const existing = await prisma.securityAlert.findFirst({
      where: { alert_type: 'overstay', vehicle_id: vehicle.id, status: { in: ['open', 'investigating'] } },
    });
    if (existing) continue;
    const facility = vehicle.facility_id
      ? await prisma.facility.findUnique({ where: { id: vehicle.facility_id } })
      : null;
    await prisma.securityAlert.create({
      data: {
        alert_type: 'overstay',
        severity: hoursIn >= 48 ? 'critical' : 'high',
        facility_id: vehicle.facility_id,
        facility_name: facility?.name,
        vehicle_id: vehicle.id,
        plate_number: vehicle.plate_number,
        owner_name: vehicle.owner_name,
        driver_name: vehicle.driver_name,
        title: `Overstay — ${vehicle.plate_number}`,
        description: `Vehicle has been inside for ${hoursIn.toFixed(1)} hours (threshold ${thresholdHours}h)`,
        overstay_hours: Math.round(hoursIn * 10) / 10,
        threshold_hours: thresholdHours,
      },
    });
    created.overstay++;
  }

  // --- Expired guest passes still inside ---
  const expiredGuests = await prisma.vehicle.findMany({
    where: { registration_type: 'guest', is_inside: true, guest_pass_expires: { lt: now } },
  });
  for (const vehicle of expiredGuests) {
    const existing = await prisma.securityAlert.findFirst({
      where: { alert_type: 'guest_pass_expired', vehicle_id: vehicle.id, status: { in: ['open', 'investigating'] } },
    });
    if (existing) continue;
    await prisma.securityAlert.create({
      data: {
        alert_type: 'guest_pass_expired',
        severity: 'medium',
        facility_id: vehicle.facility_id,
        vehicle_id: vehicle.id,
        plate_number: vehicle.plate_number,
        owner_name: vehicle.owner_name,
        title: `Guest pass expired — ${vehicle.plate_number}`,
        description: `Guest pass expired at ${new Date(vehicle.guest_pass_expires).toLocaleString()} but the vehicle is still inside`,
      },
    });
    created.guest_expired++;
  }

  // --- Exit request timeouts ---
  const facilities = await prisma.facility.findMany();
  const timeoutByFacility = Object.fromEntries(facilities.map((f) => [f.id, f.exit_timeout_minutes || 15]));
  const pending = await prisma.exitRequest.findMany({ where: { status: 'pending' } });
  for (const request of pending) {
    const timeoutMin = timeoutByFacility[request.facility_id] || 15;
    const ageMin = (now - new Date(request.created_date)) / 60000;
    if (ageMin < timeoutMin) continue;
    await prisma.exitRequest.update({ where: { id: request.id }, data: { status: 'timeout' } });
    await prisma.scanLog.updateMany({
      where: { vehicle_id: request.vehicle_id, scan_type: 'exit', status: 'pending_approval' },
      data: { status: 'timeout' },
    });
    created.exit_timeouts++;
  }

  return { success: true, created, checked: { inside: insideVehicles.length, pending_exits: pending.length } };
}

module.exports = { runSecurityDetection };
