import { supabase } from './lib/supabase';
import type { Profile, UserRole } from './types/database';

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  profile: Profile | null;
}

type AuthCallback = (user: CurrentUser | null, loading: boolean) => void;
const listeners = new Set<AuthCallback>();

let currentUserState: CurrentUser | null = null;
let isAuthLoading = true;

export function getCachedUser(): CurrentUser | null {
  return currentUserState;
}

export function isAuthReady(): boolean {
  return !isAuthLoading;
}

export function subscribeAuth(callback: AuthCallback): () => void {
  listeners.add(callback);
  callback(currentUserState, isAuthLoading);
  return () => {
    listeners.delete(callback);
  };
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(currentUserState, isAuthLoading);
    } catch (err) {
      console.error('Error in auth listener:', err);
    }
  }
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, email, eb_position, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Could not load profile from profiles table:', error.message);
      return null;
    }
    return (data as Profile) || null;
  } catch (err) {
    console.error('Exception fetching profile:', err);
    return null;
  }
}

async function syncUserState(sessionUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null) {
  if (!sessionUser || !sessionUser.email) {
    currentUserState = null;
    isAuthLoading = false;
    notifyListeners();
    return;
  }

  const profile = await fetchProfile(sessionUser.id);
  const role: UserRole = (profile?.role as UserRole) || 'user';
  const fullName =
    (profile?.full_name as string) ||
    (sessionUser.user_metadata?.full_name as string) ||
    (sessionUser.email.split('@')[0]) ||
    'Delegate';

  currentUserState = {
    id: sessionUser.id,
    email: sessionUser.email,
    fullName,
    role,
    profile
  };

  isAuthLoading = false;
  notifyListeners();
}

/**
 * Instant sign up with email and password without confirmation step.
 * Automatically logs the user in immediately.
 */
export async function signUpWithEmail(
  fullName: string,
  email: string,
  password: string,
  ebPosition?: string
): Promise<{ user: CurrentUser | null; error?: string }> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    const cleanPosition = ebPosition?.trim() || null;

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName,
          ...(cleanPosition ? { eb_position: cleanPosition } : {})
        }
      }
    });

    if (signUpError) {
      return { user: null, error: signUpError.message };
    }

    const userId = signUpData.session?.user?.id || signUpData.user?.id;

    // If session is already returned, immediately sync
    if (signUpData.session?.user) {
      if (cleanPosition && userId) {
        try {
          await supabase.from('profiles').update({ eb_position: cleanPosition }).eq('id', userId);
        } catch {}
      }
      await syncUserState(signUpData.session.user);
      return { user: currentUserState };
    }

    // If session was not returned in signUp response, sign in immediately with password
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });

    if (signInError) {
      if (signUpData.user) {
        if (cleanPosition && userId) {
          try {
            await supabase.from('profiles').update({ eb_position: cleanPosition }).eq('id', userId);
          } catch {}
        }
        await syncUserState(signUpData.user);
        return { user: currentUserState };
      }
      return { user: null, error: signInError.message };
    }

    if (signInData.user) {
      if (cleanPosition && signInData.user.id) {
        try {
          await supabase.from('profiles').update({ eb_position: cleanPosition }).eq('id', signInData.user.id);
        } catch {}
      }
      await syncUserState(signInData.user);
      return { user: currentUserState };
    }

    return { user: null, error: 'Sign up succeeded but session could not be established.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred during sign up.';
    return { user: null, error: message };
  }
}

/**
 * Log in with email and password
 */
export async function signInWithEmail(email: string, password: string): Promise<{ user: CurrentUser | null; error?: string }> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (data.user) {
      await syncUserState(data.user);
      return { user: currentUserState };
    }

    return { user: null, error: 'No user data received.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred during sign in.';
    return { user: null, error: message };
  }
}

/**
 * Sign out
 */
export async function signOut(): Promise<{ error?: string }> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error: error.message };
    }
    currentUserState = null;
    notifyListeners();
    return {};
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sign out failed.';
    return { error: message };
  }
}

// Initial session check
(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) {
      await syncUserState(data.session.user);
    } else {
      currentUserState = null;
      isAuthLoading = false;
      notifyListeners();
    }
  } catch (e) {
    console.warn('Initial session check error:', e);
    currentUserState = null;
    isAuthLoading = false;
    notifyListeners();
  }
})();

// Real-time auth listener
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    await syncUserState(session.user);
  } else {
    currentUserState = null;
    isAuthLoading = false;
    notifyListeners();
  }
});
