// Parking fee calculation per facility billing mode.
function computeBilling(facility, lastEntry, now = new Date()) {
  const durationMinutes = lastEntry ? Math.max(0, Math.round((now - new Date(lastEntry)) / 60000)) : 0;
  let amount = 0;
  const mode = facility?.billing_mode || 'free';
  if (mode === 'standard') {
    amount = facility.standard_rate || 0;
  } else if (mode === 'hourly') {
    amount = Math.ceil(Math.max(durationMinutes, 1) / 60) * (facility.hourly_rate || 0);
  }
  return { amount, durationMinutes, mode, currency: facility?.currency || 'NGN' };
}

function durationText(minutes) {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

module.exports = { computeBilling, durationText };
