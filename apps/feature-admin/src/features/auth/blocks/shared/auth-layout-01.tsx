import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import AuthBackgroundShape from "./auth-background-shape";

interface AuthLayout01Props {
  title: string;
  description: string;
  children: ReactNode;
  maxWidth?: "sm:max-w-md" | "sm:max-w-lg";
}

export function AuthLayout01({
  title,
  description,
  children,
  maxWidth = "sm:max-w-lg",
}: AuthLayout01Props) {
  return (
    <div className="relative flex h-auto min-h-screen items-center justify-center overflow-x-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="absolute">
        <AuthBackgroundShape />
      </div>

      <Card className={`z-1 w-full border-none shadow-md ${maxWidth}`}>
        <CardHeader className="gap-6">
          <div>
            <CardTitle className="mb-1.5 text-2xl">{title}</CardTitle>
            <CardDescription className="text-base">{description}</CardDescription>
          </div>
        </CardHeader>

        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
