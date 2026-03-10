import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { Button } from "../../_shadcn/button";
import { cn } from "../../lib/utils";
import { PullToRefresh } from "./pull-to-refresh";

interface Props {
  className?: string;
  variant?: "default" | "secondary";
  children: React.ReactNode;
}

export function Scaffold({ className, variant = "default", children }: Props) {
  return (
    <div
      className={cn(
        "data-[variant='default']:bg-background data-[variant='secondary']:bg-muted] mx-auto flex h-dvh w-[min(var(--container-md),100%)] flex-col",
        className,
      )}
      data-variant={variant}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface ScaffoldHeaderProps {
  title?: string;
  leftActions?: Action[];
  rightActions?: Action[];
  onBack?: () => void;
  onClose?: () => void;
  className?: string;
}

export function ScaffoldHeader({
  title,
  leftActions = [],
  rightActions = [],
  onBack,
  onClose,
  className,
}: ScaffoldHeaderProps) {
  return (
    <div className={cn("flex h-14 shrink-0 gap-x-4 px-3", className)}>
      <div className="flex shrink-0 items-center gap-x-2">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack}>
            <DynamicIcon name="chevron-left" className="size-6" />
            <span className="sr-only">Back</span>
          </Button>
        )}
        {leftActions.map(({ icon, label, onClick }, i) => (
          <Button key={i} variant="ghost" size="icon" onClick={onClick}>
            <DynamicIcon name={icon} className="size-6" />
            <span className="sr-only">{label}</span>
          </Button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 basis-0 items-center">
        <h1 className="truncate text-xl font-bold">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-x-2">
        {rightActions.map(({ icon, label, onClick }, i) => (
          <Button key={i} variant="ghost" size="icon" onClick={onClick}>
            <DynamicIcon name={icon} className="size-6" />
            <span className="sr-only">{label}</span>
          </Button>
        ))}
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <DynamicIcon name="x" className="size-6" />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>
    </div>
  );
}

interface ScaffoldContentProps {
  children?: React.ReactNode;
  className?: string;
}

export function ScaffoldContent({ children, className }: ScaffoldContentProps) {
  return <PullToRefresh className={cn("min-h-0 flex-1 basis-0", className)}>{children}</PullToRefresh>;
}

interface ScaffoldFooterProps {
  children?: React.ReactNode;
}

export function ScaffoldFooter({ children }: ScaffoldFooterProps) {
  return <div className="flex shrink-0 flex-col gap-y-2 px-5 py-3">{children}</div>;
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface Action {
  icon: IconName;
  label: string;
  onClick?: () => void;
}
