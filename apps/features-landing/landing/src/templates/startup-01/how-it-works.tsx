import { GitFork, Settings, Rocket } from "lucide-react";
import { Section } from "@/components/section";

const steps = [
  {
    icon: GitFork,
    step: "01",
    title: "Clone & Configure",
    description: "Clone the repo, set your environment variables, and choose your features.",
  },
  {
    icon: Settings,
    step: "02",
    title: "Customize",
    description: "Modify templates, adjust branding, and configure your business logic.",
  },
  {
    icon: Rocket,
    step: "03",
    title: "Deploy & Launch",
    description: "Push to Vercel or your preferred host. Your SaaS is live.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" variant="muted">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Three steps to your production SaaS.
        </p>
      </div>

      <div className="mt-16 grid gap-8 md:grid-cols-3">
        {steps.map((item) => (
          <div key={item.step} className="text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-primary/5">
              <item.icon className="size-6 text-foreground" />
            </div>
            <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Step {item.step}
            </p>
            <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
