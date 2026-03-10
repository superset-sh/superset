/**
 * Core Auth Store
 *
 * 인증 상태를 관리하는 Jotai atoms
 * 모든 Feature와 App에서 참조 가능
 */
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { isNil } from "es-toolkit/compat";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const TOKEN_STORAGE_KEY = "_token";

/**
 * Profile 타입
 */
export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  authProvider: "email" | "google" | "naver" | "kakao" | null;
  role: "owner" | "admin" | "editor" | "guest" | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * Supabase 클라이언트를 저장하는 atom
 * App 초기화 시 설정 필요
 *
 * @example
 * ```tsx
 * import { supabaseAtom } from '@/core/auth';
 *
 * <Provider initialValues={[[supabaseAtom, supabase]]}>
 *   <App />
 * </Provider>
 * ```
 */
export const supabaseAtom = atom<SupabaseClient | null>(null);

/**
 * Access Token (로컬스토리지 동기화)
 */
export const tokenAtom = atomWithStorage<string | null>(TOKEN_STORAGE_KEY, null);

/**
 * 인증 상태
 * - null: 로딩 중
 * - true: 인증됨
 * - false: 미인증
 */
export const authenticatedAtom = atom<boolean | null>(null);

/**
 * Supabase Session
 */
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

/**
 * 현재 세션 (null이면 에러 throw)
 */
export const currentSessionAtom = atom((get) => {
  const session = get(sessionAtom);
  if (isNil(session)) {
    throw new Error("현재 세션을 찾을 수 없습니다.");
  }
  return session;
});

/**
 * Supabase 클라이언트 (null이면 에러 throw)
 */
export const getSupabaseAtom = atom((get) => {
  const supabase = get(supabaseAtom);
  if (isNil(supabase)) {
    throw new Error("Supabase 클라이언트가 초기화되지 않았습니다.");
  }
  return supabase;
});

/**
 * 현재 사용자 Profile
 */
export const profileAtom = atom<Profile | null>(null);

/**
 * 현재 사용자 Role (유도 상태)
 */
export const userRoleAtom = atom((get) => {
  const profile = get(profileAtom);
  return profile?.role ?? null;
});
