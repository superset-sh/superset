/**
 * Provider Schedule - 가용 시간 관리
 *
 * 주간 스케줄 편집 + 오버라이드(예외일정) 관리
 */
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  AlertCircle,
} from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { toast } from "sonner";
import {
  useMyProviderProfile,
  useWeeklySchedule,
  useUpdateWeeklySchedule,
  useScheduleOverrides,
  useCreateOverride,
  useDeleteOverride,
} from "../../hooks/use-provider-hooks";

export function ProviderSchedule() {
  const navigate = useNavigate();
  const { data: profile, isLoading: profileLoading } = useMyProviderProfile();

  if (profileLoading) {
    return <ScheduleSkeleton />;
  }

  if (!profile) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-muted-foreground">
          상담사 등록이 필요합니다.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/provider/profile" })}
        >
          상담사 등록하기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/provider/dashboard" })}
          className="gap-2"
        >
          <ArrowLeft className="size-4" />
          대시보드
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold">스케줄 관리</h1>
        <p className="text-muted-foreground mt-2">
          상담 가능한 시간을 설정하세요.
        </p>
      </div>

      {/* 주간 스케줄 */}
      <WeeklyScheduleEditor providerId={profile.id} />

      <Separator />

      {/* 오버라이드 관리 */}
      <OverrideManager providerId={profile.id} />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface WeeklyScheduleEditorProps {
  providerId: string;
}

function WeeklyScheduleEditor({ providerId }: WeeklyScheduleEditorProps) {
  const { data: schedules, isLoading } = useWeeklySchedule(providerId);
  const updateSchedule = useUpdateWeeklySchedule();
  const [localSchedules, setLocalSchedules] = useState<ScheduleRow[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // 서버 데이터를 로컬 상태에 동기화
  useEffect(() => {
    if (schedules) {
      const mapped = DAY_NAMES.map((_, dayOfWeek) => {
        const existing = schedules.find(
          (s: { dayOfWeek: number }) => s.dayOfWeek === dayOfWeek,
        );
        return {
          dayOfWeek,
          startTime: existing?.startTime ?? "09:00",
          endTime: existing?.endTime ?? "18:00",
          isActive: existing?.isActive ?? false,
        };
      });
      setLocalSchedules(mapped);
      setIsDirty(false);
    }
  }, [schedules]);

  const handleToggle = (dayOfWeek: number, isActive: boolean) => {
    setLocalSchedules((prev) =>
      prev.map((s) => (s.dayOfWeek === dayOfWeek ? { ...s, isActive } : s)),
    );
    setIsDirty(true);
  };

  const handleTimeChange = (
    dayOfWeek: number,
    field: "startTime" | "endTime",
    value: string,
  ) => {
    setLocalSchedules((prev) =>
      prev.map((s) =>
        s.dayOfWeek === dayOfWeek ? { ...s, [field]: value } : s,
      ),
    );
    setIsDirty(true);
  };

  const handleSave = () => {
    const activeSchedules = localSchedules.filter((s) => s.isActive);
    updateSchedule.mutate(
      {
        providerId,
        schedules: {
          schedules: activeSchedules.map((s) => ({
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            isActive: s.isActive,
          })),
        },
      },
      {
        onSuccess: () => {
          toast.success("주간 스케줄이 저장되었습니다.");
          setIsDirty(false);
        },
        onError: (err) =>
          toast.error(err.message || "스케줄 저장에 실패했습니다."),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">주간 스케줄</h2>
        <Button
          onClick={handleSave}
          disabled={!isDirty || updateSchedule.isPending}
          className="gap-2"
        >
          <Save className="size-4" />
          {updateSchedule.isPending ? "저장 중..." : "저장"}
        </Button>
      </div>

      <div className="space-y-2">
        {localSchedules.map((schedule) => (
          <div
            key={schedule.dayOfWeek}
            className={cn(
              "flex items-center gap-4 rounded-lg border p-3 transition-colors",
              schedule.isActive ? "bg-background" : "bg-muted/30",
            )}
          >
            <Switch
              checked={schedule.isActive}
              onCheckedChange={(checked) =>
                handleToggle(schedule.dayOfWeek, checked)
              }
            />
            <span className="w-12 text-sm font-medium">
              {DAY_NAMES[schedule.dayOfWeek]}
            </span>
            {schedule.isActive ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={schedule.startTime}
                  onChange={(e) =>
                    handleTimeChange(
                      schedule.dayOfWeek,
                      "startTime",
                      e.target.value,
                    )
                  }
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">~</span>
                <Input
                  type="time"
                  value={schedule.endTime}
                  onChange={(e) =>
                    handleTimeChange(
                      schedule.dayOfWeek,
                      "endTime",
                      e.target.value,
                    )
                  }
                  className="w-32"
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">쉬는 날</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface OverrideManagerProps {
  providerId: string;
}

function OverrideManager({ providerId }: OverrideManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  // 30일 범위
  const dateFrom = new Date().toISOString().split("T")[0] ?? "";
  const dateTo = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0] ?? "";

  const { data: overrides, isLoading } = useScheduleOverrides(
    providerId,
    dateFrom,
    dateTo,
  );
  const deleteOverride = useDeleteOverride();

  const handleDelete = (overrideId: string) => {
    deleteOverride.mutate(
      { overrideId, providerId },
      {
        onSuccess: () => toast.success("예외 일정이 삭제되었습니다."),
        onError: (err) =>
          toast.error(err.message || "삭제에 실패했습니다."),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">예외 일정</h2>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="size-4" />
          예외 추가
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <CreateOverrideForm
              providerId={providerId}
              onSuccess={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-sm text-muted-foreground">
        향후 30일 이내의 예외 일정을 관리합니다.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : !overrides?.length ? (
        <div className="rounded-lg bg-muted/30 p-6 text-center">
          <p className="text-muted-foreground">등록된 예외 일정이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {overrides.map((override) => (
            <div
              key={override.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex size-9 items-center justify-center rounded-md",
                    override.overrideType === "unavailable"
                      ? "bg-red-100"
                      : "bg-green-100",
                  )}
                >
                  {override.overrideType === "unavailable" ? (
                    <AlertCircle className="size-4 text-red-600" />
                  ) : (
                    <CalendarDays className="size-4 text-green-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {formatOverrideDate(override.date)}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        override.overrideType === "unavailable"
                          ? "bg-red-100 text-red-800"
                          : "bg-green-100 text-green-800",
                      )}
                    >
                      {override.overrideType === "unavailable"
                        ? "불가"
                        : "가능"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {override.startTime && override.endTime && (
                      <span>
                        {override.startTime} - {override.endTime}
                      </span>
                    )}
                    {override.reason && <span>| {override.reason}</span>}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(override.id)}
                disabled={deleteOverride.isPending}
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface CreateOverrideFormProps {
  providerId: string;
  onSuccess: () => void;
}

function CreateOverrideForm({ providerId, onSuccess }: CreateOverrideFormProps) {
  const createOverride = useCreateOverride();
  const [date, setDate] = useState("");
  const [overrideType, setOverrideType] = useState<"unavailable" | "available">(
    "unavailable",
  );
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      toast.error("날짜를 선택해주세요.");
      return;
    }

    createOverride.mutate(
      {
        providerId,
        override: {
          date,
          overrideType,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          reason: reason || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("예외 일정이 추가되었습니다.");
          onSuccess();
        },
        onError: (err) =>
          toast.error(err.message || "예외 일정 추가에 실패했습니다."),
      },
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>예외 일정 추가</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">날짜</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">유형</label>
          <Select
            value={overrideType}
            onValueChange={(v) =>
              setOverrideType(v as "unavailable" | "available")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unavailable">불가 (쉬는 날)</SelectItem>
              <SelectItem value="available">가능 (추가 근무)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {overrideType === "available" && (
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">시작 시간</label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">종료 시간</label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">사유 (선택)</label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예외 사유를 입력하세요"
            maxLength={200}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          type="submit"
          disabled={createOverride.isPending}
        >
          {createOverride.isPending ? "추가 중..." : "추가"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-64" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatOverrideDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface ScheduleRow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}
