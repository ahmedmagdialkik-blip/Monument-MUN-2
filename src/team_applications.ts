import { supabase } from './lib/supabase';
import type { TeamApplication, TeamAppRole, TeamAppStatus } from './types/database';
import type { CurrentUser } from './auth';

export interface QuestionDef {
  id: string;
  label: string;
  sublabel?: string;
  type: 'text' | 'textarea' | 'select';
  options?: string[];
  placeholder?: string;
  required: boolean;
}

/**
 * Question definitions for Volunteer applications
 */
export const VOLUNTEER_QUESTIONS: QuestionDef[] = [
  {
    id: 'q_why',
    label: 'Why do you want to volunteer for Monument MUN 2027?',
    sublabel: 'Share your motivation for supporting our international assembly.',
    type: 'textarea',
    placeholder: 'Tell us why you want to be part of the volunteer team...',
    required: true
  },
  {
    id: 'q_department_interest',
    label: 'Preferred Volunteer Area',
    sublabel: 'Select the operational area where your strengths lie.',
    type: 'select',
    options: [
      'Delegate Reception & Hospitality',
      'Logistics & Venue Coordination',
      'Ceremonies & Stage Management',
      'Media, Photography & Social Coverage',
      'General Conference Support'
    ],
    required: true
  },
  {
    id: 'q_experience',
    label: 'Past Experience in MUN or Large Events',
    sublabel: 'List any MUN conferences, school events, or community volunteering.',
    type: 'textarea',
    placeholder: 'e.g. Logistics volunteer at previous conference, student council organizer...',
    required: true
  },
  {
    id: 'q_availability',
    label: 'Full Availability Confirmation',
    sublabel: 'Are you available for mandatory staff training walkthroughs and all conference debate days?',
    type: 'select',
    options: [
      'Yes, 100% available for all training and conference days',
      'Available with minor scheduling restrictions (please explain in notes)'
    ],
    required: true
  },
  {
    id: 'q_languages_skills',
    label: 'Languages & Relevant Skills',
    sublabel: 'Mention languages spoken, first aid, AV/tech skills, photography, etc.',
    type: 'text',
    placeholder: 'e.g. Fluent Arabic & English, certified First Aid, photography experience',
    required: true
  }
];

/**
 * Question definitions for Security applications
 */
export const SECURITY_QUESTIONS: QuestionDef[] = [
  {
    id: 'q_why',
    label: 'Why are you applying for the Monument MUN Security Team?',
    sublabel: 'Our security team ensures safety, protocol integrity, and seamless venue control.',
    type: 'textarea',
    placeholder: 'Explain why you are qualified to safeguard the conference and its delegates...',
    required: true
  },
  {
    id: 'q_experience',
    label: 'Experience with Event Safety, Crowd Control or Access Checkpoints',
    sublabel: 'Prior security, marshal, or hall monitoring roles.',
    type: 'textarea',
    placeholder: 'Describe your background in security, access control, or emergency protocols...',
    required: true
  },
  {
    id: 'q_scenario_unauthorized',
    label: 'Scenario: Unauthorized Entry Attempt',
    sublabel: 'An unregistered visitor or person without a delegate pass demands entry into a closed council room. How do you respond?',
    type: 'textarea',
    placeholder: 'Explain your exact steps to de-escalate, verify credentials, and uphold security protocol...',
    required: true
  },
  {
    id: 'q_composure',
    label: 'Physical Presence, Discipline & Composure',
    sublabel: 'Can you stand for extended periods, remain calm under stress, and be firm yet respectful with delegates?',
    type: 'select',
    options: [
      'Yes, fully able to maintain discipline, composure, and standing presence',
      'No, I have physical limitations (please specify)'
    ],
    required: true
  },
  {
    id: 'q_availability',
    label: 'Full Availability for Security Walkthroughs & Shifts',
    sublabel: 'Security staff must arrive early for venue sweeps and stay through evening dismissals.',
    type: 'select',
    options: [
      'Yes, I confirm full readiness for early morning walkthroughs and all session shifts',
      'Partial availability only'
    ],
    required: true
  }
];

export interface OtherTeamInfo {
  name: string;
  description: string;
  status: 'Closed for now';
}

export const OTHER_TEAMS: OtherTeamInfo[] = [
  {
    name: 'Logistics & Operations',
    description: 'Conference venues, supplies, signage, and transit.',
    status: 'Closed for now'
  },
  {
    name: 'Media & Public Relations',
    description: 'Press releases, conference media, and journalism.',
    status: 'Closed for now'
  },
  {
    name: 'Crisis & Substantive',
    description: 'Directing crisis backroom simulations and directives.',
    status: 'Closed for now'
  },
  {
    name: 'Finance & Sponsorship',
    description: 'Budgeting, patron partnerships, and fiscal oversight.',
    status: 'Closed for now'
  },
  {
    name: 'Delegate Affairs',
    description: 'Registration credentials, country matrix, and delegates.',
    status: 'Closed for now'
  },
  {
    name: 'Committee Chairs & Dais',
    description: 'Presiding officers and substantive debate moderators.',
    status: 'Closed for now'
  }
];

export interface SubmitTeamAppInput {
  team: TeamAppRole;
  full_name: string;
  email: string;
  phone: string;
  answers: Record<string, string>;
}

export function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

/**
 * Submit a new team application (Volunteer or Security only)
 * Enforces email validation, required answers, and prevents duplicate submissions
 */
export async function submitTeamApplication(
  input: SubmitTeamAppInput
): Promise<{ data: TeamApplication | null; error: string | null }> {
  const fullName = input.full_name?.trim();
  const cleanEmail = input.email?.trim().toLowerCase();
  const phone = input.phone?.trim();
  const team = input.team;

  if (!fullName) {
    return { data: null, error: 'Please enter your full name.' };
  }
  if (!cleanEmail || !isValidEmail(cleanEmail)) {
    return { data: null, error: 'Please enter a valid email address.' };
  }
  if (!phone || phone.length < 6) {
    return { data: null, error: 'Please enter a valid phone number.' };
  }
  if (team !== 'volunteer' && team !== 'security') {
    return { data: null, error: 'Only Volunteer and Security applications are currently open.' };
  }

  // Validate questions
  const questionDefs = team === 'volunteer' ? VOLUNTEER_QUESTIONS : SECURITY_QUESTIONS;
  for (const q of questionDefs) {
    if (q.required) {
      const val = input.answers?.[q.id]?.trim();
      if (!val) {
        return { data: null, error: `Please answer: "${q.label}"` };
      }
    }
  }

  // Check for duplicate applications for the same team from this email
  try {
    const { data: existing, error: checkError } = await supabase
      .from('team_applications')
      .select('id, status, created_at')
      .eq('email', cleanEmail)
      .eq('team', team);

    if (checkError) {
      console.warn('Error checking existing team application:', checkError);
    } else if (existing && (existing as unknown as TeamApplication[]).length > 0) {
      const teamLabel = team === 'volunteer' ? 'Volunteer' : 'Security';
      return {
        data: null,
        error: `An application for the ${teamLabel} team has already been submitted with this email (${cleanEmail}). Duplicate submissions for the same team are not permitted.`
      };
    }
  } catch (err) {
    console.warn('Duplicate check caught exception:', err);
  }

  // Insert application with status forced to 'pending'
  try {
    const payload = {
      team,
      full_name: fullName,
      email: cleanEmail,
      phone,
      answers: input.answers || {},
      status: 'pending' as TeamAppStatus,
      created_at: new Date().toISOString(),
      email_sent: false
    };

    const res = await supabase.from('team_applications').insert(payload);
    if (res && 'error' in res && res.error) {
      return { data: null, error: (res.error as { message: string }).message || 'Failed to submit application' };
    }

    return {
      data: {
        id: 'app_' + Math.random().toString(36).substring(2, 9),
        ...payload
      },
      error: null
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred while saving your application.'
    };
  }
}

/**
 * Fetch all team applications (Staff/Admin only)
 */
export async function fetchTeamApplications(): Promise<{ data: TeamApplication[]; error: string | null }> {
  try {
    const res = await supabase
      .from('team_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if ('error' in res && res.error) {
      return { data: [], error: (res.error as { message: string }).message };
    }

    const list = (res.data || []) as unknown as TeamApplication[];
    return { data: list, error: null };
  } catch (err) {
    return {
      data: [],
      error: err instanceof Error ? err.message : 'Could not load team applications'
    };
  }
}

/**
 * Trigger acceptance email via Supabase Edge Function 'send-team-acceptance'
 * Uses Resend on the server side (never exposes Resend key on client)
 */
export async function sendAcceptanceEmail(
  app: TeamApplication,
  _staffUser?: CurrentUser
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-team-acceptance', {
      body: {
        applicationId: app.id,
        recipientEmail: app.email,
        recipientName: app.full_name,
        team: app.team
      }
    });

    if (error) {
      const errMsg = typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
      // Record email failure on the application row
      await supabase
        .from('team_applications')
        .update({ email_sent: false, email_error: errMsg })
        .eq('id', app.id);

      return { success: false, error: errMsg };
    }

    // Record email success on the application row
    await supabase
      .from('team_applications')
      .update({
        email_sent: true,
        email_sent_at: new Date().toISOString(),
        email_error: null
      })
      .eq('id', app.id);

    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Edge Function call failed';
    await supabase
      .from('team_applications')
      .update({ email_sent: false, email_error: errMsg })
      .eq('id', app.id);

    return { success: false, error: errMsg };
  }
}

/**
 * Review a team application (Accept or Deny)
 * Requires staff confirmation before calling.
 * Records reviewed_by and reviewed_at.
 * If accepted, automatically sends the acceptance email via the Supabase Edge Function.
 */
export async function reviewTeamApplication(
  app: TeamApplication,
  decision: 'accepted' | 'denied' | 'pending',
  staffUser: CurrentUser
): Promise<{ data: TeamApplication | null; error: string | null; emailStatus?: { success: boolean; error?: string } }> {
  try {
    const nowIso = new Date().toISOString();
    const updatePayload: Partial<TeamApplication> = {
      status: decision,
      reviewed_by: staffUser.id || staffUser.email,
      reviewed_at: nowIso
    };

    const updateRes = await supabase
      .from('team_applications')
      .update(updatePayload)
      .eq('id', app.id);

    if ('error' in updateRes && updateRes.error) {
      return {
        data: null,
        error: (updateRes.error as { message: string }).message || 'Failed to update application decision'
      };
    }

    const updatedApp: TeamApplication = {
      ...app,
      ...updatePayload
    };

    // If decision is accepted, send automatic acceptance email
    let emailStatus: { success: boolean; error?: string } | undefined;
    if (decision === 'accepted') {
      emailStatus = await sendAcceptanceEmail(updatedApp, staffUser);
      if (emailStatus.success) {
        updatedApp.email_sent = true;
        updatedApp.email_sent_at = nowIso;
        updatedApp.email_error = null;
      } else {
        updatedApp.email_sent = false;
        updatedApp.email_error = emailStatus.error;
      }
    }

    return { data: updatedApp, error: null, emailStatus };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Error reviewing team application'
    };
  }
}
