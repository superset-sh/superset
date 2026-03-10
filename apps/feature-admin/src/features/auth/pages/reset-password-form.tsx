import type React from "react";
import { authConfig, type AuthUiVariant } from "../config";
import { ResetPassword01 } from "../blocks/reset-password-01";
import { ResetPassword02 } from "../blocks/reset-password-02";
import { ResetPassword03 } from "../blocks/reset-password-03";
import { ResetPassword04 } from "../blocks/reset-password-04";
import { ResetPassword05 } from "../blocks/reset-password-05";

export interface ResetPasswordFormProps {
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

const variantMap: Partial<Record<AuthUiVariant, React.ComponentType<ResetPasswordFormProps>>> = {
  1: ResetPassword01,
  2: ResetPassword02,
  3: ResetPassword03,
  4: ResetPassword04,
  5: ResetPassword05,
};

export function ResetPasswordForm(props: ResetPasswordFormProps) {
  const Component = variantMap[authConfig.uiVariant] ?? ResetPassword01;
  return <Component {...props} />;
}
