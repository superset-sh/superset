/**
 * BookingDayTimeline - booking feature 전용 타임라인 래퍼
 *
 * 범용 DayTimeline(@superbuilder/feature-ui)을 booking 도메인 API로 감싸서
 * 기존 consumer(my-bookings, provider-dashboard)의 import를 유지한다.
 */
import { type ReactNode } from "react";
import {
  DayTimeline,
  getDatesFromBase,
  toDateString,
} from "@superbuilder/feature-ui/calendars/day-timeline";

export { getDatesFromBase, toDateString };

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

export interface TimelineBooking {
  id: string;
  sessionDate: string | Date;
  startTime: string;
  endTime: string;
  status: string;
  [key: string]: unknown;
}

interface Props {
  bookings: TimelineBooking[];
  isLoading: boolean;
  baseDate: string;
  dayCount: number;
  dayWidth?: number;
  hourHeight?: number;
  startHour?: number;
  endHour?: number;
  onLoadMore?: () => void;
  renderBookingCard: (booking: TimelineBooking) => ReactNode;
  onEmptyDoubleClick?: (dateStr: string, hour: number) => void;
  scrollToTodayRef?: React.MutableRefObject<(() => void) | null>;
  className?: string;
}

/* -------------------------------------------------------------------------------------------------
 * Component
 * -----------------------------------------------------------------------------------------------*/

export function BookingDayTimeline({
  bookings,
  renderBookingCard,
  onEmptyDoubleClick,
  ...rest
}: Props) {
  // sessionDate → date 매핑
  const events: BookingTimelineEvent[] = bookings.map((b) => ({
    ...b,
    date: b.sessionDate,
  }));

  return (
    <DayTimeline<BookingTimelineEvent>
      {...rest}
      events={events}
      renderEvent={(event) => renderBookingCard(event)}
      onEmptySlotDoubleClick={onEmptyDoubleClick}
    />
  );
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

type BookingTimelineEvent = TimelineBooking & { date: string | Date };
