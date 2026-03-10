import { X, Check } from "lucide-react";
import { Section } from "@/components/section";

const problems = [
  "Months spent on auth, payments, and infrastructure",
  "Fragmented tools with inconsistent patterns",
  "Starting from scratch for every new project",
];

const solutions = [
  "Launch in days with pre-built, tested features",
  "Unified architecture with consistent patterns",
  "Modular system — pick features, customize, deploy",
];

export function ProblemSolution() {
  return (
    <Section>
      <div className="grid gap-12 md:grid-cols-2">
        <div className="rounded-xl border border-destructive/20 bg-destructive/[0.02] p-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-destructive">
            The Problem
          </p>
          <h3 className="mt-3 text-2xl font-bold">Building SaaS is slow</h3>
          <ul className="mt-6 space-y-4">
            {problems.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/[0.02] p-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            The Solution
          </p>
          <h3 className="mt-3 text-2xl font-bold">Feature Atlas</h3>
          <ul className="mt-6 space-y-4">
            {solutions.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
