import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { CreditCard, Settings, Sparkles } from "lucide-react";
import type { SettingsTab } from "../hooks/use-settings-modal";
import { useSettingsTab } from "../hooks/use-settings-modal";

interface Props {}

export function SettingsSidebar({}: Props) {
  const { tab, setTab } = useSettingsTab();

  return (
    <nav className="flex w-48 flex-col gap-1 border-r py-4 px-2">
      {NAV_ITEMS.map((item) => (
        <Button
          key={item.id}
          variant="ghost"
          onClick={() => setTab(item.id)}
          className={cn(
            "flex h-auto w-full items-center justify-start gap-2 px-3 py-2 text-sm",
            tab === item.id
              ? "bg-muted text-foreground font-medium"
              : "text-muted-foreground hover:bg-muted/30",
          )}
        >
          <item.icon className="size-4" />
          {item.label}
        </Button>
      ))}
    </nav>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const NAV_ITEMS: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
  { id: "general", label: "일반", icon: Settings },
  { id: "payment", label: "결제", icon: CreditCard },
  { id: "ai", label: "AI", icon: Sparkles },
];
