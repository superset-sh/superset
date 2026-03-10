import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { ScrollArea } from "@superbuilder/feature-ui/shadcn/scroll-area";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { X, Pencil, Eye, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUpdateScreenCandidate } from "../hooks";
import type { FlowScreen, PanelMode, ScreenDetail } from "../types";

interface Props {
  sessionId: string;
  screen: FlowScreen;
  mode: PanelMode;
  activeTab: string;
  onClose: () => void;
  onModeChange: (mode: PanelMode) => void;
  onTabChange: (tab: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

const TABS = [
  { id: "overview", label: "개요" },
  { id: "ui", label: "UI 구성" },
  { id: "states", label: "상태/조건" },
  { id: "source", label: "근거" },
] as const;

export function ScreenDetailPanel({
  sessionId,
  screen,
  mode,
  activeTab,
  onClose,
  onModeChange,
  onTabChange,
  onDirtyChange,
}: Props) {
  const detail = screen.detail ?? {};
  const [editData, setEditData] = useState<ScreenDetail>({ ...detail });
  const updateCandidate = useUpdateScreenCandidate();

  const isEditing = mode === "edit";

  const handleEdit = () => {
    setEditData({ ...detail });
    onModeChange("edit");
  };

  const handleView = () => {
    onModeChange("view");
    onDirtyChange(false);
  };

  const handleSave = () => {
    updateCandidate.mutate(
      { sessionId, screenId: screen.id, ...editData },
      {
        onSuccess: () => {
          onModeChange("view");
          onDirtyChange(false);
          toast.success("저장되었습니다");
        },
        onError: () => {
          toast.error("저장에 실패했습니다");
        },
      },
    );
  };

  const updateField = <K extends keyof ScreenDetail>(key: K, value: ScreenDetail[K]) => {
    setEditData((prev) => ({ ...prev, [key]: value }));
    onDirtyChange(true);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 bg-muted/5">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold truncate">{screen.name}</h3>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {isEditing ? "편집" : "보기"}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button variant="ghost" size="icon" className="size-7" onClick={handleView}>
                <Eye className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={handleSave}
                disabled={updateCandidate.isPending}
              >
                {updateCandidate.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="icon" className="size-7" onClick={handleEdit}>
              <Pencil className="size-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/50 px-2">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 rounded-none border-b-2 text-xs",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 flex flex-col gap-4">
          {activeTab === "overview" ? (
            <OverviewTab
              detail={isEditing ? editData : detail}
              description={screen.description}
              isEditing={isEditing}
              onUpdate={updateField}
            />
          ) : null}
          {activeTab === "ui" ? (
            <UITab
              detail={isEditing ? editData : detail}
              isEditing={isEditing}
              onUpdate={updateField}
            />
          ) : null}
          {activeTab === "states" ? (
            <StatesTab
              detail={isEditing ? editData : detail}
              isEditing={isEditing}
              onUpdate={updateField}
            />
          ) : null}
          {activeTab === "source" ? (
            <SourceTab
              detail={isEditing ? editData : detail}
              isEditing={isEditing}
              onUpdate={updateField}
            />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

/* Components */

interface TabProps {
  detail: ScreenDetail;
  isEditing: boolean;
  onUpdate: <K extends keyof ScreenDetail>(key: K, value: ScreenDetail[K]) => void;
}

function OverviewTab({
  detail,
  description,
  isEditing,
  onUpdate,
}: TabProps & { description: string }) {
  return (
    <>
      <FieldSection label="화면 목표">
        {isEditing ? (
          <Textarea
            value={detail.screenGoal ?? ""}
            onChange={(e) => onUpdate("screenGoal", e.target.value)}
            placeholder="화면의 목표를 입력하세요"
            className="text-sm min-h-[80px]"
          />
        ) : (
          <p className="text-sm text-foreground">{detail.screenGoal || description || "-"}</p>
        )}
      </FieldSection>
      <FieldSection label="주요 사용자">
        {isEditing ? (
          <Input
            value={detail.primaryUser ?? ""}
            onChange={(e) => onUpdate("primaryUser", e.target.value)}
            placeholder="주요 사용자"
            className="text-sm"
          />
        ) : (
          <p className="text-sm text-foreground">{detail.primaryUser || "-"}</p>
        )}
      </FieldSection>
      <FieldSection label="라우트 경로">
        {isEditing ? (
          <Input
            value={detail.routePath ?? ""}
            onChange={(e) => onUpdate("routePath", e.target.value)}
            placeholder="/example/path"
            className="text-sm font-mono"
          />
        ) : (
          <p className="text-sm font-mono text-foreground">{detail.routePath || "-"}</p>
        )}
      </FieldSection>
    </>
  );
}

function UITab({ detail, isEditing, onUpdate }: TabProps) {
  return (
    <>
      <ChipListSection
        label="핵심 요소"
        items={detail.keyElements ?? []}
        isEditing={isEditing}
        onChange={(items) => onUpdate("keyElements", items)}
      />
      <ChipListSection
        label="입력 필드"
        items={detail.inputs ?? []}
        isEditing={isEditing}
        onChange={(items) => onUpdate("inputs", items)}
      />
      <ChipListSection
        label="액션"
        items={detail.actions ?? []}
        isEditing={isEditing}
        onChange={(items) => onUpdate("actions", items)}
      />
    </>
  );
}

function StatesTab({ detail, isEditing, onUpdate }: TabProps) {
  return (
    <>
      <ChipListSection
        label="상태"
        items={detail.states ?? []}
        isEditing={isEditing}
        onChange={(items) => onUpdate("states", items)}
      />
      <ChipListSection
        label="진입 조건"
        items={detail.entryConditions ?? []}
        isEditing={isEditing}
        onChange={(items) => onUpdate("entryConditions", items)}
      />
      <ChipListSection
        label="종료 조건"
        items={detail.exitConditions ?? []}
        isEditing={isEditing}
        onChange={(items) => onUpdate("exitConditions", items)}
      />
    </>
  );
}

function SourceTab({ detail, isEditing, onUpdate }: TabProps) {
  return (
    <>
      <ChipListSection
        label="요구사항 출처"
        items={detail.sourceRequirementIds ?? []}
        isEditing={isEditing}
        onChange={(items) => onUpdate("sourceRequirementIds", items)}
      />
      <FieldSection label="메모">
        {isEditing ? (
          <Textarea
            value={detail.notes ?? ""}
            onChange={(e) => onUpdate("notes", e.target.value)}
            placeholder="메모를 입력하세요"
            className="text-sm min-h-[100px]"
          />
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap">{detail.notes || "-"}</p>
        )}
      </FieldSection>
    </>
  );
}

function FieldSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ChipListSection({
  label,
  items,
  isEditing,
  onChange,
}: {
  label: string;
  items: string[];
  isEditing: boolean;
  onChange: (items: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
      setInputValue("");
    }
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 && !isEditing ? (
          <span className="text-sm text-muted-foreground">-</span>
        ) : null}
        {items.map((item, idx) => (
          <Badge
            key={`${item}-${idx}`}
            variant="secondary"
            className={cn("text-xs", isEditing ? "pr-1" : "")}
          >
            <span className="max-w-[160px] truncate">{item}</span>
            {isEditing ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-4 ml-1 hover:bg-destructive/20"
                onClick={() => handleRemove(idx)}
              >
                <X className="size-2.5" />
              </Button>
            ) : null}
          </Badge>
        ))}
      </div>
      {isEditing ? (
        <div className="flex gap-1.5 mt-1">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="추가할 항목 입력"
            className="text-xs h-7"
          />
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={handleAdd}>
            추가
          </Button>
        </div>
      ) : null}
    </div>
  );
}
