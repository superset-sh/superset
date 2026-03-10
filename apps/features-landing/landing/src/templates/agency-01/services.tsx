import { Layers, Code, Megaphone, LineChart } from "lucide-react";
import { Section } from "@/components/section";

const services = [
  {
    icon: Layers,
    title: "Product Design",
    description: "User research, wireframes, prototypes, and pixel-perfect UI design.",
  },
  {
    icon: Code,
    title: "Development",
    description: "Full-stack web and mobile development with modern tech stacks.",
  },
  {
    icon: Megaphone,
    title: "Marketing",
    description: "Growth strategy, content marketing, SEO, and paid acquisition.",
  },
  {
    icon: LineChart,
    title: "Analytics",
    description: "Data-driven insights, A/B testing, and performance optimization.",
  },
];

export function Services() {
  return (
    <Section id="services" variant="muted">
      <div className="mb-16">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          What We Do
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight">Our services</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {services.map((service) => (
          <div
            key={service.title}
            className="group flex gap-5 rounded-xl border border-border/40 bg-background p-6 transition-colors hover:border-border"
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/5">
              <service.icon className="size-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-base font-semibold">{service.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                {service.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
