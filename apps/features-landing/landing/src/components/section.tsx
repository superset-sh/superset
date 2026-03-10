import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "muted" | "dark";
}

export function Section({ id, children, className, variant = "default" }: Props) {
  return (
    <section
      id={id}
      className={cn(
        "py-20 md:py-28",
        variant === "muted" && "bg-muted/30",
        variant === "dark" && "bg-foreground text-background",
        className,
      )}
    >
      <div className="mx-auto max-w-6xl px-6">{children}</div>
    </section>
  );
}
