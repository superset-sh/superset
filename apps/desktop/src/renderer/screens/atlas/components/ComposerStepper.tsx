import { cn } from "@superset/ui/cn";

const STEPS = [
  { label: "Feature 선택", description: "사용할 Feature를 선택하세요" },
  { label: "의존성 확인", description: "자동 포함되는 Feature를 확인하세요" },
  { label: "프로젝트 설정", description: "이름과 저장 경로를 설정하세요" },
];

interface ComposerStepperProps {
  currentStep: number;
}

export function ComposerStepper({ currentStep }: ComposerStepperProps) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2">
          <div
            className={cn(
              "flex items-center justify-center size-7 rounded-full text-xs font-medium",
              i <= currentStep
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {i + 1}
          </div>
          <div>
            <p
              className={cn(
                "text-xs font-medium",
                i <= currentStep
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {step.label}
            </p>
          </div>
          {i < STEPS.length - 1 ? (
            <div className="w-8 h-px bg-border mx-1" />
          ) : null}
        </div>
      ))}
    </div>
  );
}
