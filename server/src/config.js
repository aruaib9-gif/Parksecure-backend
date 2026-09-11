require('dotenv').config();

const required = (name, fallback) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
};

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  isProd,
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: required('DATABASE_URL', isProd ? undefined : 'postgresql://localhost:5432/parksecure'),
  jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 4000}`,
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '10', 10),
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'ParkSecure <no-reply@parksecure.app>',
  },
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
  plateRecognizerToken: process.env.PLATE_RECOGNIZER_TOKEN,
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  cronEnabled: process.env.CRON_ENABLED !== 'false',
};
