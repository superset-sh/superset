import {
  Shield,
  CreditCard,
  Bot,
  FileText,
  BarChart3,
  Bell,
  Users,
  Palette,
  Zap,
} from "lucide-react";
import { Section } from "@/components/section";

const features = [
  {
    icon: Shield,
    title: "Authentication",
    description: "Supabase Auth with JWT, role-based access, social login, and admin guards.",
  },
  {
    icon: CreditCard,
    title: "Payments",
    description: "LemonSqueezy integration with subscriptions, one-time payments, and credit system.",
  },
  {
    icon: Bot,
    title: "AI Agent",
    description: "Chat interface with streaming, usage tracking, and per-model credit pricing.",
  },
  {
    icon: FileText,
    title: "Content Studio",
    description: "Visual canvas editor, content calendar, SEO optimization, and scheduled publishing.",
  },
  {
    icon: Users,
    title: "Community",
    description: "Reddit-style forums with voting, karma, moderation tools, and user reputation.",
  },
  {
    icon: Palette,
    title: "Marketing",
    description: "Campaign management, SNS publishing, platform variants, and content automation.",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description: "Event tracking, daily metrics, audit logs, and real-time dashboards.",
  },
  {
    icon: Bell,
    title: "Notifications",
    description: "In-app notifications with per-channel settings and real-time delivery.",
  },
  {
    icon: Zap,
    title: "Scheduled Jobs",
    description: "Cron-based job scheduler with execution history and retry logic.",
  },
];

export function Features() {
  return (
    <Section id="features" variant="muted">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight">
          Everything you need to launch
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          17+ production-ready features. Pick what you need and start building.
        </p>
      </div>

      <div className="mt-16 grid gap-6 md:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="group rounded-xl border border-border/40 bg-background p-6 transition-colors hover:border-border"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/5">
              <feature.icon className="size-5 text-foreground" />
            </div>
            <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
