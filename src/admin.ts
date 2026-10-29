import { supabase } from './lib/supabase';
import type {
  Profile,
  Registration,
  RegistrationStatus,
  StaffAllowlistEntry,
  Team,
  TeamDecision,
  TeamKind,
  UserRole
} from './types/database';

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

    return { data: (data as unknown as Registration[]) || [] };
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
      .select('id, role, full_name, email, eb_position, team_id, team_status, created_at')
      .neq('role', 'user')
      .order('role', { ascending: true });

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data as unknown as Profile[]) || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch staff members.';
    return { data: [], error: message };
  }
}

export interface EbStats {
  total: number;
  approved: number;
  heads: number;
  pending: number;
}

export async function fetchEbProfiles(): Promise<{ data: Profile[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, email, eb_position, team_id, team_status, created_at')
      .not('eb_position', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data as unknown as Profile[]) || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch EB members.';
    return { data: [], error: message };
  }
}

export function computeEbStats(ebMembers: Profile[]): EbStats {
  let approved = 0;
  let heads = 0;
  let pending = 0;

  for (const m of ebMembers) {
    if (m.role === 'head') {
      heads++;
      approved++;
    } else if (m.role === 'eb' || m.role === 'admin' || m.role === 'security') {
      approved++;
    } else if (m.role === 'user') {
      pending++;
    }
  }

  return {
    total: ebMembers.length,
    approved,
    heads,
    pending
  };
}

export async function setUserRoleRpc(
  email: string,
  role: UserRole
): Promise<{ success: boolean; message: string; isError?: boolean }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { success: false, message: 'Please enter a valid email address.', isError: true };
  }

  if (role === 'head') {
    return {
      success: false,
      message: "Role 'head' cannot be set via generic role assignment. Use 'Accept as Head' with a selected team.",
      isError: true
    };
  }

  try {
    const { error } = await supabase.rpc('set_user_role', {
      p_email: cleanEmail,
      p_role: role
    });

    if (error) {
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

// ----------------------------------------------------
// TEAMS & HEAD APIS
// ----------------------------------------------------

export async function fetchAllTeams(): Promise<{ data: Team[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, kind, created_at')
      .order('name', { ascending: true });

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data as unknown as Team[]) || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load teams.';
    return { data: [], error: message };
  }
}

export async function fetchTeamById(teamId: string): Promise<{ data: Team | null; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, kind, created_at')
      .eq('id', teamId)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: (data as unknown as Team) || null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load team.';
    return { data: null, error: message };
  }
}

export async function createTeam(
  name: string,
  kind: TeamKind
): Promise<{ data: Team | null; error?: string }> {
  const cleanName = name.trim();
  if (!cleanName) {
    return { data: null, error: 'Please enter a team name.' };
  }

  try {
    const { data, error } = await supabase
      .from('teams')
      .insert({ name: cleanName, kind })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data as unknown as Team };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create team.';
    return { data: null, error: message };
  }
}

export async function assignHeadRpc(
  email: string,
  teamId: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanTeamId = teamId.trim();

  if (!cleanEmail) {
    return { success: false, error: 'Email address is required.' };
  }
  if (!cleanTeamId) {
    return { success: false, error: 'Please select a team before assigning as Head.' };
  }

  try {
    const { error } = await supabase.rpc('assign_head', {
      p_email: cleanEmail,
      p_team_id: cleanTeamId
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to assign head.';
    return { success: false, error: message };
  }
}

export async function removeHeadRpc(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { success: false, error: 'Email address is required.' };
  }

  try {
    const { error } = await supabase.rpc('remove_head', {
      p_email: cleanEmail
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to remove head.';
    return { success: false, error: message };
  }
}

export async function requestTeamRpc(
  teamId: string
): Promise<{ success: boolean; error?: string }> {
  const cleanTeamId = teamId.trim();
  if (!cleanTeamId) {
    return { success: false, error: 'Please select a team to join.' };
  }

  try {
    const { error } = await supabase.rpc('request_team', {
      p_team_id: cleanTeamId
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to submit team request.';
    return { success: false, error: message };
  }
}

export async function reviewTeamMemberRpc(
  userId: string,
  decision: TeamDecision
): Promise<{ success: boolean; error?: string }> {
  const cleanUserId = userId.trim();
  if (!cleanUserId) {
    return { success: false, error: 'User ID is required.' };
  }

  try {
    const { error } = await supabase.rpc('review_team_member', {
      p_user_id: cleanUserId,
      p_decision: decision
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to review team member.';
    return { success: false, error: message };
  }
}

export async function fetchTeamMembers(
  teamId: string
): Promise<{ data: Profile[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, email, eb_position, team_id, team_status, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data as unknown as Profile[]) || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch team members.';
    return { data: [], error: message };
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

// ----------------------------------------------------
// STAFF ALLOWLIST & EMAIL AUTHORIZATION APIS
// ----------------------------------------------------

export async function isEmailAllowedRpc(email: string): Promise<{ allowed: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { allowed: false, error: 'Email address is required.' };
  }

  try {
    const { data, error } = await supabase.rpc('is_email_allowed', {
      p_email: cleanEmail
    });

    if (error) {
      return { allowed: false, error: error.message };
    }

    return { allowed: Boolean(data) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to verify email authorization.';
    return { allowed: false, error: message };
  }
}

export async function fetchStaffAllowlist(): Promise<{ data: StaffAllowlistEntry[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('staff_allowlist')
      .select('email, full_name, position, app_role, claimed_by, claimed_at')
      .order('email', { ascending: true });

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data as unknown as StaffAllowlistEntry[]) || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load team email list.';
    return { data: [], error: message };
  }
}

export async function addStaffAllowlistEntry(
  fullName: string,
  email: string,
  position: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName.trim();
  const cleanPosition = position.trim();

  if (!cleanName) return { success: false, error: 'Please enter the member\'s full name.' };
  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }
  if (!cleanPosition) return { success: false, error: 'Please enter the member\'s position.' };

  try {
    const { error } = await supabase
      .from('staff_allowlist')
      .insert({
        email: cleanEmail,
        full_name: cleanName,
        position: cleanPosition,
        app_role: 'eb'
      });

    if (error) {
      if (
        error.code === '23505' ||
        error.message.toLowerCase().includes('duplicate') ||
        error.message.toLowerCase().includes('unique')
      ) {
        return { success: false, error: `The email "${cleanEmail}" is already registered on the team list.` };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add member to team list.';
    return { success: false, error: message };
  }
}

export async function removeStaffAllowlistEntry(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { success: false, error: 'Email address is required.' };
  }

  try {
    const { error } = await supabase
      .from('staff_allowlist')
      .delete()
      .eq('email', cleanEmail)
      .is('claimed_by', null);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to remove entry from team list.';
    return { success: false, error: message };
  }
}
