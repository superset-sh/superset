import { ArrowRight } from "lucide-react";
import { siteConfig } from "@/config/site";

export function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-foreground text-background">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <div className="mb-6 inline-flex rounded-full border border-background/20 px-4 py-1.5 text-sm text-background/70">
          Open Source &middot; MIT Licensed
        </div>

        <h1 className="text-5xl font-bold tracking-tight md:text-7xl">
          Ship your product
          <br />
          <span className="text-background/60">before the hype dies</span>
        </h1>

        <p className="mx-auto mt-8 max-w-lg text-lg text-background/60">
          Stop building infrastructure. Start building your product.
          Feature Atlas gives you everything you need to launch.
        </p>

        <div className="mt-10 flex items-center justify-center gap-4">
          <a
            href={siteConfig.links.signUp}
            className="inline-flex items-center gap-2 rounded-lg bg-background px-8 py-3.5 text-sm font-semibold text-foreground transition-opacity hover:opacity-90"
          >
            Start for Free
            <ArrowRight className="size-4" />
          </a>
          <a
            href="#how-it-works"
            className="rounded-lg border border-background/20 px-8 py-3.5 text-sm font-medium text-background/80 transition-colors hover:border-background/40"
          >
            See How It Works
          </a>
        </div>
      </div>
    </section>
  );
}
