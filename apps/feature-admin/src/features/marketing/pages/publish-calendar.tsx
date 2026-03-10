/**
 * PublishCalendar - 예약 발행 캘린더 뷰
 */
import { useState, useMemo } from "react";
import { useMarketingContents } from "../hooks";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

export function PublishCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const { data, isLoading } = useMarketingContents({ limit: 50 });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 달력 그리드 데이터 생성
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const days: CalendarDay[] = [];

    // 이전 달 빈칸
    for (let i = 0; i < startPad; i++) {
      days.push({ date: null, events: [] });
    }

    // 현재 달
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const events = (data?.data ?? []).filter((content) => {
        const created = content.createdAt?.slice(0, 10);
        return created === dateStr;
      });
      days.push({ date: d, events });
    }

    return days;
  }, [year, month, data]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {year}년 {month + 1}월
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 gap-px mb-1">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
              {day}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 gap-px">
          {calendarDays.map((day, i) => (
            <div
              key={i}
              className="min-h-[80px] border border-border/50 rounded-md p-1"
            >
              {day.date && (
                <>
                  <span className="text-xs text-muted-foreground">{day.date}</span>
                  <div className="mt-1 space-y-0.5">
                    {day.events.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        className="text-[10px] truncate rounded bg-primary/10 px-1 py-0.5 text-foreground"
                      >
                        {event.title}
                      </div>
                    ))}
                    {day.events.length > 2 && (
                      <Badge variant="secondary" className="text-[9px]">
                        +{day.events.length - 2}
                      </Badge>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface CalendarDay {
  date: number | null;
  events: Array<{ id: string; title: string; createdAt: string }>;
}
