import { useTranslation } from "@superbuilder/features-client/core/i18n";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useSupabaseAuthAction } from "./use-supabase-auth-action";

export function useSignInWithEmailAndPassword() {
  const navigate = useNavigate();
  const { t } = useTranslation("auth");

  return useSupabaseAuthAction(
    (supabase, email: string, password: string) => {
      return supabase.auth.signInWithPassword({ email, password });
    },
    {
      onSuccess: () => {
        navigate({
          to: "/",
          replace: true,
        });
        toast.success(t("signInSuccess"));
      },
      onError: (error) => {
        toast.error(t("signInError"));
        console.error(error);
      },
    },
  );
}
