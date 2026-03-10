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
import { OAuthButtons } from "../components/oauth-buttons";
import { AuthLayout04 } from "./shared/auth-layout-04";

type FormValues = {
  email: string;
  password: string;
};

export function SignIn04() {
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

  return (
    <AuthLayout04
      title={t("signInTitle")}
      description={t("signInDescription")}
      sideTitle="Welcome back! Please sign in to your account"
      sideDescription="Thank you for registering! Please check your inbox and click the verification link to activate your account."
    >
      <div className="space-y-4">
        <OAuthButtons disabled={loading} />

        <div className="flex items-center gap-4">
          <Separator className="flex-1" />
          <p>Or</p>
          <Separator className="flex-1" />
        </div>

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
          Don&apos;t have an account yet?{" "}
          <Link to="/sign-up" className="text-card-foreground hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </AuthLayout04>
  );
}
