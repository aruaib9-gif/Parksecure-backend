// Writes the OpenAPI spec to docs/openapi.json at the repo root.
const fs = require('fs');
const path = require('path');
const { buildOpenApiSpec } = require('../src/openapi');

const spec = buildOpenApiSpec(process.env.APP_BASE_URL || 'https://parksecure-api.onrender.com');
const out = path.resolve(__dirname, '../../docs/openapi.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(spec, null, 2));
console.log(`Wrote ${out} (${Object.keys(spec.paths).length} paths)`);
