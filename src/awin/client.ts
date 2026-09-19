import {
  API_BASE,
  PROGRAMMES_CACHE_MS,
  type EnvLike,
  type Relationship,
  readAccessToken,
} from '../config';
import { createPublisherContext } from '../publisher';
import { RateLimiter } from './rateLimit';
import { redactedError } from './redact';
import type { Programme, ProgrammeDetails, Publisher } from './types';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type AwinClientOptions = {
  token?: string;
  env?: EnvLike;
  fetch?: FetchLike;
  limiter?: RateLimiter;
  base?: string;
  publisherId?: number;
  now?: () => number;
  cacheMs?: number;
};

type CacheEntry = { at: number; data: unknown };

/**
 * Read-only Awin client. POST /publisher/{id}/promotions is the offers
 * catalogue (membership may include not-joined). There is no join write API.
 */
export class AwinClient {
  private readonly env: EnvLike;
  private readonly tokenOverride?: string;
  private readonly fetchImpl: FetchLike;
  private readonly limiter: RateLimiter;
  private readonly base: string;
  readonly publisherId: number;
  private readonly now: () => number;
  private readonly cacheMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(opts: AwinClientOptions = {}) {
    this.env = opts.env ?? process.env;
    this.tokenOverride = opts.token;
    this.fetchImpl = opts.fetch ?? fetch;
    this.base = (opts.base ?? API_BASE).replace(/\/$/, '');
    this.publisherId = createPublisherContext({
      publisherId: opts.publisherId,
      env: this.env,
    }).publisherId;
    this.limiter = opts.limiter ?? new RateLimiter();
    this.now = opts.now ?? Date.now;
    this.cacheMs = opts.cacheMs ?? PROGRAMMES_CACHE_MS;
  }

  getPublisher(): Promise<Publisher> {
    return this.request<Publisher>('GET', `/publishers/${this.publisherId}`);
  }

  async getProgrammes(relationship: Relationship = 'joined'): Promise<Programme[]> {
    const key = `programmes:${this.publisherId}:${relationship}`;
    const cached = this.readCache<Programme[]>(key);
    if (cached) return cached;
    const data = await this.request<unknown>(
      'GET',
      `/publishers/${this.publisherId}/programmes?relationship=${encodeURIComponent(relationship)}`,
    );
    if (!Array.isArray(data)) {
      throw redactedError('programmes response is not a JSON array');
    }
    this.writeCache(key, data);
    return data as Programme[];
  }

  getProgrammeDetails(
    advertiserId: number,
    relationship: Relationship = 'joined',
  ): Promise<ProgrammeDetails> {
    const qs = new URLSearchParams({
      advertiserId: String(advertiserId),
      relationship,
    });
    return this.request<ProgrammeDetails>(
      'GET',
      `/publishers/${this.publisherId}/programmedetails?${qs.toString()}`,
    );
  }

  /**
   * Offers search. Read-only. Path is /publisher (singular) per locked spec.
   * This is not a join/apply endpoint.
   */
  listPromotions(body: Record<string, unknown> = {}): Promise<unknown> {
    return this.request<unknown>('POST', `/publisher/${this.publisherId}/promotions`, body);
  }

  private resolveToken(): string {
    const t = this.tokenOverride ?? readAccessToken(this.env);
    if (!t) {
      throw redactedError('Missing AWIN_ACCESS_TOKEN');
    }
    return t;
  }

  private readCache<T>(key: string): T | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at >= this.cacheMs) {
      this.cache.delete(key);
      return undefined;
    }
    return hit.data as T;
  }

  private writeCache(key: string, data: unknown): void {
    this.cache.set(key, { at: this.now(), data });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.resolveToken();
    await this.limiter.acquire();
    const url = `${this.base}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await this.fetchImpl(url, init);
    } catch (err) {
      throw redactedError(err instanceof Error ? err.message : err, [token]);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw redactedError(`${method} ${url} failed: ${res.status} ${text}`, [token]);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
