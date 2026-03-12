/**
 * Core Auth Store
 *
 * 인증 상태를 관리하는 Jotai atoms
 * 모든 Feature와 App에서 참조 가능
 *
 * Better Auth 기반 (Supabase 제거)
 */
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
  authProvider: string | null;
  role: "owner" | "admin" | "member" | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * Better Auth Session 타입
 */
export interface BetterAuthSession {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
}

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
 * Better Auth Session
 */
const _sessionAtom = atom<BetterAuthSession | null>(null);
export const sessionAtom = atom(
  (get) => get(_sessionAtom),
  (_, set, updates: BetterAuthSession | null | undefined) => {
    set(_sessionAtom, updates ?? null);

    if (updates) {
      set(tokenAtom, updates.token);
      set(authenticatedAtom, true);
    } else {
      set(tokenAtom, null);
      set(authenticatedAtom, false);
    }
  },
);

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
