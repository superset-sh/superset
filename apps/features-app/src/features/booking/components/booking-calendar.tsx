/**
 * BookingCalendar - booking feature 전용 월간 캘린더 래퍼
 *
 * 범용 MonthCalendar(@superbuilder/feature-ui)을 booking 도메인 API로 감싸서
 * 기존 consumer(my-bookings)의 import를 유지한다.
 */
import {
  MonthCalendar,
  getMonthStart,
  getMonthEnd,
  formatDateStr,
} from "@superbuilder/feature-ui/calendars/month-calendar";
import {
  CalendarEventChip,
  type EventChipColor,
} from "@superbuilder/feature-ui/calendars/calendar-event-chip";

export { getMonthStart, getMonthEnd, formatDateStr };

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface CalendarBooking {
  id: string;
  sessionDate: string | Date;
  startTime: string;
  endTime: string;
  status: string;
  [key: string]: unknown;
}

interface Props {
  bookings: CalendarBooking[];
  isLoading: boolean;
  currentDate: Date;
  onMonthChange: (date: Date) => void;
  onDayClick: (dateStr: string) => void;
  className?: string;
}

/* -------------------------------------------------------------------------------------------------
 * Component
 * -----------------------------------------------------------------------------------------------*/

export function BookingCalendar({
  bookings,
  ...rest
}: Props) {
  // sessionDate → date 매핑
  const events: BookingCalendarEvent[] = bookings.map((b) => ({
    ...b,
    date: b.sessionDate,
  }));

  return (
    <MonthCalendar<BookingCalendarEvent>
      {...rest}
      events={events}
      renderEvent={(event) => (
        <CalendarEventChip
          label={event.startTime}
          color={STATUS_COLOR_MAP[event.status] ?? "default"}
        />
      )}
    />
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const STATUS_COLOR_MAP: Record<string, EventChipColor> = {
  confirmed: "blue",
  completed: "green",
  pending_payment: "yellow",
  no_show: "red",
};

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

type BookingCalendarEvent = CalendarBooking & { date: string | Date };
