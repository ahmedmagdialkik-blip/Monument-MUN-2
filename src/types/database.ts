export type UserRole = 'user' | 'eb' | 'security' | 'admin';

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
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
      [key: string]: unknown;
    };
  } | null;
  profile: Profile | null;
  loading: boolean;
}
