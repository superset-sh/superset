import { Rocket } from "lucide-react";
import { OnboardingStep } from "./onboarding-step";

export function StepStart() {
  return (
    <OnboardingStep
      image={
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center animate-bounce">
            <Rocket className="h-10 w-10 text-primary" />
          </div>
        </div>
      }
      title="준비 완료!"
      description="지금 바로 Feature를 탐색하고 첫 번째 프로젝트를 시작해보세요."
    />
  );
}
