import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";

interface AuthLayout03Props {
  title: string;
  description: string;
  sideTitle: string;
  sideDescription: string;
  children: ReactNode;
}

export function AuthLayout03({
  title,
  description,
  sideTitle,
  sideDescription,
  children,
}: AuthLayout03Props) {
  return (
    <div className="h-dvh lg:grid lg:grid-cols-2">
      <div className="flex h-full items-center justify-center space-y-6 sm:px-6 md:px-8">
        <div className="flex w-full flex-col gap-6 p-6 sm:max-w-lg">
          <div>
            <h2 className="mb-1.5 text-2xl font-semibold">{title}</h2>
            <p className="text-muted-foreground">{description}</p>
          </div>

          {children}
        </div>
      </div>

      <div className="bg-muted h-screen p-5 max-lg:hidden">
        <Card className="bg-primary relative h-full justify-between overflow-hidden border-none py-8">
          <CardHeader className="gap-6 px-8">
            <CardTitle className="text-primary-foreground text-4xl font-bold xl:text-5xl/15.5">
              {sideTitle}
            </CardTitle>
            <p className="text-primary-foreground text-xl">{sideDescription}</p>
          </CardHeader>
          <CardContent />
        </Card>
      </div>
    </div>
  );
}
