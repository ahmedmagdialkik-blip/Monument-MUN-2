export type UserRole = 'user' | 'eb' | 'security' | 'head' | 'admin';

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';
export type TeamStatus = 'pending' | 'approved' | 'rejected' | null;
export type TeamKind = 'committee' | 'department';
export type TeamDecision = 'approved' | 'rejected' | 'removed';

export interface Team {
  id: string;
  name: string;
  kind: TeamKind;
  created_at?: string;
  head_name?: string | null;
  head_email?: string | null;
  approved_count?: number;
  pending_count?: number;
}

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
  eb_position?: string | null;
  team_id?: string | null;
  team_status?: TeamStatus;
  created_at?: string;
}

export interface Registration {
  id: string | number;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  school: string;
  committee: string;
  status: RegistrationStatus;
  created_at?: string;
}

export interface RegistrationInput {
  full_name: string;
  email: string;
  phone: string;
  school: string;
  committee: string;
}

export interface AuthState {
  user: {
    id: string;
    email?: string;
    user_metadata?: {
      full_name?: string;
      eb_position?: string;
      [key: string]: unknown;
    };
  } | null;
  profile: Profile | null;
  loading: boolean;
}
