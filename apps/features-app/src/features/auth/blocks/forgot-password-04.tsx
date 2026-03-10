import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthLayout04 } from "./shared/auth-layout-04";

interface ForgotPassword04Props {
  messages: {
    emailInvalid: string;
    emailPlaceholder: string;
  };
  onSubmit: (email: string) => void | Promise<void>;
  loading?: boolean;
}

export function ForgotPassword04({ messages, onSubmit, loading = false }: ForgotPassword04Props) {
  const formSchema = z.object({
    email: z.string().email({
      message: messages.emailInvalid,
    }),
  });

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
    },
  });

  const handleSubmit = form.handleSubmit(async ({ email }) => {
    await onSubmit(email);
  });

  return (
    <AuthLayout04
      title="Forgot Password?"
      description="No worries, we'll send you reset instructions."
      sideTitle="Don't worry it happens! Resetting your password is quick and easy."
      sideDescription="Just enter your registered email address below, and we'll send you a secure link to reset your password."
    >
      <div className="space-y-4">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <Label className="leading-5" htmlFor="forgot-password-email">
              Email address*
            </Label>
            <Input
              type="email"
              id="forgot-password-email"
              placeholder={messages.emailPlaceholder}
              aria-invalid={!!form.formState.errors.email}
              autoComplete="email"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-destructive text-sm">{form.formState.errors.email.message}</p>
            )}
          </div>

          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send Reset Link"}
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
    </AuthLayout04>
  );
}
