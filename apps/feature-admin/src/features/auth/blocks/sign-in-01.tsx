import { useMemo, useState } from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useTranslation } from "@superbuilder/features-client/core/i18n";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Checkbox } from "@superbuilder/feature-ui/shadcn/checkbox";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Link } from "@tanstack/react-router";
import { EyeIcon, EyeOffIcon, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { useSignInWithEmailAndPassword } from "../hooks/use-sign-in-with-email-and-password";
import { useSignInWithOAuth } from "../hooks/use-sign-in-with-oauth";
import { AuthLayout01 } from "./shared/auth-layout-01";

type FormValues = {
  email: string;
  password: string;
};

export function SignIn01() {
  const { t } = useTranslation("auth");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const formSchema = useMemo(
    () =>
      z.object({
        email: z.string().email({
          message: t("signInEmailInvalid"),
        }),
        password: z.string().min(1, {
          message: t("signInPasswordRequired"),
        }),
      }),
    [t],
  );

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const { execute: signInWithEmailAndPassword, loading } = useSignInWithEmailAndPassword();

  const { execute: signInWithGoogle } = useSignInWithOAuth({
    provider: "google",
    options: {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  return (
    <AuthLayout01 title={t("signInTitle")} description={t("signInDescription")}>
      <div className="space-y-4">
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(({ email, password }) => {
            signInWithEmailAndPassword(email, password);
          })}
        >
          {/* Email */}
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <div className="space-y-1">
                <Label className="leading-5" htmlFor="sign-in-email">
                  {t("signInEmailLabel")}*
                </Label>
                <Input
                  {...field}
                  type="email"
                  id="sign-in-email"
                  placeholder={t("signInEmailPlaceholder")}
                  aria-invalid={fieldState.invalid}
                  autoComplete="email"
                />
                {fieldState.error && (
                  <p className="text-destructive text-sm">{fieldState.error.message}</p>
                )}
              </div>
            )}
          />

          {/* Password */}
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <div className="w-full space-y-1">
                <Label className="leading-5" htmlFor="sign-in-password">
                  {t("signInPasswordLabel")}*
                </Label>
                <div className="relative">
                  <Input
                    {...field}
                    id="sign-in-password"
                    type={isPasswordVisible ? "text" : "password"}
                    placeholder="••••••••••••••••"
                    className="pr-9"
                    aria-invalid={fieldState.invalid}
                    autoComplete="current-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsPasswordVisible((prev) => !prev)}
                    className="text-muted-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent"
                  >
                    {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
                    <span className="sr-only">
                      {isPasswordVisible ? "Hide password" : "Show password"}
                    </span>
                  </Button>
                </div>
                {fieldState.error && (
                  <p className="text-destructive text-sm">{fieldState.error.message}</p>
                )}
              </div>
            )}
          />

          {/* Remember Me and Forgot Password */}
          <div className="flex items-center justify-between gap-y-2">
            <div className="flex items-center gap-3">
              <Checkbox id="rememberMe" className="size-6" />
              <Label htmlFor="rememberMe" className="text-muted-foreground">
                Remember Me
              </Label>
            </div>

            <Link
              className="text-sm hover:underline"
              to={"/forgot-password" as string}
            >
              {t("signInForgotPassword")}
            </Link>
          </div>

          <Button className="w-full" type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("signInButton")}
          </Button>
        </form>

        <p className="text-muted-foreground text-center">
          {t("signInNoAccount")}{" "}
          <Link to="/sign-up" className="text-card-foreground hover:underline">
            {t("signInSignUpLink")}
          </Link>
        </p>

        <div className="flex items-center gap-4">
          <Separator className="flex-1" />
          <p>{t("signInOrContinueWith")}</p>
          <Separator className="flex-1" />
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={signInWithGoogle}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </Button>
      </div>
    </AuthLayout01>
  );
}
