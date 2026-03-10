import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Checkbox } from "@superbuilder/feature-ui/shadcn/checkbox";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Loader2, LayoutGrid, Video, MessageSquare, Mail } from "lucide-react";
import { useRepurposeBatch } from "../../hooks";

interface Props {
  contentId: string;
  studioId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingFormats: string[];
  onConvertSuccess?: () => void;
}

export function RepurposeDialog({
  contentId,
  studioId,
  open,
  onOpenChange,
  existingFormats,
  onConvertSuccess,
}: Props) {
  const [selectedFormats, setSelectedFormats] = useState<RepurposeFormat[]>([]);
  const [customInstruction, setCustomInstruction] = useState("");
  const { convertBatch } = useRepurposeBatch(studioId);

  const handleToggleFormat = (format: RepurposeFormat) => {
    setSelectedFormats((prev) =>
      prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format],
    );
  };

  const handleConvert = () => {
    if (selectedFormats.length === 0) return;
    convertBatch.mutate(
      {
        contentId,
        formats: selectedFormats,
        customInstruction: customInstruction.trim() || undefined,
      },
      {
        onSuccess: () => {
          onConvertSuccess?.();
          onOpenChange(false);
          setSelectedFormats([]);
          setCustomInstruction("");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>콘텐츠 리퍼포징</DialogTitle>
          <DialogDescription>
            원본 콘텐츠를 다른 포맷으로 변환합니다
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-4">
          {FORMATS.map((fmt) => {
            const isSelected = selectedFormats.includes(fmt.value);
            const isExisting = existingFormats.includes(fmt.value);
            const Icon = fmt.icon;
            return (
              <label
                key={fmt.value}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50",
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => handleToggleFormat(fmt.value)}
                />
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{fmt.label}</p>
                  {isExisting && (
                    <p className="text-[11px] text-muted-foreground/70">
                      덮어쓰기
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        <Textarea
          placeholder="추가 지시사항 (선택)"
          value={customInstruction}
          onChange={(e) => setCustomInstruction(e.target.value)}
          maxLength={500}
          className="resize-none"
          rows={3}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={handleConvert}
            disabled={selectedFormats.length === 0 || convertBatch.isPending}
          >
            {convertBatch.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                변환 중...
              </>
            ) : (
              `변환 (${selectedFormats.length}개)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const FORMATS = [
  { value: "card_news", label: "카드 뉴스", icon: LayoutGrid },
  { value: "short_form", label: "숏폼 스크립트", icon: Video },
  { value: "twitter_thread", label: "트위터 스레드", icon: MessageSquare },
  { value: "email_summary", label: "이메일 요약", icon: Mail },
] as const;

type RepurposeFormat = typeof FORMATS[number]["value"];
