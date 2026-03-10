import type { SignInWithOAuthCredentials } from "@supabase/supabase-js";
import { useNavigate } from "@tanstack/react-router";
import { useSupabaseAuthAction } from "./use-supabase-auth-action";

export function useSignInWithOAuth(credential: SignInWithOAuthCredentials) {
  const navigate = useNavigate();

  return useSupabaseAuthAction(
    (supabase) => {
      return supabase.auth.signInWithOAuth(credential);
    },
    {
      onSuccess: () => {
        navigate({
          to: "/",
          replace: true,
        });
      },
      onError: (error) => {
        console.error(error);
      },
    },
  );
}
