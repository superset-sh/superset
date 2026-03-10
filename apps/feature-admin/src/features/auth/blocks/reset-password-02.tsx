import { useState } from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthLayout02 } from "./shared/auth-layout-02";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,16}$/;

interface ResetPassword02Props {
  email: string;
  messages: {
    passwordRequired: string;
    passwordPolicy: string;
    confirmPasswordRequired: string;
    confirmPasswordMismatch: string;
    passwordPlaceholder: string;
    confirmPasswordPlaceholder: string;
  };
  onSubmit: (password: string) => void | Promise<void>;
  loading?: boolean;
}

export function ResetPassword02({
  email,
  messages,
  onSubmit,
  loading = false,
}: ResetPassword02Props) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const formSchema = z
    .object({
      password: z
        .string()
        .min(1, {
          message: messages.passwordRequired,
        })
        .regex(PASSWORD_REGEX, {
          message: messages.passwordPolicy,
        }),
      confirmPassword: z.string().min(1, {
        message: messages.confirmPasswordRequired,
      }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      path: ["confirmPassword"],
      message: messages.confirmPasswordMismatch,
    });

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const handleSubmit = form.handleSubmit(async ({ password }) => {
    await onSubmit(password);
  });

  return (
    <AuthLayout02
      title="Reset Password"
      description={`Enter your new password for ${email}`}
    >
      <div className="space-y-4">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="w-full space-y-1">
            <Label className="leading-5" htmlFor="reset-password">
              New Password*
            </Label>
            <div className="relative">
              <Input
                id="reset-password"
                type={isPasswordVisible ? "text" : "password"}
                placeholder={messages.passwordPlaceholder}
                className="pr-9"
                aria-invalid={!!form.formState.errors.password}
                autoComplete="new-password"
                {...form.register("password")}
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
            {form.formState.errors.password && (
              <p className="text-destructive text-sm">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          <div className="w-full space-y-1">
            <Label className="leading-5" htmlFor="reset-confirm-password">
              Confirm Password*
            </Label>
            <div className="relative">
              <Input
                id="reset-confirm-password"
                type={isConfirmPasswordVisible ? "text" : "password"}
                placeholder={messages.confirmPasswordPlaceholder}
                className="pr-9"
                aria-invalid={!!form.formState.errors.confirmPassword}
                autoComplete="new-password"
                {...form.register("confirmPassword")}
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
            {form.formState.errors.confirmPassword && (
              <p className="text-destructive text-sm">
                {form.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Resetting..." : "Set New Password"}
          </Button>
        </form>

        <Link
          to={"/sign-in" as string}
          className="group mx-auto flex w-fit items-center gap-2"
        >
          <ChevronLeftIcon className="size-5 transition-transform duration-200 group-hover:-translate-x-0.5" />
          <span>Back to login</span>
        </Link>
      </div>
    </AuthLayout02>
  );
}
