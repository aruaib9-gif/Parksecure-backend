export const colors = {
  primary: '#0f766e',
  primaryDark: '#115e59',
  primaryLight: '#ccfbf1',
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#64748b',
  textLight: '#94a3b8',
  success: '#059669',
  successBg: '#d1fae5',
  danger: '#dc2626',
  dangerBg: '#fee2e2',
  warning: '#d97706',
  warningBg: '#fef3c7',
  info: '#2563eb',
  infoBg: '#dbeafe',
  purple: '#7c3aed',
  purpleBg: '#ede9fe',
};

export const statusColors = {
  // generic record statuses -> [fg, bg]
  active: [colors.success, colors.successBg],
  completed: [colors.success, colors.successBg],
  approved: [colors.success, colors.successBg],
  paid: [colors.success, colors.successBg],
  available: [colors.success, colors.successBg],
  resolved: [colors.success, colors.successBg],
  sent: [colors.success, colors.successBg],
  pending: [colors.warning, colors.warningBg],
  pending_approval: [colors.warning, colors.warningBg],
  investigating: [colors.warning, colors.warningBg],
  draft: [colors.textMuted, colors.border],
  overdue: [colors.danger, colors.dangerBg],
  rejected: [colors.danger, colors.dangerBg],
  denied: [colors.danger, colors.dangerBg],
  blacklisted: [colors.danger, colors.dangerBg],
  failed: [colors.danger, colors.dangerBg],
  open: [colors.danger, colors.dangerBg],
  timeout: [colors.textMuted, colors.border],
  escalated: [colors.purple, colors.purpleBg],
  suspended: [colors.warning, colors.warningBg],
  deactivated: [colors.textMuted, colors.border],
  dismissed: [colors.textMuted, colors.border],
  waived: [colors.info, colors.infoBg],
  assigned: [colors.info, colors.infoBg],
  expired: [colors.textMuted, colors.border],
  inactive: [colors.textMuted, colors.border],
  guest: [colors.purple, colors.purpleBg],
  permanent: [colors.info, colors.infoBg],
  entry: [colors.success, colors.successBg],
  exit: [colors.info, colors.infoBg],
  low: [colors.textMuted, colors.border],
  medium: [colors.warning, colors.warningBg],
  high: [colors.danger, colors.dangerBg],
  critical: ['#ffffff', colors.danger],
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const formatNaira = (amount) =>
  `₦${Number(amount || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

export const timeAgo = (value) => {
  if (!value) return '';
  const mins = Math.floor((Date.now() - new Date(value)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export const roleLabels = {
  super_admin: 'Super Admin',
  park_admin: 'Park Admin',
  facility_admin: 'Facility Admin',
  security: 'Security Officer',
  vehicle_owner: 'Vehicle Owner',
};
