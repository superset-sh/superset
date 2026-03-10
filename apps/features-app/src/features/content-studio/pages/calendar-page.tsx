import { useState, useMemo } from "react";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@superbuilder/feature-ui/shadcn/sheet";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Plus,
  Repeat,
} from "lucide-react";
import { useStudios, useCalendarContents } from "../hooks";
import { RecurrenceManager } from "../components/recurrence-manager";

interface Props {}

export function CalendarPage({}: Props) {
  // 스튜디오 목록
  const { data: studios, isLoading: studiosLoading } = useStudios();

  // 선택된 스튜디오
  const [selectedStudioId, setSelectedStudioId] = useState<string>("");

  // 첫 스튜디오 자동 선택
  const resolvedStudioId = selectedStudioId || studios?.[0]?.id || "";

  // 월 네비게이션
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-based

  // 캘린더 콘텐츠 조회 (month는 1-based로 전달)
  const { data: contents, isLoading: contentsLoading } = useCalendarContents(
    resolvedStudioId,
    year,
    month + 1,
  );

  // 날짜 클릭 시 상세 Sheet
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 반복 관리 다이얼로그
  const [showRecurrenceManager, setShowRecurrenceManager] = useState(false);

  // 달력 그리드 데이터 생성
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const days: CalendarDay[] = [];

    // 이전 달 빈칸
    for (let i = 0; i < startPad; i++) {
      days.push({ date: null, dateStr: null, events: [] });
    }

    // 현재 달
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const events = (contents ?? []).filter((c) => {
        const scheduled = c.scheduledAt?.slice(0, 10);
        const published = c.publishedAt?.slice(0, 10);
        return scheduled === dateStr || (!scheduled && published === dateStr);
      });
      days.push({ date: d, dateStr, events });
    }

    return days;
  }, [year, month, contents]);

  // 선택된 날짜의 콘텐츠
  const selectedDateContents = useMemo(() => {
    if (!selectedDate) return [];
    return (contents ?? []).filter((c) => {
      const scheduled = c.scheduledAt?.slice(0, 10);
      const published = c.publishedAt?.slice(0, 10);
      return (
        scheduled === selectedDate ||
        (!scheduled && published === selectedDate)
      );
    });
  }, [selectedDate, contents]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const handleDayClick = (dateStr: string | null) => {
    if (dateStr) setSelectedDate(dateStr);
  };

  // 로딩 상태
  if (studiosLoading) {
    return (
      <div className="flex flex-col gap-8 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-6">
      <PageHeader
        title="콘텐츠 캘린더"
        actions={
          <div className="flex items-center gap-2">
            {/* 스튜디오 선택 */}
            <Select
              value={resolvedStudioId}
              onValueChange={(v) => {
                if (v) setSelectedStudioId(v);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="스튜디오 선택" />
              </SelectTrigger>
              <SelectContent>
                {studios?.map((studio) => (
                  <SelectItem key={studio.id} value={studio.id}>
                    {studio.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 반복 관리 버튼 */}
            <Button
              variant="outline"
              onClick={() => setShowRecurrenceManager(true)}
            >
              <Repeat className="size-4" />
              반복 관리
            </Button>
          </div>
        }
      />

      {/* 스튜디오 미선택 상태 */}
      {!resolvedStudioId ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Calendar className="size-12 text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium">스튜디오를 선택해주세요</p>
          <p className="text-sm text-muted-foreground mt-1">
            캘린더를 보려면 스튜디오를 먼저 선택해야 합니다
          </p>
        </div>
      ) : contentsLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {/* 월 네비게이션 */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium flex items-center gap-2">
              <Calendar className="size-5" />
              {year}년 {month + 1}월
            </h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={prevMonth}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={nextMonth}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-px">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="text-center text-sm font-medium text-muted-foreground py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 gap-px -mt-4">
            {calendarDays.map((day, i) => (
              <div
                key={i}
                className={cn(
                  "min-h-[100px] border border-border/50 rounded-md p-2",
                  day.date !== null && "cursor-pointer hover:bg-muted/30 transition-colors",
                )}
                onClick={() => handleDayClick(day.dateStr)}
              >
                {day.date !== null && (
                  <>
                    <span className="text-sm text-muted-foreground">
                      {day.date}
                    </span>
                    <div className="mt-1 space-y-1">
                      {day.events.slice(0, MAX_VISIBLE_ITEMS).map((event) => (
                        <ContentBadge key={event.id} content={event} />
                      ))}
                      {day.events.length > MAX_VISIBLE_ITEMS && (
                        <Badge variant="secondary" className="text-xs">
                          +{day.events.length - MAX_VISIBLE_ITEMS}
                        </Badge>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* 날짜 상세 Sheet */}
      <Sheet
        open={selectedDate !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDate(null);
        }}
      >
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>{selectedDate} 콘텐츠</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 p-4">
            {selectedDateContents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                이 날짜에 콘텐츠가 없습니다
              </p>
            ) : (
              selectedDateContents.map((content) => (
                <div
                  key={content.id}
                  className="flex items-start gap-3 rounded-md border border-border/50 p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {content.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={content.status} />
                      {content.label && (
                        <Badge variant="outline" className="text-xs">
                          {content.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => {
                console.log("새 콘텐츠 생성:", selectedDate);
              }}
            >
              <Plus className="size-4" />
              새 콘텐츠
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <RecurrenceManager
        studioId={resolvedStudioId}
        open={showRecurrenceManager}
        onOpenChange={setShowRecurrenceManager}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const MAX_VISIBLE_ITEMS = 3;

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  writing: "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",
  review:
    "bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300",
  published:
    "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300",
  canceled: "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  writing: "작성 중",
  review: "검토",
  published: "발행됨",
  canceled: "취소",
};

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function ContentBadge({ content }: { content: CalendarContent }) {
  const style = STATUS_STYLES[content.status] ?? STATUS_STYLES.draft;

  return (
    <div
      className={cn(
        "text-xs truncate rounded px-1.5 py-0.5",
        style,
      )}
    >
      {content.title}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span
      className={cn(
        "text-xs rounded px-1.5 py-0.5 inline-block",
        style,
      )}
    >
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Hooks
 * -----------------------------------------------------------------------------------------------*/

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface CalendarContent {
  id: string;
  title: string;
  status: string;
  label: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string | null;
}

interface CalendarDay {
  date: number | null;
  dateStr: string | null;
  events: CalendarContent[];
}
