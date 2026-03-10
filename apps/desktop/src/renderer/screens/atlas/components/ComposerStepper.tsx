import { cn } from "@superset/ui/utils";
import { LuCheck, LuLoader2 } from "react-icons/lu";

const STEPS = [
  { label: "Feature 선택", description: "사용할 Feature를 선택하세요" },
  { label: "의존성 확인", description: "자동 포함되는 Feature를 확인하세요" },
  { label: "프로젝트 설정", description: "이름과 저장 경로를 설정하세요" },
  { label: "프로젝트 생성", description: "파일 추출 및 Git 초기화" },
  { label: "Supabase", description: "데이터베이스 프로젝트 생성" },
  { label: "Vercel", description: "프로젝트 배포" },
];

interface ComposerStepperProps {
  currentStep: number;
  completedSteps?: number[];
  failedSteps?: number[];
  activeStep?: number | null;
}

export function ComposerStepper({
  currentStep,
  completedSteps = [],
  failedSteps = [],
  activeStep = null,
}: ComposerStepperProps) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((step, i) => {
        const isCompleted = completedSteps.includes(i);
        const isFailed = failedSteps.includes(i);
        const isActive = activeStep === i;
        const isPast = i <= currentStep;

        return (
          <div key={step.label} className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center justify-center size-7 rounded-full text-xs font-medium",
                isCompleted
                  ? "bg-green-500 text-white"
                  : isFailed
                    ? "bg-destructive text-destructive-foreground"
                    : isPast
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
              )}
            >
              {isCompleted ? (
                <LuCheck className="size-3.5" />
              ) : isActive ? (
                <LuLoader2 className="size-3.5 animate-spin" />
              ) : (
                i + 1
              )}
            </div>
            <div>
              <p
                className={cn(
                  "text-xs font-medium",
                  isPast ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </p>
            </div>
            {i < STEPS.length - 1 ? (
              <div className="w-8 h-px bg-border mx-1" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
