import { atom, useAtom } from "jotai";

const STORAGE_KEY = "onboarding_completed";
const TOTAL_STEPS = 5;

const onboardingOpenAtom = atom(false);
const onboardingStepAtom = atom(0);

export function useOnboarding() {
  const [open, setOpen] = useAtom(onboardingOpenAtom);
  const [step, setStep] = useAtom(onboardingStepAtom);

  const next = () => {
    setStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
  };

  const prev = () => {
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const complete = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // localStorage unavailable
    }
    setOpen(false);
  };

  const skip = () => {
    complete();
  };

  const dismiss = () => {
    setOpen(false);
  };

  const reopen = () => {
    setStep(0);
    setOpen(true);
  };

  const isFirst = step === 0;
  const isLast = step === TOTAL_STEPS - 1;

  return {
    open,
    step,
    next,
    prev,
    complete,
    skip,
    dismiss,
    reopen,
    isFirst,
    isLast,
    totalSteps: TOTAL_STEPS,
  };
}
