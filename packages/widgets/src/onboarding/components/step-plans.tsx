import { Zap, Crown, Users, Check } from "lucide-react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { OnboardingStep } from "./onboarding-step";

export function StepPlans() {
  return (
    <OnboardingStep
      image={
        <div className="flex items-center justify-center gap-3 p-6">
          {PLAN_ITEMS.map((item) => (
            <div
              key={item.label}
              className={cn(
                "flex flex-col items-center gap-3 rounded-xl p-4 shadow-sm flex-1",
                item.highlighted
                  ? "bg-primary text-primary-foreground scale-105"
                  : "bg-background",
              )}
            >
              <item.icon
                className={cn(
                  "h-6 w-6",
                  item.highlighted
                    ? "text-primary-foreground"
                    : "text-primary",
                )}
              />
              <span
                className={cn(
                  "text-sm font-bold",
                  item.highlighted
                    ? "text-primary-foreground"
                    : "text-foreground",
                )}
              >
                {item.label}
              </span>
              <div className="flex flex-col gap-1">
                {item.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-1">
                    <Check
                      className={cn(
                        "h-3 w-3 shrink-0",
                        item.highlighted
                          ? "text-primary-foreground/80"
                          : "text-primary",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[10px]",
                        item.highlighted
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {feature}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      }
      title="무료로 시작하세요"
      description="Free 플랜으로 핵심 기능을 체험하고, 필요에 따라 Pro나 Team으로 업그레이드하세요."
    />
  );
}

/* Constants */

const PLAN_ITEMS = [
  {
    icon: Zap,
    label: "Free",
    highlighted: false,
    features: ["기본 Feature", "커뮤니티"],
  },
  {
    icon: Crown,
    label: "Pro",
    highlighted: true,
    features: ["AI 크레딧", "프리미엄 Feature", "우선 지원"],
  },
  {
    icon: Users,
    label: "Team",
    highlighted: false,
    features: ["팀 협업", "권한 관리", "전용 지원"],
  },
];
