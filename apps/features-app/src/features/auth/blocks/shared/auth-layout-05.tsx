import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import AuthLines from "./auth-lines";

interface AuthLayout05Props {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthLayout05({ title, description, children }: AuthLayout05Props) {
  return (
    <div className="bg-muted flex h-auto min-h-screen items-center justify-center px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
      <Card className="relative w-full max-w-md overflow-hidden border-none pt-12 shadow-lg">
        <div className="to-primary/10 pointer-events-none absolute top-0 h-52 w-full rounded-t-xl bg-gradient-to-t from-transparent" />
        <AuthLines className="pointer-events-none absolute inset-x-0 top-0" />

        <CardHeader className="justify-center gap-6 text-center">
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
