import type { ReactNode } from "react";

interface AuthLayout04Props {
  title: string;
  description: string;
  sideTitle: string;
  sideDescription: string;
  children: ReactNode;
}

export function AuthLayout04({
  title,
  description,
  sideTitle,
  sideDescription,
  children,
}: AuthLayout04Props) {
  return (
    <div className="h-dvh lg:grid lg:grid-cols-2">
      {/* Side Panel */}
      <div className="bg-primary flex flex-col items-center justify-between gap-12 p-10 max-lg:hidden xl:p-16">
        <div className="text-primary-foreground">
          <h1 className="mb-6 text-3xl font-bold">{sideTitle}</h1>
          <p className="text-xl">{sideDescription}</p>
        </div>

        <div className="border-card bg-card flex max-h-118 items-center justify-center rounded-xl border-12">
          <img
            src="https://cdn.shadcnstudio.com/ss-assets/blocks/marketing/auth/image-1.png"
            alt="dashboard"
            className="size-full rounded-xl object-contain dark:hidden"
          />
          <img
            src="https://cdn.shadcnstudio.com/ss-assets/blocks/marketing/auth/image-1-dark.png"
            alt="dashboard"
            className="hidden size-full rounded-xl object-contain dark:inline-block"
          />
        </div>

        <div className="flex gap-2 rounded-full bg-white/20 px-3 py-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-white">
            <img src="https://cdn.shadcnstudio.com/ss-assets/brand-logo/tailwind-logo.png" alt="TailwindCSS" className="w-7" />
          </span>
          <span className="flex size-9 items-center justify-center rounded-full bg-white">
            <img src="https://cdn.shadcnstudio.com/ss-assets/brand-logo/nextjs-logo.png" alt="Next.js" className="w-5.5" />
          </span>
          <span className="flex size-9 items-center justify-center rounded-full bg-white">
            <img src="https://cdn.shadcnstudio.com/ss-assets/brand-logo/shadcn-logo.png" alt="Shadcn" className="w-5.5" />
          </span>
        </div>
      </div>

      {/* Form */}
      <div className="flex h-full flex-col items-center justify-center py-10 sm:px-5">
        <div className="flex w-full max-w-lg flex-col gap-6 p-6">
          <div className="space-y-3 text-center">
            <h2 className="text-2xl font-semibold md:text-3xl lg:text-4xl">{title}</h2>
            <p className="text-muted-foreground">{description}</p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
