import { useEffect, useState } from "react";
import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { ArrowLeft, MonitorSmartphone, Palette } from "lucide-react";

type Platform = "mobile" | "desktop";

interface Props {
  title: string;
  platform?: Platform;
  designTheme?: string;
  onBack: () => void;
  onPlatformChange: (platform: Platform) => void;
  onDesignThemeChange: (theme: string) => void;
  children?: React.ReactNode;
}

export function DesignerHeader({
  title,
  platform = "mobile",
  designTheme = "",
  onBack,
  onPlatformChange,
  onDesignThemeChange,
  children,
}: Props) {
  const { t } = useFeatureTranslation("agent-desk");
  const [themeInput, setThemeInput] = useState(designTheme);

  // Sync server-side theme value to local input buffer.
  // This is an intentional prop-to-state sync for the debounce pattern:
  // local state acts as a typing buffer while the debounced effect persists.
  useEffect(() => {
    setThemeInput(designTheme);
  }, [designTheme]);

  // Debounce theme input changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (themeInput !== designTheme) {
        onDesignThemeChange(themeInput);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [themeInput, designTheme, onDesignThemeChange]);

  return (
    <div className="flex h-16 w-full items-center justify-between border-b border-border/50 bg-background/80 backdrop-blur-xl px-6 shadow-sm z-50">
      {/* Left & Center group: Back, Title, Controls */}
      <div className="flex items-center gap-6">
        {/* Back & Title */}
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="icon" 
            className="shrink-0 size-9 rounded-full shadow-sm bg-background/50 hover:bg-muted transition-colors" 
            onClick={onBack}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="h-4 w-px bg-border/80" />
          <h2 className="min-w-0 max-w-[200px] truncate text-base font-semibold tracking-tight">{title}</h2>
        </div>

        {/* Platform Select */}
        <div className="flex items-center">
          <Select
            value={platform}
            onValueChange={(v) => {
              if (v) onPlatformChange(v as Platform);
            }}
          >
            <SelectTrigger className="h-9 w-auto gap-2 text-sm bg-muted/20 border border-border/50 ring-offset-0 focus:ring-0 shadow-sm font-medium hover:bg-muted/50 rounded-full px-3 transition-colors">
              <MonitorSmartphone className="size-4 text-primary" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="mobile" className="rounded-lg">{t("platformMobile")}</SelectItem>
              <SelectItem value="desktop" className="rounded-lg">{t("platformDesktop")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Theme Input */}
        <div className="flex items-center gap-2 bg-muted/20 border border-border/50 rounded-full pl-3 pr-1 shadow-sm transition-colors focus-within:bg-background focus-within:ring-1 focus-within:ring-primary/20">
          <Palette className="size-4 text-muted-foreground" />
          <Input
            value={themeInput}
            onChange={(e) => setThemeInput(e.target.value)}
            placeholder={t("designThemePlaceholder")}
            className="h-9 w-[180px] sm:w-[220px] text-sm bg-transparent border-0 ring-offset-0 focus-visible:ring-0 shadow-none px-1"
          />
        </div>
      </div>
      
      {/* Right Actions (Children) */}
      <div className="flex items-center gap-3">
        {children}
      </div>
    </div>
  );
}
