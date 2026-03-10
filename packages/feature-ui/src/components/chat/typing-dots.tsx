import { cn } from "../../lib/utils";

interface Props {
  className?: string;
}

export function TypingDots({ className }: Props) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
    </div>
  );
}
