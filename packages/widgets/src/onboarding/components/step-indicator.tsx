import { cn } from "@superbuilder/feature-ui/lib/utils";

interface Props {
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({ currentStep, totalSteps }: Props) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: totalSteps }, (_, i) => (
        <button
          key={i}
          type="button"
          className={cn(
            "h-2 rounded-full transition-all duration-300",
            i === currentStep
              ? "w-6 bg-primary"
              : "w-2 bg-muted-foreground/30",
          )}
          aria-label={`Step ${i + 1}`}
        />
      ))}
    </div>
  );
}
