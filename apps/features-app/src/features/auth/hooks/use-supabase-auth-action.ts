import { getSupabaseAtom, sessionAtom } from "@superbuilder/features-client/core/auth";
import { useAsync } from "@superbuilder/features-client/shared/hooks";
import type { AuthError, Session, SupabaseClient } from "@supabase/supabase-js";
import { useAtomValue, useSetAtom } from "jotai";

interface AuthActionOptions<TData extends AuthResponse["data"]> {
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
}

type AuthResponse = { data: unknown; error: AuthError | null };

export function useSupabaseAuthAction<TArgs extends unknown[], TResponse extends AuthResponse>(
  action: (supabase: SupabaseClient, ...args: TArgs) => Promise<TResponse>,
  options: AuthActionOptions<TResponse["data"]> = {},
) {
  const supabase = useAtomValue(getSupabaseAtom);
  const setSession = useSetAtom(sessionAtom);

  const result = useAsync(async (...args: TArgs) => {
    const { data, error } = await action(supabase, ...args);
    if (error) {
      throw error;
    }
    // onAuthStateChange가 비동기 fire되므로, 로그인 성공 시 수동으로 세션 설정
    const session = (data as { session?: Session | null })?.session;
    if (session) {
      setSession(session);
    }
    return data;
  }, options);

  return result;
}
