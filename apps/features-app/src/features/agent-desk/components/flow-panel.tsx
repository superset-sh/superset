import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { ScrollArea } from "@superbuilder/feature-ui/shadcn/scroll-area";
import { Monitor, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { FlowScreen } from "../types";

interface Props {
  screens: FlowScreen[];
  currentScreenIndex: number;
  onScreenSelect: (index: number) => void;
  onAddScreen: () => void;
  onRemoveScreen: (screenId: string) => void;
  isLoading?: boolean;
}

export function FlowPanel({
  screens,
  currentScreenIndex,
  onScreenSelect,
  onAddScreen,
  onRemoveScreen,
  isLoading,
}: Props) {
  const { t } = useFeatureTranslation("agent-desk");

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-4 bg-muted/5 backdrop-blur-md">
        <h3 className="text-sm font-semibold tracking-tight">{t("flowPanel")}</h3>
        <span className="bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ring-primary/20">
          {screens.length}
        </span>
      </div>

      {/* Screen List */}
      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <FlowPanelSkeleton />
        ) : screens.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="bg-muted/50 rounded-full p-4">
              <Monitor className="text-muted-foreground size-8" />
            </div>
            <p className="text-muted-foreground text-center text-sm">{t("screenEmpty")}</p>
          </div>
        ) : (
          <div className="relative isolate pt-2 pb-4">
            {/* Timeline Line Base - removed per user request */}
            
            <div className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {screens.map((screen, index) => (
                  <motion.div
                    key={screen.id}
                    initial={{ opacity: 0, height: 0, originY: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                  >
                    <ScreenItem
                      screen={screen}
                      index={index}
                      isActive={index === currentScreenIndex}
                      onSelect={() => onScreenSelect(index)}
                      onRemove={() => onRemoveScreen(screen.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </ScrollArea>

      {/* Add Screen Button */}
      <div className="border-t p-4 bg-gradient-to-t from-background to-background/80 backdrop-blur">
        <Button 
          variant="outline" 
          className="w-full border-dashed border-2 bg-transparent hover:bg-muted/50 shadow-none transition-colors" 
          onClick={onAddScreen}
        >
          <Plus className="mr-2 size-4" />
          {t("addScreen")}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function ScreenItem({
  screen,
  index,
  isActive,
  onSelect,
  onRemove,
}: {
  screen: FlowScreen;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { t } = useFeatureTranslation("agent-desk");

  return (
    <Button
      variant="ghost"
      className={cn(
        "group relative flex h-auto w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200",
        isActive
          ? "bg-primary/10 ring-1 ring-primary/20"
          : "hover:bg-muted/50",
      )}
      onClick={onSelect}
    >
      <div
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold transition-colors duration-200",
          isActive
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground group-hover:text-foreground",
        )}
      >
        {index + 1}
      </div>

      <p className={cn(
        "min-w-0 flex-1 truncate text-sm font-medium tracking-tight transition-colors duration-200",
        isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
      )}>
        {screen.name}
      </p>

      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive size-auto shrink-0 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label={t("removeScreen")}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </Button>
  );
}

function FlowPanelSkeleton() {
  return (
    <div className="relative flex flex-col gap-4">
      <div className="absolute left-4 top-4 bottom-0 w-px bg-muted" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-4">
          <div className="bg-background border size-6 z-10 animate-pulse rounded-full" />
          <div className="flex-1 mt-1">
            <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
            {i === 1 && <div className="bg-muted/50 h-3 w-1/2 animate-pulse mt-2 rounded" />}
          </div>
        </div>
      ))}
    </div>
  );
}
