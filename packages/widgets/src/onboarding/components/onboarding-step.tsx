import type { ReactNode } from "react";

interface Props {
  image: ReactNode;
  title: string;
  description: string;
}

export function OnboardingStep({ image, title, description }: Props) {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div className="w-full h-[240px] rounded-lg overflow-hidden flex items-center justify-center bg-muted">
        {image}
      </div>
      <div className="flex flex-col gap-2 px-2">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
