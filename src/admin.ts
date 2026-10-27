import { supabase } from './lib/supabase';
import type { Registration, RegistrationStatus, Profile, UserRole } from './types/database';

export interface AdminStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export async function fetchAllRegistrations(): Promise<{ data: Registration[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('registrations')
      .select('id, user_id, full_name, email, phone, school, committee, status, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data as Registration[]) || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch registrations.';
    return { data: [], error: message };
  }
}

export async function updateRegistrationStatus(
  registrationId: string | number,
  newStatus: RegistrationStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('registrations')
      .update({ status: newStatus })
      .eq('id', registrationId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update status.';
    return { success: false, error: message };
  }
}

export async function fetchStaffProfiles(): Promise<{ data: Profile[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, email, created_at')
      .neq('role', 'user')
      .order('role', { ascending: true });

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data as Profile[]) || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch staff members.';
    return { data: [], error: message };
  }
}

export async function setUserRoleRpc(
  email: string,
  role: UserRole
): Promise<{ success: boolean; message: string; isError?: boolean }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { success: false, message: 'Please enter a valid email address.', isError: true };
  }

  try {
    const { error } = await supabase.rpc('set_user_role', {
      p_email: cleanEmail,
      p_role: role
    });

    if (error) {
      // Check if error message suggests user does not exist
      const errStr = error.message.toLowerCase();
      if (
        errStr.includes('not found') ||
        errStr.includes('does not exist') ||
        errStr.includes('no profile') ||
        errStr.includes('violates foreign key') ||
        errStr.includes('null value')
      ) {
        return {
          success: false,
          message: `That person must sign up first before assigning a staff role. No account exists for ${cleanEmail}.`,
          isError: true
        };
      }
      return { success: false, message: error.message, isError: true };
    }

    return {
      success: true,
      message: `Successfully set ${cleanEmail} to role "${role}".`,
      isError: false
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'RPC call failed';
    return {
      success: false,
      message: msg.toLowerCase().includes('not found')
        ? `That person must sign up first before assigning a staff role. No account exists for ${cleanEmail}.`
        : msg,
      isError: true
    };
  }
}

export function computeAdminStats(registrations: Registration[]): AdminStats {
  const stats: AdminStats = {
    total: registrations.length,
    pending: 0,
    approved: 0,
    rejected: 0
  };

  for (const reg of registrations) {
    if (reg.status === 'pending') stats.pending++;
    else if (reg.status === 'approved') stats.approved++;
    else if (reg.status === 'rejected') stats.rejected++;
  }

  return stats;
}
