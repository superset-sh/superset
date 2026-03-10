import { Section } from "@/components/section";

const testimonials = [
  {
    quote: "Feature Atlas saved us months of development. We launched our SaaS in under 2 weeks.",
    author: "Sarah Kim",
    role: "CTO, TechStart",
  },
  {
    quote: "The modular architecture is brilliant. We only use what we need, and adding features is effortless.",
    author: "James Park",
    role: "Lead Developer, BuildCo",
  },
  {
    quote: "Best boilerplate I've used. The payment and auth integrations just work out of the box.",
    author: "Emily Chen",
    role: "Founder, DataFlow",
  },
];

export function Testimonials() {
  return (
    <Section variant="muted">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight">
          Loved by developers
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          See what builders are saying about Feature Atlas.
        </p>
      </div>

      <div className="mt-16 grid gap-6 md:grid-cols-3">
        {testimonials.map((item) => (
          <div
            key={item.author}
            className="rounded-xl border border-border/40 bg-background p-6"
          >
            <p className="text-sm leading-relaxed text-muted-foreground">
              &ldquo;{item.quote}&rdquo;
            </p>
            <div className="mt-4 border-t border-border/40 pt-4">
              <p className="text-sm font-semibold">{item.author}</p>
              <p className="text-sm text-muted-foreground">{item.role}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
