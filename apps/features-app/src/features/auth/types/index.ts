import type { Session, User } from "@supabase/supabase-js";

export type { Session, User };

export interface AuthState {
  session: Session | null;
  user: User | null;
  authenticated: boolean;
}
