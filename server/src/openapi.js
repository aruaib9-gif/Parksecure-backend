const { entities } = require('./entities');

// Builds the OpenAPI 3.0 document. Entity CRUD paths are generated from the
// entity registry so the docs never drift from the actual API surface.
function buildOpenApiSpec(baseUrl) {
  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'ParkSecure API',
      version: '1.0.0',
      description:
        'REST API for the ParkSecure vehicle security platform.\n\n' +
        '**Authentication:** obtain a JWT via `POST /api/auth/login` and send it as `Authorization: Bearer <token>`.\n\n' +
        '**Roles:** `super_admin`, `park_admin`, `facility_admin`, `security`, `vehicle_owner`. ' +
        'Staff with an assigned facility are automatically scoped to that facility; vehicle owners only see their own records.',
    },
    servers: [{ url: baseUrl || 'http://localhost:4000' }],
    tags: [
      { name: 'Auth', description: 'Registration, login, profile, push tokens' },
      { name: 'Scanning', description: 'QR lookup and entry/exit recording' },
      { name: 'Exit Approval', description: 'Owner approval workflow for vehicle exits' },
      { name: 'Payments', description: 'Paystack checkout, manual settlement, balances' },
      { name: 'Functions', description: 'QR batch generation, alerts, notifications, integrations' },
      { name: 'Stats', description: 'Dashboard aggregates' },
      { name: 'Users', description: 'Staff and user administration' },
      { name: 'Uploads', description: 'File uploads' },
      { name: 'Entities', description: 'Generic CRUD for every entity type' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: { $ref: '#/components/schemas/User' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            full_name: { type: 'string', nullable: true },
            role: { type: 'string', enum: ['super_admin', 'park_admin', 'facility_admin', 'security', 'vehicle_owner'] },
            assigned_facility_id: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            avatar_url: { type: 'string', nullable: true },
            is_active: { type: 'boolean' },
            created_date: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {},
  };

  // Entity schemas + CRUD paths.
  for (const [name, def] of Object.entries(entities)) {
    const props = {
      id: { type: 'string', readOnly: true },
      created_date: { type: 'string', format: 'date-time', readOnly: true },
      updated_date: { type: 'string', format: 'date-time', readOnly: true },
    };
    const required = [];
    for (const [field, fieldSpec] of Object.entries(def.fields)) {
      props[field] = { type: fieldSpec.type === 'array' ? 'array' : fieldSpec.type };
      if (fieldSpec.type === 'array') props[field].items = {};
      if (fieldSpec.format) props[field].format = fieldSpec.format;
      if (fieldSpec.enum) props[field].enum = fieldSpec.enum;
      if (fieldSpec.required) required.push(field);
    }
    spec.components.schemas[name] = { type: 'object', properties: props, ...(required.length ? { required } : {}) };

    const readRoles = def.read === 'public' ? 'public' : def.read.join(', ');
    const writeRoles = def.write.join(', ');
    const ref = { $ref: `#/components/schemas/${name}` };
    const filterParams = Object.entries(def.fields)
      .filter(([, s]) => s.type !== 'object' && s.type !== 'array')
      .slice(0, 12)
      .map(([field, s]) => ({
        name: field,
        in: 'query',
        required: false,
        schema: { type: s.type === 'number' ? 'number' : s.type === 'boolean' ? 'boolean' : 'string' },
        description: `Filter by exact ${field}`,
      }));

    spec.paths[`/api/entities/${name}`] = {
      get: {
        tags: ['Entities'],
        summary: `List ${name} records`,
        description: `Read roles: ${readRoles}. Supports exact-match filters on any field, plus \`_gte\`/\`_lte\` suffixes for ranges.`,
        parameters: [
          { name: 'sort', in: 'query', required: false, schema: { type: 'string', default: '-created_date' }, description: 'Sort field; prefix with - for descending' },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 500, maximum: 1000 } },
          { name: 'offset', in: 'query', required: false, schema: { type: 'integer', default: 0 } },
          ...filterParams,
        ],
        responses: {
          200: { description: 'Array of records', content: { 'application/json': { schema: { type: 'array', items: ref } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
        ...(def.read === 'public' ? { security: [] } : {}),
      },
      post: {
        tags: ['Entities'],
        summary: `Create a ${name}`,
        description: `Write roles: ${writeRoles}.`,
        requestBody: { required: true, content: { 'application/json': { schema: ref } } },
        responses: {
          201: { description: 'Created record', content: { 'application/json': { schema: ref } } },
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    };
    spec.paths[`/api/entities/${name}/bulk`] = {
      post: {
        tags: ['Entities'],
        summary: `Bulk create ${name} records`,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'array', items: ref } } } },
        responses: { 201: { description: 'Created records', content: { 'application/json': { schema: { type: 'array', items: ref } } } } },
      },
    };
    spec.paths[`/api/entities/${name}/{id}`] = {
      get: {
        tags: ['Entities'],
        summary: `Get one ${name}`,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Record', content: { 'application/json': { schema: ref } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
        ...(def.read === 'public' ? { security: [] } : {}),
      },
      put: {
        tags: ['Entities'],
        summary: `Update a ${name}`,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: ref } } },
        responses: {
          200: { description: 'Updated record', content: { 'application/json': { schema: ref } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Entities'],
        summary: `Delete a ${name}`,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } } },
      },
    };
  }

  spec.components.responses = {
    Unauthorized: { description: 'Missing or invalid token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    Forbidden: { description: 'Insufficient role permissions', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    NotFound: { description: 'Record not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    BadRequest: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  };

  // ---- Manual paths: auth ----
  const json = (schema) => ({ content: { 'application/json': { schema } } });
  const obj = (properties, required) => ({ type: 'object', properties, ...(required ? { required } : {}) });
  const str = { type: 'string' };
  const num = { type: 'number' };
  const bool = { type: 'boolean' };

  Object.assign(spec.paths, {
    '/api/auth/register': {
      post: {
        tags: ['Auth'], security: [], summary: 'Create an account',
        description: 'The first account ever created becomes the super admin; later accounts default to vehicle_owner.',
        requestBody: { required: true, ...json(obj({ email: str, password: { ...str, minLength: 8 }, full_name: str, phone: str }, ['email', 'password'])) },
        responses: { 201: { description: 'Account created', ...json({ $ref: '#/components/schemas/AuthResponse' }) }, 409: { $ref: '#/components/responses/BadRequest' } },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'], security: [], summary: 'Log in',
        requestBody: { required: true, ...json(obj({ email: str, password: str }, ['email', 'password'])) },
        responses: { 200: { description: 'Token + user', ...json({ $ref: '#/components/schemas/AuthResponse' }) }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/api/auth/me': {
      get: { tags: ['Auth'], summary: 'Current user profile', responses: { 200: { description: 'User', ...json({ $ref: '#/components/schemas/User' }) } } },
      put: {
        tags: ['Auth'], summary: 'Update own profile',
        requestBody: { required: true, ...json(obj({ full_name: str, phone: str, avatar_url: str })) },
        responses: { 200: { description: 'Updated user', ...json({ $ref: '#/components/schemas/User' }) } },
      },
    },
    '/api/auth/change-password': {
      post: {
        tags: ['Auth'], summary: 'Change own password',
        requestBody: { required: true, ...json(obj({ current_password: str, new_password: { ...str, minLength: 8 } }, ['current_password', 'new_password'])) },
        responses: { 200: { description: 'Success' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/api/auth/push-token': {
      post: {
        tags: ['Auth'], summary: 'Register an Expo push token for this device',
        requestBody: { required: true, ...json(obj({ token: str, platform: { ...str, enum: ['ios', 'android'] } }, ['token'])) },
        responses: { 200: { description: 'Saved' } },
      },
      delete: {
        tags: ['Auth'], summary: 'Remove an Expo push token',
        requestBody: { required: false, ...json(obj({ token: str })) },
        responses: { 200: { description: 'Removed' } },
      },
    },
    '/api/users': {
      get: {
        tags: ['Users'], summary: 'List users (admin)',
        parameters: [{ name: 'role', in: 'query', required: false, schema: str }],
        responses: { 200: { description: 'Users', ...json({ type: 'array', items: { $ref: '#/components/schemas/User' } }) } },
      },
      post: {
        tags: ['Users'], summary: 'Create a staff user or owner account (admin)',
        description: 'If no password is given, a temporary password is generated and returned once.',
        requestBody: { required: true, ...json(obj({ email: str, password: str, full_name: str, phone: str, role: { ...str, enum: ['super_admin', 'park_admin', 'facility_admin', 'security', 'vehicle_owner'] }, assigned_facility_id: str }, ['email'])) },
        responses: { 201: { description: 'Created', ...json(obj({ user: { $ref: '#/components/schemas/User' }, temp_password: str })) } },
      },
    },
    '/api/users/{id}': {
      put: {
        tags: ['Users'], summary: 'Update a user (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: str }],
        requestBody: { required: true, ...json(obj({ full_name: str, phone: str, role: str, assigned_facility_id: str, is_active: bool, password: str })) },
        responses: { 200: { description: 'Updated user', ...json({ $ref: '#/components/schemas/User' }) } },
      },
      delete: {
        tags: ['Users'], summary: 'Delete a user (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: str }],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/api/scans/lookup': {
      get: {
        tags: ['Scanning'], summary: 'Look up a scanned QR code',
        parameters: [{ name: 'code', in: 'query', required: true, schema: str, example: 'PSK-0001' }],
        responses: {
          200: {
            description: 'Lookup result',
            ...json(obj({
              result: { ...str, enum: ['ok', 'unknown_code', 'unregistered', 'blacklisted', 'guest_expired'] },
              qr_code: { $ref: '#/components/schemas/QRCode' },
              vehicle: { $ref: '#/components/schemas/Vehicle' },
              facility: { $ref: '#/components/schemas/Facility' },
            })),
          },
        },
      },
    },
    '/api/scans/entry': {
      post: {
        tags: ['Scanning'], summary: 'Record a vehicle entry',
        description: 'Creates the entry ScanLog + ItemLogs and marks the vehicle inside. Denies blacklisted vehicles and expired guest passes.',
        requestBody: {
          required: true,
          ...json(obj({
            qr_code_id: str, vehicle_id: str, driver_name: str, driver_phone: str,
            items: { type: 'array', items: obj({ name: str, quantity: num, description: str, photo_urls: { type: 'array', items: str } }) },
            booth_photo_urls: { type: 'array', items: str }, notes: str,
          })),
        },
        responses: {
          201: { description: 'Entry recorded', ...json(obj({ scan_log: { $ref: '#/components/schemas/ScanLog' }, vehicle: { $ref: '#/components/schemas/Vehicle' } })) },
          403: { description: 'Blacklisted or expired guest pass', ...json({ $ref: '#/components/schemas/Error' }) },
          409: { description: 'Vehicle already inside', ...json({ $ref: '#/components/schemas/Error' }) },
        },
      },
    },
    '/api/scans/exit': {
      post: {
        tags: ['Scanning'], summary: 'Record a vehicle exit (starts the approval workflow)',
        description: 'Computes the parking fee from the facility billing mode, creates an ExitRequest with an approval token and notifies the owner (push + email). Auto-approves when the owner enabled security override.',
        requestBody: {
          required: true,
          ...json(obj({
            qr_code_id: str, vehicle_id: str,
            items_state: { type: 'array', items: obj({ name: str, quantity: num, confirmed: bool, discrepancy: str, photo_urls: { type: 'array', items: str } }) },
            extra_items: { type: 'array', items: obj({ name: str, quantity: num, description: str }) },
            booth_photo_urls: { type: 'array', items: str }, notes: str,
          })),
        },
        responses: {
          201: {
            description: 'Exit recorded',
            ...json(obj({
              exit_request: { $ref: '#/components/schemas/ExitRequest' },
              scan_log: { $ref: '#/components/schemas/ScanLog' },
              auto_approved: bool,
              billing: obj({ amount: num, durationMinutes: num, mode: str, currency: str }),
              whatsapp_url: { ...str, nullable: true },
              discrepancies: { ...str, nullable: true },
            })),
          },
        },
      },
    },
    '/api/exit/respond/{token}': {
      get: {
        tags: ['Exit Approval'], security: [], summary: 'One-tap owner approval link (HTML page)',
        parameters: [
          { name: 'token', in: 'path', required: true, schema: str },
          { name: 'action', in: 'query', required: false, schema: { ...str, enum: ['approve', 'reject'], default: 'approve' } },
        ],
        responses: { 200: { description: 'HTML confirmation page', content: { 'text/html': { schema: str } } } },
      },
    },
    '/api/exit/approve-by-token': {
      post: {
        tags: ['Exit Approval'], security: [], summary: 'Approve/reject an exit by token (JSON)',
        requestBody: { required: true, ...json(obj({ token: str, action: { ...str, enum: ['approve', 'reject'] } }, ['token'])) },
        responses: { 200: { description: 'Result', ...json(obj({ success: bool, request: { $ref: '#/components/schemas/ExitRequest' }, already_resolved: bool })) } },
      },
    },
    '/api/exit/{id}/approve': {
      post: {
        tags: ['Exit Approval'], summary: 'Staff approves an exit request',
        parameters: [{ name: 'id', in: 'path', required: true, schema: str }],
        responses: { 200: { description: 'Approved', ...json(obj({ success: bool, request: { $ref: '#/components/schemas/ExitRequest' } })) } },
      },
    },
    '/api/exit/{id}/reject': {
      post: {
        tags: ['Exit Approval'], summary: 'Staff rejects an exit request',
        parameters: [{ name: 'id', in: 'path', required: true, schema: str }],
        responses: { 200: { description: 'Rejected' } },
      },
    },
    '/api/exit/{id}/respond': {
      post: {
        tags: ['Exit Approval'], summary: 'Owner responds to their own exit request',
        parameters: [{ name: 'id', in: 'path', required: true, schema: str }],
        requestBody: { required: true, ...json(obj({ action: { ...str, enum: ['approve', 'reject'] } }, ['action'])) },
        responses: { 200: { description: 'Result' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/api/payments/paystack/initialize': {
      post: {
        tags: ['Payments'], summary: 'Start a Paystack checkout for a billing record',
        requestBody: { required: true, ...json(obj({ record_type: { ...str, enum: ['payment', 'user_bill', 'subscription'] }, record_id: str, email: str }, ['record_type', 'record_id'])) },
        responses: {
          200: { description: 'Checkout URL', ...json(obj({ authorization_url: str, reference: str, access_code: str })) },
          501: { description: 'Paystack not configured', ...json({ $ref: '#/components/schemas/Error' }) },
        },
      },
    },
    '/api/payments/paystack/verify': {
      post: {
        tags: ['Payments'], summary: 'Verify a Paystack transaction and mark records paid',
        requestBody: { required: true, ...json(obj({ reference: str }, ['reference'])) },
        responses: { 200: { description: 'Verification result', ...json(obj({ verified: bool })) } },
      },
    },
    '/api/payments/{id}/mark-paid': {
      post: {
        tags: ['Payments'], summary: 'Mark a payment as paid manually (staff)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: str }],
        requestBody: { required: false, ...json(obj({ method: str })) },
        responses: { 200: { description: 'Updated payment', ...json({ $ref: '#/components/schemas/Payment' }) } },
      },
    },
    '/api/payments/{id}/waive': {
      post: {
        tags: ['Payments'], summary: 'Waive a payment (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: str }],
        responses: { 200: { description: 'Updated payment' } },
      },
    },
    '/api/payments/my-balance': {
      get: {
        tags: ['Payments'], summary: "Vehicle owner's outstanding balance",
        responses: { 200: { description: 'Balance', ...json(obj({ total_due: num, bills: { type: 'array', items: { $ref: '#/components/schemas/UserBill' } }, payments: { type: 'array', items: { $ref: '#/components/schemas/Payment' } } })) } },
      },
    },
    '/api/webhooks/paystack': {
      post: {
        tags: ['Payments'], security: [], summary: 'Paystack webhook (charge.success)',
        description: 'Signature-verified via the x-paystack-signature header. Configure this URL in your Paystack dashboard.',
        responses: { 200: { description: 'Received' }, 401: { description: 'Bad signature' } },
      },
    },
    '/api/functions/generateQRBatch': {
      post: {
        tags: ['Functions'], summary: 'Generate a sequential batch of QR codes',
        requestBody: { required: true, ...json(obj({ facility_id: str, batch_name: str, count: { ...num, maximum: 500 }, prefix: { ...str, default: 'PSK' }, code_type: { ...str, enum: ['permanent', 'guest'] }, guest_duration_hours: num }, ['facility_id', 'count'])) },
        responses: { 201: { description: 'Created QR codes', ...json({ type: 'array', items: { $ref: '#/components/schemas/QRCode' } }) } },
      },
    },
    '/api/functions/assignQRCode': {
      post: {
        tags: ['Functions'], summary: 'Assign an available QR code to a vehicle',
        requestBody: { required: true, ...json(obj({ vehicle_id: str, code_id: str }, ['vehicle_id', 'code_id'])) },
        responses: { 200: { description: 'Assignment result', ...json(obj({ qr_code: { $ref: '#/components/schemas/QRCode' }, vehicle: { $ref: '#/components/schemas/Vehicle' } })) } },
      },
    },
    '/api/functions/detectSecurityAlerts': {
      post: {
        tags: ['Functions'], summary: 'Run overstay/guest-expiry/timeout detection now',
        responses: { 200: { description: 'Detection summary' } },
      },
    },
    '/api/functions/sendPushNotification': {
      post: {
        tags: ['Functions'], summary: 'Send a push notification to a user',
        requestBody: { required: true, ...json(obj({ email: str, title: str, body: str, data: { type: 'object' } }, ['email', 'title'])) },
        responses: { 200: { description: 'Send result' } },
      },
    },
    '/api/functions/sendInviteEmail': {
      post: {
        tags: ['Functions'], summary: 'Invite a vehicle owner by email',
        requestBody: { required: true, ...json(obj({ email: str, full_name: str, plate_number: str }, ['email'])) },
        responses: { 200: { description: 'Send result' } },
      },
    },
    '/api/functions/recognizePlate': {
      post: {
        tags: ['Functions'], summary: 'AI license plate recognition (requires PLATE_RECOGNIZER_TOKEN)',
        requestBody: { required: true, ...json(obj({ image_base64: str }, ['image_base64'])) },
        responses: { 200: { description: 'Recognized plate', ...json(obj({ plate: { ...str, nullable: true } })) }, 501: { description: 'Not configured' } },
      },
    },
    '/api/functions/openGate': {
      post: {
        tags: ['Functions'], summary: 'Open a physical gate (requires gate_control AppConfig)',
        requestBody: { required: false, ...json(obj({ facilityId: str, gateId: str, plateNumber: str, scanType: str })) },
        responses: { 200: { description: 'Gate webhook result' }, 501: { description: 'Not configured' } },
      },
    },
    '/api/functions/sendPaymentReminders': {
      post: {
        tags: ['Functions'], summary: 'Email payment reminders for pending/overdue bills',
        responses: { 200: { description: 'Reminder summary' } },
      },
    },
    '/api/stats/dashboard': {
      get: {
        tags: ['Stats'], summary: 'Dashboard aggregates (facility-scoped)',
        parameters: [{ name: 'facility_id', in: 'query', required: false, schema: str }],
        responses: {
          200: {
            description: 'Stats',
            ...json(obj({
              vehicles_total: num, vehicles_inside: num, entries_today: num, exits_today: num,
              pending_exits: num, open_alerts: num, unpaid_amount: num, unpaid_count: num,
              weekly_traffic: { type: 'array', items: obj({ date: str, entries: num, exits: num }) },
            })),
          },
        },
      },
    },
    '/api/stats/facilities': {
      get: {
        tags: ['Stats'], summary: 'Per-facility rollup (super admin)',
        responses: { 200: { description: 'Facilities with stats' } },
      },
    },
    '/api/uploads': {
      post: {
        tags: ['Uploads'], summary: 'Upload a file (multipart/form-data, field "file")',
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: obj({ file: { type: 'string', format: 'binary' } }, ['file']) } },
        },
        responses: { 201: { description: 'Uploaded', ...json(obj({ file_url: str, filename: str, size: num })) } },
      },
    },
    '/health': {
      get: {
        tags: ['Stats'], security: [], summary: 'Health check',
        responses: { 200: { description: 'OK', ...json(obj({ status: str, uptime: num })) } },
      },
    },
  });

  // Every operation that is not explicitly public inherits the global bearerAuth
  // requirement, so a 401 is always a possible outcome — document it once here
  // rather than repeating it across 133 operations.
  const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
  for (const item of Object.values(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      const isPublic = Array.isArray(op.security) && op.security.length === 0;
      if (isPublic) continue;
      op.responses = op.responses || {};
      if (!op.responses[401]) op.responses[401] = { $ref: '#/components/responses/Unauthorized' };
    }
  }

  return spec;
}

module.exports = { buildOpenApiSpec };
