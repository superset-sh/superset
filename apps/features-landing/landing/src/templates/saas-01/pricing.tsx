import { Check } from "lucide-react";
import { Section } from "@/components/section";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tier: string;
  monthlyCredits: number;
  price: number;
  currency: string;
  interval: string | null;
  isPerSeat: boolean;
  features: string[] | null;
  sortOrder: number;
}

const API_URL = process.env.API_URL ?? "http://localhost:3002";

async function getPlans(): Promise<Plan[]> {
  try {
    const res = await fetch(`${API_URL}/api/payment/plans`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

function formatPrice(plan: Plan): { price: string; period: string } {
  if (plan.tier === "free") return { price: "무료", period: "" };
  if (plan.tier === "enterprise" || plan.price === 0) return { price: "문의", period: "" };

  const formatted =
    plan.currency === "KRW"
      ? `₩${plan.price.toLocaleString("ko-KR")}`
      : `$${plan.price}`;

  const period = plan.isPerSeat ? "/인/월" : "/월";

  return { price: formatted, period };
}

function getCta(tier: string): { label: string; href: string } {
  if (tier === "free") return { label: "무료로 시작", href: siteConfig.links.signUp };
  if (tier === "enterprise") return { label: "문의하기", href: "mailto:sales@featureatlas.dev" };
  return { label: "시작하기", href: siteConfig.links.signUp };
}

export async function Pricing() {
  const plans = await getPlans();

  if (plans.length === 0) return null;

  // Team 플랜을 highlighted로 설정 (없으면 Pro)
  const highlightedTier = plans.some((p) => p.tier === "team") ? "team" : "pro";

  return (
    <Section id="pricing">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight">
          합리적인 가격, 투명한 정책
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          무료로 시작하고, 필요할 때 업그레이드하세요.
        </p>
      </div>

      <div className="mt-16 grid gap-6 md:grid-cols-4">
        {plans.map((plan) => {
          const { price, period } = formatPrice(plan);
          const cta = getCta(plan.tier);
          const highlighted = plan.tier === highlightedTier;

          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-xl border p-8",
                highlighted
                  ? "border-primary bg-primary/[0.02] shadow-sm"
                  : "border-border/40",
              )}
            >
              {highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-sm font-medium text-primary-foreground">
                  추천
                </div>
              )}

              <div>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{price}</span>
                  {period && (
                    <span className="text-sm text-muted-foreground">{period}</span>
                  )}
                </div>
                {plan.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                )}
              </div>

              <ul className="mt-8 flex-1 space-y-3">
                {(plan.features ?? []).map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                href={cta.href}
                className={cn(
                  "mt-8 block rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-colors",
                  highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border bg-background hover:bg-muted",
                )}
              >
                {cta.label}
              </a>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
