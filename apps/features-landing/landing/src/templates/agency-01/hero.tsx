import { ArrowRight } from "lucide-react";
import { Section } from "@/components/section";

export function Hero() {
  return (
    <Section className="pt-28 pb-20 md:pt-36 md:pb-28">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Digital Agency
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            We build digital
            <br />
            products that
            <br />
            <span className="text-muted-foreground">people love</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            Strategy, design, and engineering for ambitious brands.
            We turn ideas into products.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <a
              href="#contact"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start a Project
              <ArrowRight className="size-4" />
            </a>
            <a
              href="#portfolio"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              View Our Work
            </a>
          </div>
        </div>

        <div className="flex aspect-square items-center justify-center rounded-xl bg-muted/50">
          <p className="text-sm text-muted-foreground">Hero Image / Video</p>
        </div>
      </div>
    </Section>
  );
}
