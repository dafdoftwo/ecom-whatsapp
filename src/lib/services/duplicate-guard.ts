import fs from 'fs';
import path from 'path';

export type MessageType = 'newOrder' | 'noAnswer' | 'shipped' | 'rejectedOffer' | 'reminder';

const FILE_NAME = 'sent-messages.json';
const FILE_DIR = process.env.CONFIG_DIR || path.resolve('./config');
const FILE_PATH = path.join(FILE_DIR, FILE_NAME);
const REDIS_URL = process.env.REDIS_URL;

function buildKeys(orderId: string, phone?: string | null, name?: string | null, type?: MessageType) {
  const keys: string[] = [];
  const safeOrder = (orderId || '').trim();
  const safePhone = (phone || '').replace(/\D+/g, '');
  const safeName = (name || '').trim();
  const t = type || 'newOrder';
  if (safeOrder) keys.push(`msg:order:${t}:${safeOrder}`);
  if (safePhone) keys.push(`msg:phone:${t}:${safePhone}`);
  if (safeName) keys.push(`msg:name:${t}:${safeName}`);
  return keys;
}

class FileStore {
  private data: Set<string> = new Set();
  private initialized = false;

  private ensureLoaded() {
    if (this.initialized) return;
    try {
      if (!fs.existsSync(FILE_DIR)) {
        fs.mkdirSync(FILE_DIR, { recursive: true });
      }
      if (fs.existsSync(FILE_PATH)) {
        const raw = fs.readFileSync(FILE_PATH, 'utf-8');
        const arr: string[] = JSON.parse(raw);
        this.data = new Set(arr);
      }
      this.initialized = true;
    } catch (e) {
      console.warn('DuplicateGuard: could not load file store, starting empty', e);
      this.initialized = true;
      this.data = new Set();
    }
  }

  private persist() {
    try {
      fs.writeFileSync(FILE_PATH, JSON.stringify(Array.from(this.data), null, 2), 'utf-8');
    } catch (e) {
      console.warn('DuplicateGuard: could not persist file store', e);
    }
  }

  hasAny(keys: string[]): boolean {
    this.ensureLoaded();
    return keys.some(k => this.data.has(k));
  }

  addAll(keys: string[]) {
    this.ensureLoaded();
    for (const k of keys) this.data.add(k);
    this.persist();
  }
}

class RedisStore {
  private client: any | null = null;
  private connecting = false;

  private async getClient() {
    if (!REDIS_URL) return null;
    if (this.client) return this.client;
    if (this.connecting) return null;
    try {
      this.connecting = true;
      const { createClient } = await import('redis');
      const client = createClient({ url: REDIS_URL });
      client.on('error', (err: any) => console.warn('DuplicateGuard Redis error', err));
      await client.connect();
      this.client = client;
      return this.client;
    } catch (e) {
      console.warn('DuplicateGuard: Redis not available, using file fallback');
      return null;
    } finally {
      this.connecting = false;
    }
  }

  async hasAny(keys: string[]): Promise<boolean> {
    const c = await this.getClient();
    if (!c) return false;
    for (const k of keys) {
      const exists = await c.exists(k);
      if (exists) return true;
    }
    return false;
  }

  async addAll(keys: string[]): Promise<void> {
    const c = await this.getClient();
    if (!c) return;
    const pipeline = c.multi();
    for (const k of keys) {
      pipeline.set(k, '1');
    }
    await pipeline.exec();
  }
}

const fileStore = new FileStore();
const redisStore = new RedisStore();

export class DuplicateGuardService {
  static async shouldSend(orderId: string, type: MessageType, phone?: string | null, name?: string | null): Promise<boolean> {
    const keys = buildKeys(orderId, phone, name, type);
    // Prefer Redis if available
    const redisHas = await redisStore.hasAny(keys);
    if (redisHas) return false;
    const fileHas = fileStore.hasAny(keys);
    return !fileHas;
  }

  static async markSent(orderId: string, type: MessageType, phone?: string | null, name?: string | null): Promise<void> {
    const keys = buildKeys(orderId, phone, name, type);
    // Best-effort write
    await redisStore.addAll(keys).catch(() => void 0);
    fileStore.addAll(keys);
  }
} 