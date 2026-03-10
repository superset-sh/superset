"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
}

interface Props {
  items?: NavItem[];
  className?: string;
}

const defaultItems: NavItem[] = [
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Changelog", href: "/changelog" },
];

export function Navbar({ items = defaultItems, className }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className={cn("sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-lg", className)}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="text-xl font-bold tracking-tight">
          {siteConfig.name}
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href={siteConfig.links.signIn}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign In
          </a>
          <a
            href={siteConfig.links.signUp}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get Started
          </a>
        </div>

        <button
          type="button"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/40 bg-background px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm text-muted-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border/40 pt-3">
              <a href={siteConfig.links.signIn} className="text-sm font-medium">
                Sign In
              </a>
              <a
                href={siteConfig.links.signUp}
                className="rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground"
              >
                Get Started
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
