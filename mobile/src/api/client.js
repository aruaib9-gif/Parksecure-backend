import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const API_URL_KEY = 'parksecure_api_url';

const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

/** The server compiled into this build (see app.config.js). */
export const DEFAULT_API_URL =
  normalizeUrl(Constants.expoConfig?.extra?.apiUrl) || 'https://parksecure-api.onrender.com';

// Mutable so a released build can be pointed at a different backend from the
// login screen instead of needing a rebuild.
let apiBaseUrl = DEFAULT_API_URL;

export const getApiUrl = () => apiBaseUrl;

/** Restores a previously saved server URL. Call once during startup. */
export async function loadApiUrl() {
  try {
    const stored = await SecureStore.getItemAsync(API_URL_KEY);
    if (stored) apiBaseUrl = normalizeUrl(stored) || DEFAULT_API_URL;
  } catch {
    // keychain unavailable — fall back to the compiled-in default
  }
  return apiBaseUrl;
}

/** Persists a server URL; pass an empty value to return to the default. */
export async function setApiUrl(url) {
  const next = normalizeUrl(url);
  if (!next) {
    apiBaseUrl = DEFAULT_API_URL;
    await SecureStore.deleteItemAsync(API_URL_KEY).catch(() => {});
    return apiBaseUrl;
  }
  if (!/^https?:\/\//i.test(next)) throw new Error('Server URL must start with http:// or https://');
  apiBaseUrl = next;
  await SecureStore.setItemAsync(API_URL_KEY, next);
  return apiBaseUrl;
}

/** Checks that a server is reachable and is actually a ParkSecure API. */
export async function probeApiUrl(url) {
  const target = normalizeUrl(url) || apiBaseUrl;
  const res = await fetch(`${target}/health`);
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  const body = await res.json().catch(() => null);
  if (!body || typeof body.status !== 'string') throw new Error('Not a ParkSecure server');
  return body;
}

let authToken = null;
let onUnauthorized = null;

export const setOnUnauthorized = (fn) => { onUnauthorized = fn; };

export async function loadToken() {
  authToken = await SecureStore.getItemAsync('parksecure_token');
  return authToken;
}

export async function setToken(token) {
  authToken = token;
  if (token) await SecureStore.setItemAsync('parksecure_token', token);
  else await SecureStore.deleteItemAsync('parksecure_token');
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, params, form } = {}) {
  let url = `${apiBaseUrl}${path}`;
  if (params) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') qs.append(key, String(value));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const headers = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (body && !form) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: form ? form : body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(0, 'Network error — check your connection');
  }
  if (res.status === 401 && authToken && onUnauthorized) onUnauthorized();
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  return data;
}

// ---- Generic entities (mirrors the old Base44 SDK semantics) ----
const entityNames = [
  'AppConfig', 'BillingItem', 'DriverPass', 'ExitRequest', 'Facility', 'ItemLog',
  'LegalDocument', 'NotificationSettings', 'Payment', 'QRCode', 'ScanLog',
  'SecurityAlert', 'ShiftHandover', 'SubscriptionPayment', 'UserBill', 'Vehicle',
];

const makeEntity = (name) => ({
  list: (params) => request(`/api/entities/${name}`, { params }),
  filter: (filter, params) => request(`/api/entities/${name}`, { params: { ...filter, ...params } }),
  get: (id) => request(`/api/entities/${name}/${id}`),
  create: (data) => request(`/api/entities/${name}`, { method: 'POST', body: data }),
  bulkCreate: (items) => request(`/api/entities/${name}/bulk`, { method: 'POST', body: items }),
  update: (id, data) => request(`/api/entities/${name}/${id}`, { method: 'PUT', body: data }),
  delete: (id) => request(`/api/entities/${name}/${id}`, { method: 'DELETE' }),
});

export const entities = Object.fromEntries(entityNames.map((n) => [n, makeEntity(n)]));

// ---- Auth ----
export const auth = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  register: (data) => request('/api/auth/register', { method: 'POST', body: data }),
  me: () => request('/api/auth/me'),
  updateMe: (data) => request('/api/auth/me', { method: 'PUT', body: data }),
  changePassword: (current_password, new_password) =>
    request('/api/auth/change-password', { method: 'POST', body: { current_password, new_password } }),
  savePushToken: (token, platform) =>
    request('/api/auth/push-token', { method: 'POST', body: { token, platform } }),
};

// ---- Users admin ----
export const users = {
  list: (params) => request('/api/users', { params }),
  create: (data) => request('/api/users', { method: 'POST', body: data }),
  update: (id, data) => request(`/api/users/${id}`, { method: 'PUT', body: data }),
  delete: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),
};

// ---- Scanning ----
export const scans = {
  lookup: (code) => request('/api/scans/lookup', { params: { code } }),
  entry: (payload) => request('/api/scans/entry', { method: 'POST', body: payload }),
  exit: (payload) => request('/api/scans/exit', { method: 'POST', body: payload }),
};

// ---- Exit approvals ----
export const exits = {
  approve: (id) => request(`/api/exit/${id}/approve`, { method: 'POST' }),
  reject: (id) => request(`/api/exit/${id}/reject`, { method: 'POST' }),
  respond: (id, action) => request(`/api/exit/${id}/respond`, { method: 'POST', body: { action } }),
  approveByToken: (token, action) =>
    request('/api/exit/approve-by-token', { method: 'POST', body: { token, action } }),
};

// ---- Payments ----
export const payments = {
  initPaystack: (record_type, record_id, email) =>
    request('/api/payments/paystack/initialize', { method: 'POST', body: { record_type, record_id, email } }),
  verifyPaystack: (reference) =>
    request('/api/payments/paystack/verify', { method: 'POST', body: { reference } }),
  markPaid: (id, method) => request(`/api/payments/${id}/mark-paid`, { method: 'POST', body: { method } }),
  waive: (id) => request(`/api/payments/${id}/waive`, { method: 'POST' }),
  myBalance: () => request('/api/payments/my-balance'),
};

// ---- Server functions ----
export const functions = {
  generateQRBatch: (payload) => request('/api/functions/generateQRBatch', { method: 'POST', body: payload }),
  assignQRCode: (vehicle_id, code_id) =>
    request('/api/functions/assignQRCode', { method: 'POST', body: { vehicle_id, code_id } }),
  detectSecurityAlerts: () => request('/api/functions/detectSecurityAlerts', { method: 'POST' }),
  sendPushNotification: (payload) => request('/api/functions/sendPushNotification', { method: 'POST', body: payload }),
  sendInviteEmail: (payload) => request('/api/functions/sendInviteEmail', { method: 'POST', body: payload }),
  recognizePlate: (image_base64) => request('/api/functions/recognizePlate', { method: 'POST', body: { image_base64 } }),
  openGate: (payload) => request('/api/functions/openGate', { method: 'POST', body: payload }),
  sendPaymentReminders: () => request('/api/functions/sendPaymentReminders', { method: 'POST' }),
};

// ---- Stats ----
export const stats = {
  dashboard: (facility_id) => request('/api/stats/dashboard', { params: facility_id ? { facility_id } : undefined }),
  facilities: () => request('/api/stats/facilities'),
};

// ---- Uploads ----
export async function uploadFile(uri, mimeType = 'image/jpeg') {
  const form = new FormData();
  const name = uri.split('/').pop() || 'photo.jpg';
  form.append('file', { uri, name, type: mimeType });
  return request('/api/uploads', { method: 'POST', form });
}

export default { entities, auth, users, scans, exits, payments, functions, stats, uploadFile };
