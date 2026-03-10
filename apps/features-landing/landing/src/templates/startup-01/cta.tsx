import { ArrowRight } from "lucide-react";
import { Section } from "@/components/section";
import { siteConfig } from "@/config/site";

export function CTA() {
  return (
    <Section variant="dark" className="text-center">
      <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
        Ready to build?
      </h2>
      <p className="mx-auto mt-4 max-w-md text-lg text-background/60">
        Join 500+ developers who ship faster with Feature Atlas.
      </p>
      <div className="mt-8">
        <a
          href={siteConfig.links.signUp}
          className="inline-flex items-center gap-2 rounded-lg bg-background px-8 py-3.5 text-sm font-semibold text-foreground transition-opacity hover:opacity-90"
        >
          Get Started Free
          <ArrowRight className="size-4" />
        </a>
      </div>
    </Section>
  );
}
