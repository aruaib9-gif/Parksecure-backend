// Offline scan queue: when the network is down, entry/exit scans are stored in
// AsyncStorage and replayed (with exponential backoff) once connectivity returns.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scans } from '../api/client';

const QUEUE_KEY = 'parksecure_offline_queue';
const CACHE_KEY = 'parksecure_cached_vehicles';

export async function getQueue() {
  try {
    return JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) || '[]');
  } catch {
    return [];
  }
}

async function saveQueue(queue) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueScan(type, payload) {
  const queue = await getQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    type, // 'ENTRY' | 'EXIT'
    payload,
    status: 'pending',
    retryCount: 0,
    lastError: null,
  });
  await saveQueue(queue);
}

export async function clearSynced() {
  const queue = await getQueue();
  await saveQueue(queue.filter((op) => op.status !== 'synced'));
}

// App foregrounding and the 60s timer can both trigger a flush; without this the
// two passes read the same queue and replay every operation twice.
let flushing = null;

export function flushQueue() {
  if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
  return flushing;
}

async function doFlush() {
  const queue = await getQueue();
  let synced = 0;
  let failed = 0;
  for (const op of queue) {
    if (op.status === 'synced') continue;
    const backoffMs = Math.min(2 ** op.retryCount * 30000, 600000);
    if (op.lastAttempt && Date.now() - new Date(op.lastAttempt) < backoffMs) continue;
    try {
      if (op.type === 'ENTRY') await scans.entry(op.payload);
      else if (op.type === 'EXIT') await scans.exit(op.payload);
      op.status = 'synced';
      synced++;
    } catch (err) {
      // Conflicts mean the state already advanced (e.g. duplicate) — drop them.
      if (err.status === 409) {
        op.status = 'synced';
        op.lastError = err.message;
        synced++;
      } else {
        op.status = err.status === 0 ? 'pending' : 'failed';
        op.retryCount += 1;
        op.lastAttempt = new Date().toISOString();
        op.lastError = err.message;
        failed++;
      }
    }
  }
  await saveQueue(queue);
  return { synced, failed, remaining: queue.filter((o) => o.status !== 'synced').length };
}

export async function cacheVehicles(vehicles) {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ at: new Date().toISOString(), vehicles }));
}

export async function getCachedVehicles() {
  try {
    return JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) || 'null');
  } catch {
    return null;
  }
}
