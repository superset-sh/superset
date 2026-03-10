/**
 * Lab Tab - 임시 탭 (추후 기능 추가 예정)
 */
import { Sparkles } from "lucide-react";

export function LabTab() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-2xl bg-muted/50 p-6">
          <Sparkles className="size-12 text-muted-foreground/50" />
        </div>
        <div>
          <h3 className="text-lg font-medium">실험실</h3>
          <p className="text-sm text-muted-foreground mt-1">
            새로운 기능이 준비 중입니다
          </p>
        </div>
      </div>
    </div>
  );
}
