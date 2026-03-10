import type React from "react";
import { authConfig, type AuthUiVariant } from "../config";
import { ForgotPassword01 } from "../blocks/forgot-password-01";
import { ForgotPassword02 } from "../blocks/forgot-password-02";
import { ForgotPassword03 } from "../blocks/forgot-password-03";
import { ForgotPassword04 } from "../blocks/forgot-password-04";
import { ForgotPassword05 } from "../blocks/forgot-password-05";

export interface ForgotPasswordFormProps {
  messages: {
    emailInvalid: string;
    emailPlaceholder: string;
  };
  onSubmit: (email: string) => void | Promise<void>;
  loading?: boolean;
}

const variantMap: Partial<Record<AuthUiVariant, React.ComponentType<ForgotPasswordFormProps>>> = {
  1: ForgotPassword01,
  2: ForgotPassword02,
  3: ForgotPassword03,
  4: ForgotPassword04,
  5: ForgotPassword05,
};

export function ForgotPasswordForm(props: ForgotPasswordFormProps) {
  const Component = variantMap[authConfig.uiVariant] ?? ForgotPassword01;
  return <Component {...props} />;
}
