import { ArrowRight, Sparkles } from "lucide-react";
import { Section } from "@/components/section";
import { siteConfig } from "@/config/site";

export function Hero() {
  return (
    <Section className="pt-28 pb-20 md:pt-40 md:pb-28">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground">
          <Sparkles className="size-3.5" />
          <span>Now with AI-powered content generation</span>
        </div>

        <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
          Build your SaaS
          <br />
          <span className="text-muted-foreground">in days, not months</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Pre-built features for auth, payments, AI, CMS, and more.
          Pick what you need, customize, and launch.
        </p>

        <div className="mt-10 flex items-center justify-center gap-4">
          <a
            href={siteConfig.links.signUp}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start Building
            <ArrowRight className="size-4" />
          </a>
          <a
            href={siteConfig.links.github}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            View on GitHub
          </a>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Trusted by 500+ developers worldwide
        </p>
      </div>
    </Section>
  );
}
