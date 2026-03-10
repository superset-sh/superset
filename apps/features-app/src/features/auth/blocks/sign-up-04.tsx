import { useMemo, useState } from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useTranslation } from "@superbuilder/features-client/core/i18n";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Checkbox } from "@superbuilder/feature-ui/shadcn/checkbox";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Link } from "@tanstack/react-router";
import { EyeIcon, EyeOffIcon, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { useSignUpWithEmailAndPassword } from "../hooks/use-sign-up-with-email-and-password";
import { OAuthButtons } from "../components/oauth-buttons";
import { AuthLayout04 } from "./shared/auth-layout-04";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,16}$/;

type FormValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
};

export function SignUp04() {
  const { t } = useTranslation("auth");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const formSchema = useMemo(
    () =>
      z
        .object({
          firstName: z.string().min(1, {
            message: t("signUpFirstNameRequired"),
          }),
          lastName: z.string().min(1, {
            message: t("signUpLastNameRequired"),
          }),
          email: z.string().email({
            message: t("signUpEmailInvalid"),
          }),
          password: z
            .string()
            .min(1, {
              message: t("signUpPasswordRequired"),
            })
            .regex(PASSWORD_REGEX, {
              message: t("signUpPasswordPolicy"),
            }),
          confirmPassword: z.string().min(1, { message: t("signUpConfirmPasswordRequired") }),
          agreeTerms: z.boolean().refine((val) => val === true, {
            message: "You must agree to the privacy policy & terms",
          }),
        })
        .refine((data) => data.password === data.confirmPassword, {
          path: ["confirmPassword"],
          message: t("signUpConfirmPasswordMismatch"),
        }),
    [t],
  );

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      agreeTerms: false,
    },
  });

  const signUpWithEmailAndPassword = useSignUpWithEmailAndPassword();

  return (
    <AuthLayout04
      title="Create your account"
      description="Lets get started with your 30 days free trial"
      sideTitle="Create your account to get started."
      sideDescription="Your account will allow you to securely save your progress, customize your preferences, and stay connected across all your devices."
    >
      <div className="space-y-4">
        <OAuthButtons disabled={signUpWithEmailAndPassword.loading} />

        <div className="flex items-center gap-4">
          <Separator className="flex-1" />
          <p>Or</p>
          <Separator className="flex-1" />
        </div>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(({ email, password, firstName, lastName }) => {
            signUpWithEmailAndPassword.execute(email, password, {
              firstName,
              lastName,
            });
          })}
        >
          {/* First Name & Last Name */}
          <div className="grid grid-cols-2 gap-4">
            <Controller
              name="firstName"
              control={form.control}
              render={({ field, fieldState }) => (
                <div className="space-y-1">
                  <Label className="leading-5" htmlFor="sign-up-first-name">
                    First Name*
                  </Label>
                  <Input
                    {...field}
                    type="text"
                    id="sign-up-first-name"
                    placeholder={t("signUpFirstNamePlaceholder")}
                    aria-invalid={fieldState.invalid}
                    autoComplete="given-name"
                  />
                  {fieldState.error && (
                    <p className="text-destructive text-sm">{fieldState.error.message}</p>
                  )}
                </div>
              )}
            />
            <Controller
              name="lastName"
              control={form.control}
              render={({ field, fieldState }) => (
                <div className="space-y-1">
                  <Label className="leading-5" htmlFor="sign-up-last-name">
                    Last Name*
                  </Label>
                  <Input
                    {...field}
                    type="text"
                    id="sign-up-last-name"
                    placeholder={t("signUpLastNamePlaceholder")}
                    aria-invalid={fieldState.invalid}
                    autoComplete="family-name"
                  />
                  {fieldState.error && (
                    <p className="text-destructive text-sm">{fieldState.error.message}</p>
                  )}
                </div>
              )}
            />
          </div>

          {/* Email */}
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <div className="space-y-1">
                <Label className="leading-5" htmlFor="sign-up-email">
                  Email address*
                </Label>
                <Input
                  {...field}
                  type="email"
                  id="sign-up-email"
                  placeholder={t("signUpEmailPlaceholder")}
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
                <Label className="leading-5" htmlFor="sign-up-password">
                  Password*
                </Label>
                <div className="relative">
                  <Input
                    {...field}
                    id="sign-up-password"
                    type={isPasswordVisible ? "text" : "password"}
                    placeholder="••••••••••••••••"
                    className="pr-9"
                    aria-invalid={fieldState.invalid}
                    autoComplete="new-password"
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

          {/* Confirm Password */}
          <Controller
            name="confirmPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <div className="w-full space-y-1">
                <Label className="leading-5" htmlFor="sign-up-confirm-password">
                  Confirm Password*
                </Label>
                <div className="relative">
                  <Input
                    {...field}
                    id="sign-up-confirm-password"
                    type={isConfirmPasswordVisible ? "text" : "password"}
                    placeholder="••••••••••••••••"
                    className="pr-9"
                    aria-invalid={fieldState.invalid}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsConfirmPasswordVisible((prev) => !prev)}
                    className="text-muted-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent"
                  >
                    {isConfirmPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
                    <span className="sr-only">
                      {isConfirmPasswordVisible ? "Hide password" : "Show password"}
                    </span>
                  </Button>
                </div>
                {fieldState.error && (
                  <p className="text-destructive text-sm">{fieldState.error.message}</p>
                )}
              </div>
            )}
          />

          {/* Privacy policy */}
          <Controller
            name="agreeTerms"
            control={form.control}
            render={({ field, fieldState }) => (
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="agreeTerms"
                    className="size-6"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="agreeTerms">
                    <span className="text-muted-foreground">I agree to</span>{" "}
                    <a href="#" className="hover:underline">
                      privacy policy & terms
                    </a>
                  </Label>
                </div>
                {fieldState.error && (
                  <p className="text-destructive text-sm">{fieldState.error.message}</p>
                )}
              </div>
            )}
          />

          <Button
            className="w-full"
            type="submit"
            disabled={signUpWithEmailAndPassword.loading}
          >
            {signUpWithEmailAndPassword.loading && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Sign Up
          </Button>
        </form>

        <p className="text-muted-foreground text-center">
          Already have an account?{" "}
          <Link to="/sign-in" className="text-card-foreground hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </AuthLayout04>
  );
}
