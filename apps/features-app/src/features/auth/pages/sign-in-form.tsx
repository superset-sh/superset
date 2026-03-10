import type React from "react";
import { authConfig, type AuthUiVariant } from "../config";
import { SignIn01 } from "../blocks/sign-in-01";
import { SignIn02 } from "../blocks/sign-in-02";
import { SignIn03 } from "../blocks/sign-in-03";
import { SignIn04 } from "../blocks/sign-in-04";
import { SignIn05 } from "../blocks/sign-in-05";

const variantMap: Partial<Record<AuthUiVariant, React.ComponentType>> = {
  1: SignIn01,
  2: SignIn02,
  3: SignIn03,
  4: SignIn04,
  5: SignIn05,
};

export function SignInForm() {
  const Component = variantMap[authConfig.uiVariant] ?? SignIn01;
  return <Component />;
}
