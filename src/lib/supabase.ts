import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Profile, Registration, Team, TeamDecision, UserRole } from '../types/database';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isConfigured = Boolean(
  rawUrl &&
  rawAnonKey &&
  rawUrl.startsWith('http') &&
  !rawUrl.includes('placeholder')
);

const STORAGE_PREFIX = 'monument_mun_mock_';

function getStorage<T>(key: string, defaultValue: T): T {
  try {
    const val = localStorage.getItem(STORAGE_PREFIX + key);
    return val ? (JSON.parse(val) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStorage<T>(key: string, val: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val));
  } catch {}
}

const DEFAULT_TEAMS: Team[] = [
  { id: 'team-dep-01', name: 'Logistics & Operations', kind: 'department', created_at: new Date(Date.now() - 86400000 * 20).toISOString() },
  { id: 'team-dep-02', name: 'Media & Public Relations', kind: 'department', created_at: new Date(Date.now() - 86400000 * 20).toISOString() },
  { id: 'team-dep-03', name: 'Crisis & Substantive', kind: 'department', created_at: new Date(Date.now() - 86400000 * 20).toISOString() },
  { id: 'team-dep-04', name: 'Finance & Sponsorship', kind: 'department', created_at: new Date(Date.now() - 86400000 * 20).toISOString() },
  { id: 'team-dep-05', name: 'Delegate Affairs', kind: 'department', created_at: new Date(Date.now() - 86400000 * 20).toISOString() },
  { id: 'team-comm-01', name: 'Security Council (UNSC)', kind: 'committee', created_at: new Date(Date.now() - 86400000 * 20).toISOString() },
  { id: 'team-comm-02', name: 'UNESCO', kind: 'committee', created_at: new Date(Date.now() - 86400000 * 20).toISOString() },
  { id: 'team-comm-03', name: 'Economic and Social Council (ECOSOC)', kind: 'committee', created_at: new Date(Date.now() - 86400000 * 20).toISOString() },
  { id: 'team-comm-04', name: 'Human Rights Council (UNHRC)', kind: 'committee', created_at: new Date(Date.now() - 86400000 * 20).toISOString() },
  { id: 'team-comm-05', name: 'UN Women', kind: 'committee', created_at: new Date(Date.now() - 86400000 * 20).toISOString() }
];

const DEFAULT_PROFILES: Profile[] = [
  {
    id: 'user-sg-01',
    role: 'admin',
    full_name: 'Mazen Alaa',
    email: 'sg@monumentmun.org',
    eb_position: 'Secretary General',
    created_at: new Date(Date.now() - 86400000 * 14).toISOString()
  },
  {
    id: 'user-deputy-02',
    role: 'head',
    full_name: 'Lama Abdelsalam',
    email: 'deputy@monumentmun.org',
    eb_position: 'Deputy Secretary General',
    team_id: 'team-dep-01',
    team_status: 'approved',
    created_at: new Date(Date.now() - 86400000 * 10).toISOString()
  },
  {
    id: 'user-admin-03',
    role: 'admin',
    full_name: 'Ahmed Magdi',
    email: 'ahmedmagdialkik@gmail.com',
    eb_position: 'Secretariat Admin & IT Director',
    team_id: 'team-dep-02',
    team_status: 'approved',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString()
  },
  {
    id: 'user-cand-01',
    role: 'user',
    full_name: 'Karim Zaki',
    email: 'karim.zaki@example.com',
    team_id: 'team-dep-01',
    team_status: 'pending',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: 'user-cand-02',
    role: 'user',
    full_name: 'Dina Mansour',
    email: 'dina.m@example.com',
    team_id: 'team-dep-01',
    team_status: 'approved',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString()
  }
];

const DEFAULT_REGISTRATIONS: Registration[] = [
  {
    id: 'reg-001',
    user_id: 'user-del-01',
    full_name: 'Sofia Ramirez',
    email: 'sofia.ramirez@example.com',
    phone: '+1 (555) 234-5678',
    school: 'Georgetown University',
    committee: 'Security Council (UNSC) · Great Wall of China',
    status: 'approved',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: 'reg-002',
    user_id: 'user-del-02',
    full_name: 'Alexander Chen',
    email: 'alex.chen@example.org',
    phone: '+44 20 7946 0912',
    school: 'London School of Economics',
    committee: 'Economic and Social Council (ECOSOC) · Petra',
    status: 'pending',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: 'reg-003',
    user_id: 'user-del-03',
    full_name: 'Nour El-Din Hassan',
    email: 'nour.hassan@example.com',
    phone: '+20 100 555 1234',
    school: 'Cairo University',
    committee: 'UNESCO · The Pyramids of Giza',
    status: 'approved',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString()
  }
];

// Initialize mock store if empty
if (!getStorage('mock_initialized_v2', false)) {
  setStorage('profiles', DEFAULT_PROFILES);
  setStorage('registrations', DEFAULT_REGISTRATIONS);
  setStorage('teams', DEFAULT_TEAMS);
  setStorage('mock_initialized_v2', true);
}

type GenericRecord = Record<string, unknown>;

class MockQueryBuilder<T extends GenericRecord = GenericRecord> {
  private table: string;
  private filters: Array<(row: T) => boolean> = [];
  private orderField?: string;
  private orderAscending = true;
  private limitCount?: number;

  constructor(table: string) {
    this.table = table;
  }

  select(_fields?: string): this {
    return this;
  }

  eq(field: string, value: unknown): this {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  neq(field: string, value: unknown): this {
    this.filters.push((row) => row[field] !== value);
    return this;
  }

  not(field: string, operator: string, value: unknown): this {
    if (operator === 'is' && value === null) {
      this.filters.push((row) => row[field] !== null && row[field] !== undefined);
    }
    return this;
  }

  order(field: string, options?: { ascending?: boolean }): this {
    this.orderField = field;
    this.orderAscending = options?.ascending !== false;
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  insert(values: Partial<T>) {
    const list = getStorage<T[]>(this.table, []);
    const newRow = {
      id: typeof values.id !== 'undefined' ? values.id : 'id_' + Math.random().toString(36).substring(2, 9),
      created_at: new Date().toISOString(),
      ...values
    } as unknown as T;
    list.unshift(newRow);
    setStorage(this.table, list);
    return {
      select: () => ({
        single: async (): Promise<{ data: T; error: null }> => ({ data: newRow, error: null })
      }),
      single: async (): Promise<{ data: T; error: null }> => ({ data: newRow, error: null }),
      then: (resolve: (val: { data: T[]; error: null }) => void) => resolve({ data: [newRow], error: null })
    };
  }

  update(values: Partial<T>) {
    return {
      eq: async (field: string, value: unknown): Promise<{ data: T[]; error: null }> => {
        const list = getStorage<T[]>(this.table, []);
        for (const row of list) {
          if (row[field] === value) {
            Object.assign(row, values);
          }
        }
        setStorage(this.table, list);
        return { data: list, error: null };
      }
    };
  }

  async maybeSingle(): Promise<{ data: T | null; error: null }> {
    const data = this.execute();
    return { data: data[0] || null, error: null };
  }

  async single(): Promise<{ data: T | null; error: { message: string } | null }> {
    const data = this.execute();
    return { data: data[0] || null, error: data.length === 0 ? { message: 'Row not found' } : null };
  }

  then<TResult1 = { data: T[]; error: null }>(
    resolve: (val: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>
  ): Promise<TResult1> {
    const data = this.execute();
    return Promise.resolve({ data, error: null }).then(resolve);
  }

  private execute(): T[] {
    let list = getStorage<T[]>(this.table, []);
    for (const f of this.filters) {
      list = list.filter(f);
    }
    if (this.orderField) {
      const field = this.orderField;
      const asc = this.orderAscending;
      list = [...list].sort((a, b) => {
        const valA = a[field] as string | number | undefined;
        const valB = b[field] as string | number | undefined;
        if (valA === undefined || valB === undefined) return 0;
        if (valA < valB) return asc ? -1 : 1;
        if (valA > valB) return asc ? 1 : -1;
        return 0;
      });
    }
    if (typeof this.limitCount === 'number') {
      list = list.slice(0, this.limitCount);
    }
    return list;
  }
}

export interface MockSessionUser {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
    eb_position?: string | null;
  };
}

export interface MockSession {
  access_token: string;
  user: MockSessionUser;
}

type AuthListener = (event: string, session: MockSession | null) => void;
const authListeners = new Set<AuthListener>();

interface MockSupabaseClientContract {
  from: <T extends GenericRecord = GenericRecord>(table: string) => MockQueryBuilder<T>;
  rpc: (
    fnName: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  auth: {
    getSession: () => Promise<{ data: { session: MockSession | null }; error: null }>;
    onAuthStateChange: (callback: AuthListener) => {
      data: {
        subscription: {
          unsubscribe: () => void;
        };
      };
    };
    signUp: (params: {
      email: string;
      password?: string;
      options?: { data?: Record<string, unknown> };
    }) => Promise<{ data: { user: MockSessionUser | null; session: MockSession | null }; error: { message: string } | null }>;
    signInWithPassword: (params: {
      email: string;
      password?: string;
    }) => Promise<{ data: { user: MockSessionUser | null; session: MockSession | null }; error: { message: string } | null }>;
    signOut: () => Promise<{ error: null }>;
    resetPasswordForEmail: (
      email: string,
      options?: Record<string, unknown>
    ) => Promise<{ data: Record<string, unknown>; error: null }>;
  };
}

function createMockSupabaseClient(): MockSupabaseClientContract {
  return {
    from<T extends GenericRecord = GenericRecord>(table: string) {
      return new MockQueryBuilder<T>(table);
    },
    rpc(fnName: string, args?: Record<string, unknown>) {
      if (fnName === 'set_user_role') {
        const email = String(args?.p_email || '').toLowerCase().trim();
        const role = args?.p_role as UserRole;
        if (role === 'head') {
          return Promise.resolve({
            data: null,
            error: { message: "Never assign role 'head' via set_user_role; use assign_head(email, team_id)." }
          });
        }
        const profiles = getStorage<Profile[]>('profiles', []);
        const target = profiles.find((p) => p.email?.toLowerCase() === email);
        if (!target) {
          return Promise.resolve({
            data: null,
            error: { message: `No profile exists for ${email}. That person must sign up first.` }
          });
        }
        target.role = role;
        setStorage('profiles', profiles);
        return Promise.resolve({ data: { success: true }, error: null });
      }

      if (fnName === 'assign_head') {
        const email = String(args?.p_email || '').toLowerCase().trim();
        const teamId = String(args?.p_team_id || '').trim();
        if (!teamId) {
          return Promise.resolve({
            data: null,
            error: { message: 'A team must be selected to assign as Head.' }
          });
        }
        const profiles = getStorage<Profile[]>('profiles', []);
        const target = profiles.find((p) => p.email?.toLowerCase() === email);
        if (!target) {
          return Promise.resolve({
            data: null,
            error: { message: `No profile found for ${email}.` }
          });
        }
        target.role = 'head';
        target.team_id = teamId;
        target.team_status = 'approved';
        setStorage('profiles', profiles);
        return Promise.resolve({ data: { success: true }, error: null });
      }

      if (fnName === 'remove_head') {
        const email = String(args?.p_email || '').toLowerCase().trim();
        const profiles = getStorage<Profile[]>('profiles', []);
        const target = profiles.find((p) => p.email?.toLowerCase() === email);
        if (!target) {
          return Promise.resolve({
            data: null,
            error: { message: `No profile found for ${email}.` }
          });
        }
        target.role = target.eb_position ? 'eb' : 'user';
        target.team_id = null;
        target.team_status = null;
        setStorage('profiles', profiles);
        return Promise.resolve({ data: { success: true }, error: null });
      }

      if (fnName === 'request_team') {
        const teamId = String(args?.p_team_id || '').trim();
        const session = getStorage<MockSession | null>('session', null);
        if (!session?.user?.id) {
          return Promise.resolve({
            data: null,
            error: { message: 'You must be signed in to request a team.' }
          });
        }
        const profiles = getStorage<Profile[]>('profiles', []);
        const target = profiles.find((p) => p.id === session.user.id || p.email?.toLowerCase() === session.user.email.toLowerCase());
        if (!target) {
          return Promise.resolve({
            data: null,
            error: { message: 'Profile record not found.' }
          });
        }
        target.team_id = teamId;
        target.team_status = 'pending';
        setStorage('profiles', profiles);
        return Promise.resolve({ data: { success: true }, error: null });
      }

      if (fnName === 'review_team_member') {
        const userId = String(args?.p_user_id || '').trim();
        const decision = args?.p_decision as TeamDecision;
        const profiles = getStorage<Profile[]>('profiles', []);
        const target = profiles.find((p) => p.id === userId);
        if (!target) {
          return Promise.resolve({
            data: null,
            error: { message: `User record with id ${userId} not found.` }
          });
        }
        if (decision === 'approved') {
          target.team_status = 'approved';
        } else if (decision === 'rejected') {
          target.team_status = 'rejected';
        } else if (decision === 'removed') {
          target.team_status = null;
          target.team_id = null;
        }
        setStorage('profiles', profiles);
        return Promise.resolve({ data: { success: true }, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    },
    auth: {
      async getSession() {
        const session = getStorage<MockSession | null>('session', null);
        return { data: { session }, error: null };
      },
      onAuthStateChange(callback: AuthListener) {
        authListeners.add(callback);
        const session = getStorage<MockSession | null>('session', null);
        if (session) {
          callback('SIGNED_IN', session);
        }
        return {
          data: {
            subscription: {
              unsubscribe: () => authListeners.delete(callback)
            }
          }
        };
      },
      async signUp(params: {
        email: string;
        password?: string;
        options?: { data?: Record<string, unknown> };
      }) {
        const email = params.email.trim().toLowerCase();
        const fullName = (params.options?.data?.full_name as string) || email.split('@')[0];
        const ebPosition = (params.options?.data?.eb_position as string) || null;

        const isDefaultAdmin = email.includes('admin') || email === 'ahmedmagdialkik@gmail.com' || email === 'sg@monumentmun.org';
        const role: UserRole = isDefaultAdmin ? 'admin' : (ebPosition ? 'eb' : 'user');

        const profiles = getStorage<Profile[]>('profiles', []);
        let profile = profiles.find((p) => p.email?.toLowerCase() === email);

        if (!profile) {
          profile = {
            id: 'usr_' + Math.random().toString(36).substring(2, 9),
            role,
            full_name: fullName,
            email,
            eb_position: ebPosition,
            created_at: new Date().toISOString()
          };
          profiles.push(profile);
          setStorage('profiles', profiles);
        }

        const user: MockSessionUser = {
          id: profile.id,
          email: profile.email || email,
          user_metadata: {
            full_name: profile.full_name || fullName,
            eb_position: profile.eb_position
          }
        };

        const session: MockSession = {
          access_token: 'mock-token-' + profile.id,
          user
        };

        setStorage('session', session);
        authListeners.forEach((l) => l('SIGNED_IN', session));

        return { data: { user, session }, error: null };
      },
      async signInWithPassword(params: { email: string; password?: string }) {
        const email = params.email.trim().toLowerCase();
        const profiles = getStorage<Profile[]>('profiles', []);
        let profile = profiles.find((p) => p.email?.toLowerCase() === email);

        if (!profile) {
          const isDefaultAdmin = email.includes('admin') || email === 'ahmedmagdialkik@gmail.com' || email === 'sg@monumentmun.org';
          profile = {
            id: 'usr_' + Math.random().toString(36).substring(2, 9),
            role: isDefaultAdmin ? 'admin' : 'user',
            full_name: isDefaultAdmin ? 'Secretariat Admin' : email.split('@')[0],
            email,
            created_at: new Date().toISOString()
          };
          profiles.push(profile);
          setStorage('profiles', profiles);
        }

        const user: MockSessionUser = {
          id: profile.id,
          email: profile.email || email,
          user_metadata: {
            full_name: profile.full_name || email.split('@')[0],
            eb_position: profile.eb_position
          }
        };

        const session: MockSession = {
          access_token: 'mock-token-' + profile.id,
          user
        };

        setStorage('session', session);
        authListeners.forEach((l) => l('SIGNED_IN', session));

        return { data: { user, session }, error: null };
      },
      async signOut() {
        setStorage('session', null);
        authListeners.forEach((l) => l('SIGNED_OUT', null));
        return { error: null };
      },
      async resetPasswordForEmail(_email: string, _options?: Record<string, unknown>) {
        return { data: {}, error: null };
      }
    }
  };
}

let activeClient: SupabaseClient | MockSupabaseClientContract;

if (isConfigured) {
  try {
    activeClient = createClient(rawUrl, rawAnonKey);
  } catch (err) {
    console.warn('[AI Studio] Could not initialize live Supabase client, using mock fallback:', err);
    activeClient = createMockSupabaseClient();
  }
} else {
  console.info('[AI Studio] Supabase credentials not configured in environment. Using in-memory mock client.');
  activeClient = createMockSupabaseClient();
}

// Export as standard SupabaseClient type (compatible contract)
export const supabase = activeClient as unknown as SupabaseClient;
