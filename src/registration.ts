import { supabase } from './lib/supabase';
import type { Registration, RegistrationInput } from './types/database';

export const COMMITTEES = [
  'Security Council (UNSC) · Great Wall of China',
  'Economic and Social Council (ECOSOC) · Petra',
  'UNESCO · The Pyramids of Giza',
  'UNEP · Eiffel Tower',
  'Human Rights Council (UNHRC) · Chichén Itzá',
  'DISEC · Colosseum',
  'UN Women · Taj Mahal'
] as const;

/**
 * Fetch registration for a specific user ID
 */
export async function getUserRegistration(userId: string): Promise<Registration | null> {
  try {
    const { data, error } = await supabase
      .from('registrations')
      .select('id, user_id, full_name, email, phone, school, committee, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching registration:', error.message);
      return null;
    }

    return (data as Registration) || null;
  } catch (err) {
    console.error('Exception fetching registration:', err);
    return null;
  }
}

/**
 * Insert a registration row for the authenticated user
 */
export async function createRegistration(
  userId: string,
  input: RegistrationInput
): Promise<{ registration: Registration | null; error?: string }> {
  try {
    // Check if already registered
    const existing = await getUserRegistration(userId);
    if (existing) {
      return { registration: existing, error: 'You have already submitted a registration.' };
    }

    const { data, error } = await supabase
      .from('registrations')
      .insert({
        user_id: userId,
        full_name: input.full_name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        school: input.school.trim(),
        committee: input.committee,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      return { registration: null, error: error.message };
    }

    return { registration: data as Registration };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to submit registration.';
    return { registration: null, error: message };
  }
}
