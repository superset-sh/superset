import { useMemo } from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useTranslation } from "@superbuilder/features-client/core/i18n";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@superbuilder/feature-ui/shadcn/field";
import { InputGroup, InputGroupInput } from "@superbuilder/feature-ui/shadcn/input-group";
import { Link } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { useAdminSignIn } from "../hooks/use-admin-sign-in";

type FormValues = {
  email: string;
  password: string;
};

export function AdminSignInForm() {
  const { t } = useTranslation("auth");

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

  const { execute: adminSignIn, loading } = useAdminSignIn();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <form
          className="flex flex-col gap-6"
          onSubmit={form.handleSubmit(({ email, password }) => {
            adminSignIn(email, password);
          })}
        >
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
              <ShieldCheck className="h-5 w-5 text-zinc-400" />
            </div>
            <div className="flex flex-col gap-1 text-center">
              <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
                {t("adminSignInTitle")}
              </h1>
              <p className="text-sm text-zinc-500">{t("adminSignInDescription")}</p>
            </div>
          </div>

          <FieldGroup className="flex flex-col gap-4">
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="admin-sign-in-email" className="text-zinc-300">
                    {t("signInEmailLabel")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id="admin-sign-in-email"
                      type="email"
                      aria-invalid={fieldState.invalid}
                      placeholder={t("signInEmailPlaceholder")}
                      autoComplete="email"
                      className="border-zinc-800 bg-zinc-900 text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-700 focus:ring-zinc-700"
                    />
                  </InputGroup>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="admin-sign-in-password" className="text-zinc-300">
                    {t("signInPasswordLabel")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id="admin-sign-in-password"
                      type="password"
                      aria-invalid={fieldState.invalid}
                      placeholder={t("signInPasswordPlaceholder")}
                      autoComplete="current-password"
                      className="border-zinc-800 bg-zinc-900 text-zinc-50 placeholder:text-zinc-600 focus:border-zinc-700 focus:ring-zinc-700"
                    />
                  </InputGroup>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>

          <Button
            type="submit"
            className="w-full bg-zinc-50 text-zinc-900 hover:bg-zinc-200"
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("adminSignInButton")}
          </Button>

          <FieldDescription className="text-center text-sm text-zinc-500">
            <Link to="/" className="text-zinc-400 underline underline-offset-4 hover:text-zinc-300">
              {t("adminSignInBackToSite")}
            </Link>
          </FieldDescription>
        </form>
      </div>
    </div>
  );
}
