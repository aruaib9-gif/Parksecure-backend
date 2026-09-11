const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const config = require('./config');
const prisma = require('./db');
const { buildOpenApiSpec } = require('./openapi');
const { errorHandler, notFound } = require('./middleware/error');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const { router: entityRoutes } = require('./routes/entities');
const { router: scanRoutes } = require('./routes/scans');
const exitRoutes = require('./routes/exit');
const { router: paymentRoutes, paystackWebhook } = require('./routes/payments');
const functionRoutes = require('./routes/functions');
const statsRoutes = require('./routes/stats');
const { router: uploadRoutes, uploadRoot } = require('./routes/uploads');

const app = express();
app.set('trust proxy', 1); // Render/behind proxy

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    credentials: true,
  })
);
app.use(compression());
if (process.env.NODE_ENV !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));

// Paystack webhook needs the raw body for signature verification — mount before json().
app.post('/api/webhooks/paystack', express.raw({ type: '*/*' }), (req, res, next) =>
  paystackWebhook(req, res).catch(next)
);

app.use(express.json({ limit: '2mb' }));

app.use(
  '/api/',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // The suite fires far more than 300 requests a minute; the limiter is
    // exercised by its own dedicated test instead.
    skip: () => process.env.NODE_ENV === 'test',
    message: { error: 'Rate limit exceeded' },
  })
);

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'db_unavailable', uptime: process.uptime() });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/exit', exitRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/functions', functionRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/uploads', express.static(uploadRoot, { maxAge: '7d' }));

// Swagger docs
const openapiSpec = buildOpenApiSpec(config.appBaseUrl);
app.get('/api-docs.json', (req, res) => res.json(openapiSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, { customSiteTitle: 'ParkSecure API Docs' }));

app.get('/', (req, res) =>
  res.json({ name: 'ParkSecure API', version: '1.0.0', docs: `${config.appBaseUrl}/api-docs`, health: '/health' })
);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
