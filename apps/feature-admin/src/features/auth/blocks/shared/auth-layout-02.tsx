import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";

interface AuthLayout02Props {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthLayout02({ title, description, children }: AuthLayout02Props) {
  return (
    <div className="h-dvh lg:grid lg:grid-cols-6">
      {/* Dashboard Preview */}
      <div className="max-lg:hidden lg:col-span-3 xl:col-span-4">
        <div className="bg-muted relative z-1 flex h-full items-center justify-center px-6">
          <div className="outline-border relative shrink rounded-[20px] p-2.5 outline-2 -outline-offset-[2px]">
            <img
              src="https://cdn.shadcnstudio.com/ss-assets/blocks/marketing/auth/image-1.png"
              className="max-h-111 w-full rounded-lg object-contain dark:hidden"
              alt="Dashboard"
            />
            <img
              src="https://cdn.shadcnstudio.com/ss-assets/blocks/marketing/auth/image-1-dark.png"
              className="hidden max-h-111 w-full rounded-lg object-contain dark:inline-block"
              alt="Dashboard"
            />
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex h-full flex-col items-center justify-center py-10 sm:px-5 lg:col-span-3 xl:col-span-2">
        <div className="w-full max-w-md px-6">
          <Link
            to="/"
            className="text-muted-foreground group mb-12 flex items-center gap-2 sm:mb-16 lg:mb-24"
          >
            <ChevronLeftIcon className="transition-transform duration-200 group-hover:-translate-x-0.5" />
            <p>Back to the website</p>
          </Link>

          <div className="flex flex-col gap-6">
            <div>
              <h2 className="mb-1.5 text-2xl font-semibold">{title}</h2>
              <p className="text-muted-foreground">{description}</p>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
