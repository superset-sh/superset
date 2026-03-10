import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { isNil } from "es-toolkit/compat";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const TOKEN_STORAGE_KEY = "_token";

/**
 * Profile 타입 (packages/core/schema/profiles.ts와 동일)
 */
export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: "owner" | "admin" | "editor" | "guest" | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * Supabase 클라이언트를 저장하는 atom
 * 프로젝트에서 초기화 시 설정해야 함
 *
 * @example
 * ```tsx
 * // app/store.ts
 * import { supabaseAtom } from '@/shared/store/auth';
 * import { createClient } from '@supabase/supabase-js';
 *
 * const supabase = createClient(
 *   import.meta.env.VITE_SUPABASE_URL,
 *   import.meta.env.VITE_SUPABASE_ANON_KEY,
 * );
 *
 * // Provider에서 초기값 설정
 * <Provider initialValues={[[supabaseAtom, supabase]]}>
 *   <App />
 * </Provider>
 * ```
 */
export const supabaseAtom = atom<SupabaseClient | null>(null);

export const tokenAtom = atomWithStorage<string | null>(TOKEN_STORAGE_KEY, null);

export const authenticatedAtom = atom<boolean | null>(null);

const _sessionAtom = atom<Session | null>(null);
export const sessionAtom = atom(
  (get) => get(_sessionAtom),
  (_, set, updates: Session | null | undefined) => {
    set(_sessionAtom, updates ?? null);

    if (updates) {
      set(tokenAtom, updates.access_token);
      set(authenticatedAtom, true);
    } else {
      set(tokenAtom, null);
      set(authenticatedAtom, false);
    }
  },
);

export const currentSessionAtom = atom((get) => {
  const session = get(sessionAtom);
  if (isNil(session)) {
    throw new Error("현재 세션을 찾을 수 없습니다.");
  }
  return session;
});

/**
 * Supabase 클라이언트를 가져오는 atom (null 체크 포함)
 */
export const getSupabaseAtom = atom((get) => {
  const supabase = get(supabaseAtom);
  if (isNil(supabase)) {
    throw new Error("Supabase 클라이언트가 초기화되지 않았습니다.");
  }
  return supabase;
});

/**
 * 현재 사용자의 Profile을 저장하는 atom
 */
export const profileAtom = atom<Profile | null>(null);

/**
 * 현재 사용자의 role을 가져오는 atom
 */
export const userRoleAtom = atom((get) => {
  const profile = get(profileAtom);
  return profile?.role ?? null;
});
