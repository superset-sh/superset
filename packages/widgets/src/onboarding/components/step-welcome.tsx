import { Sparkles } from "lucide-react";
import { OnboardingStep } from "./onboarding-step";

export function StepWelcome() {
  return (
    <OnboardingStep
      image={
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <span className="text-2xl font-bold text-foreground/80">
            Feature Atlas
          </span>
        </div>
      }
      title="Feature Atlas에 오신 것을 환영합니다!"
      description="SaaS를 며칠 만에 구축하세요. 17개 이상의 프로덕션 레디 Feature를 조합하여 당신만의 서비스를 완성합니다."
    />
  );
}
