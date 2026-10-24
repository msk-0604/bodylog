/* In-memory stand-in for Supabase used by sync tests. Mirrors the server rules that matter:
 * server-assigned updated_at, owner checks, soft deletes can't be undone, free-plan limits. */
import type { MasterFoodRow } from '../../repo/foods';
import { RemoteError, type RemoteApi, type Row } from '../remote';

const LIMITS: Record<string, number> = { food_favorites: 10, meal_templates: 1 };

export class FakeRemote implements RemoteApi {
  tables = new Map<string, Map<string, Row>>();
  foods = new Map<string, MasterFoodRow>();
  premiumUsers = new Set<string>();
  /** Fail the next N calls with a network error. */
  failNext = 0;
  /** Apply the next upsert but then fail (response lost) — tests idempotent retries. */
  loseNextResponse = false;
  calls = 0;
  private clock = Date.parse('2026-10-24T00:00:00Z');

  private now() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  table(name: string) {
    let t = this.tables.get(name);
    if (!t) this.tables.set(name, (t = new Map()));
    return t;
  }

  private maybeFail() {
    this.calls++;
    if (this.failNext > 0) {
      this.failNext--;
      throw new RemoteError('Network request failed', 'network');
    }
  }

  async upsert(table: string, rows: Row[], onConflict: string) {
    this.maybeFail();
    const t = this.table(table);
    // validate all first (statement is atomic; the DB trigger checks row by row)
    const added = new Map<string, number>();
    for (const row of rows) {
      if (!row.user_id) throw new RemoteError('null user_id', 'rejected', '23502');
      const limit = LIMITS[table];
      const existing = t.get(String(row.id));
      const uid = String(row.user_id);
      if (limit && !existing && !row.deleted_at && !this.premiumUsers.has(uid)) {
        const active =
          [...t.values()].filter((r) => r.user_id === row.user_id && !r.deleted_at).length +
          (added.get(uid) ?? 0);
        added.set(uid, (added.get(uid) ?? 0) + 1);
        if (active >= limit) {
          throw new RemoteError(
            `free plan limit reached for ${table}`,
            'rejected',
            'P0001',
            'premium_required',
          );
        }
      }
    }
    for (const row of rows) {
      const keyCols = onConflict.split(',');
      const existing = [...t.values()].find((r) => keyCols.every((c) => r[c] === row[c]));
      const merged: Row = { ...(existing ?? {}), ...row, updated_at: this.now() };
      if (existing?.deleted_at) merged.deleted_at = existing.deleted_at; // never un-delete
      if (existing && existing.id !== row.id) t.delete(String(existing.id));
      t.set(String(row.id), merged);
    }
    if (this.loseNextResponse) {
      this.loseNextResponse = false;
      throw new RemoteError('Network request failed', 'network');
    }
  }

  async updateProfile(userId: string, values: Row) {
    this.maybeFail();
    const t = this.table('profiles');
    const existing = t.get(userId) ?? { id: userId, created_at: this.now() };
    t.set(userId, { ...existing, ...values, id: userId, updated_at: this.now() });
  }

  async pull(table: string, userId: string, since: string | null, limit: number) {
    this.maybeFail();
    const owner = table === 'profiles' ? 'id' : 'user_id';
    return [...this.table(table).values()]
      .filter((r) => r[owner] === userId && (!since || String(r.updated_at) >= since))
      .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async fetchFoods(ids: string[]) {
    this.maybeFail();
    return ids.map((id) => this.foods.get(id)).filter((f): f is MasterFoodRow => !!f);
  }

  async searchFoods(q: string, limit: number) {
    this.maybeFail();
    return [...this.foods.values()].filter((f) => f.name.includes(q)).slice(0, limit);
  }
}
