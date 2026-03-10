import React, { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { useOnboarding } from "./hooks";
import {
  StepIndicator,
  StepWelcome,
  StepFeatures,
  StepAi,
  StepPlans,
  StepStart,
} from "./components";

const STEPS: Array<() => React.JSX.Element> = [StepWelcome, StepFeatures, StepAi, StepPlans, StepStart];

export function OnboardingModal() {
  const {
    open,
    step,
    next,
    prev,
    complete,
    skip,
    dismiss,
    isFirst,
    isLast,
    totalSteps,
  } = useOnboarding();

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && !isLast) next();
      if (e.key === "ArrowLeft" && !isFirst) prev();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isFirst, isLast, next, prev]);

  const CurrentStep = STEPS[step];
  if (!CurrentStep) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) dismiss();
      }}
    >
      <DialogContent className="sm:max-w-[520px] p-6 gap-0" showCloseButton>
        <DialogTitle className="sr-only">온보딩</DialogTitle>

        <div className="flex flex-col gap-5">
          <CurrentStep />

          <StepIndicator currentStep={step} totalSteps={totalSteps} />

          <div className="flex items-center justify-between">
            {isLast ? (
              <>
                <div />
                <Button onClick={complete}>시작하기</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={skip}>
                  건너뛰기
                </Button>
                <div className="flex items-center gap-2">
                  {!isFirst ? (
                    <Button variant="outline" size="sm" onClick={prev}>
                      이전
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={next}>
                    다음
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
