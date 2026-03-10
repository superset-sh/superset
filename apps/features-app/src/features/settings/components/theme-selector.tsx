import { useTheme } from "@superbuilder/features-client/core/theme";
import type { ThemeMode } from "@superbuilder/features-client/core/theme";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Monitor, Moon, Sun } from "lucide-react";

interface Props {}

export function ThemeSelector({}: Props) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">테마</label>
      <div className="grid grid-cols-3 gap-3">
        {THEME_OPTIONS.map((option) => (
          <ThemeCard
            key={option.value}
            icon={option.icon}
            label={option.label}
            selected={theme === option.value}
            onClick={() => setTheme(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface ThemeCardProps {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}

function ThemeCard({ icon, label, selected, onClick }: ThemeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors",
        selected
          ? "border-primary ring-2 ring-primary bg-primary/5"
          : "border-border hover:bg-muted/30",
      )}
    >
      {icon}
      <span className="text-sm">{label}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun className="size-5" /> },
  { value: "dark", label: "Dark", icon: <Moon className="size-5" /> },
  { value: "system", label: "System", icon: <Monitor className="size-5" /> },
];
