import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { eq, and, between, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "@superbuilder/drizzle";
import {
  bookingWeeklySchedules,
  bookingScheduleOverrides,
  bookingBookings,
  type BookingWeeklySchedule,
  type BookingScheduleOverride,
} from "@superbuilder/drizzle";
import type { AvailableSlot } from "../types";
import type { z } from "zod";
import type { updateWeeklyScheduleSchema } from "../dto/update-weekly-schedule.dto";
import type { createScheduleOverrideSchema } from "../dto/create-schedule-override.dto";

type UpdateWeeklyScheduleInput = z.infer<typeof updateWeeklyScheduleSchema>;
type CreateScheduleOverrideInput = z.infer<typeof createScheduleOverrideSchema>;

type ScheduleEntry = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  // ===========================================================================
  // 주간 스케줄 관리
  // ===========================================================================

  /**
   * 상담사의 주간 스케줄 전체 조회
   */
  async getWeeklySchedule(
    providerId: string,
  ): Promise<BookingWeeklySchedule[]> {
    const schedules = await this.db
      .select()
      .from(bookingWeeklySchedules)
      .where(eq(bookingWeeklySchedules.providerId, providerId))
      .orderBy(
        sql`${bookingWeeklySchedules.dayOfWeek} asc`,
        sql`${bookingWeeklySchedules.startTime} asc`,
      );

    return schedules as BookingWeeklySchedule[];
  }

  /**
   * 주간 스케줄 배치 업데이트 (기존 삭제 → 새로 insert)
   *
   * 트랜잭션으로 원자적 처리
   */
  async updateWeeklySchedule(
    providerId: string,
    dto: UpdateWeeklyScheduleInput,
  ): Promise<BookingWeeklySchedule[]> {
    const { schedules } = dto;

    // 입력값 검증
    for (const entry of schedules) {
      this.validateScheduleEntry(entry);
    }

    // 트랜잭션: 기존 삭제 → 새로 insert
    await this.db.transaction(async (tx) => {
      // 기존 스케줄 삭제
      await tx
        .delete(bookingWeeklySchedules)
        .where(eq(bookingWeeklySchedules.providerId, providerId));

      // 새 스케줄 insert
      if (schedules.length > 0) {
        await tx.insert(bookingWeeklySchedules).values(
          schedules.map((entry) => ({
            providerId,
            dayOfWeek: entry.dayOfWeek,
            startTime: entry.startTime,
            endTime: entry.endTime,
            isActive: entry.isActive,
          })),
        );
      }
    });

    return this.getWeeklySchedule(providerId);
  }

  // ===========================================================================
  // 오버라이드 관리
  // ===========================================================================

  /**
   * 기간 내 스케줄 오버라이드 조회
   */
  async getOverrides(
    providerId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<BookingScheduleOverride[]> {
    const overrides = await this.db
      .select()
      .from(bookingScheduleOverrides)
      .where(
        and(
          eq(bookingScheduleOverrides.providerId, providerId),
          between(
            bookingScheduleOverrides.date,
            new Date(dateFrom),
            new Date(dateTo),
          ),
        ),
      )
      .orderBy(sql`${bookingScheduleOverrides.date} asc`);

    return overrides as BookingScheduleOverride[];
  }

  /**
   * 스케줄 오버라이드 생성
   *
   * available 타입일 때 startTime/endTime 필수
   */
  async createOverride(
    providerId: string,
    dto: CreateScheduleOverrideInput,
  ): Promise<BookingScheduleOverride> {
    // available 타입이면 시간 필수
    if (dto.overrideType === "available") {
      if (!dto.startTime || !dto.endTime) {
        throw new BadRequestException(
          "available 타입의 오버라이드는 시작/종료 시간이 필수입니다",
        );
      }

      if (timeToMinutes(dto.startTime) >= timeToMinutes(dto.endTime)) {
        throw new BadRequestException(
          "시작 시간은 종료 시간보다 이전이어야 합니다",
        );
      }
    }

    const [override] = await this.db
      .insert(bookingScheduleOverrides)
      .values({
        providerId,
        date: new Date(dto.date),
        overrideType: dto.overrideType,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        reason: dto.reason ?? null,
      })
      .returning();

    return override as BookingScheduleOverride;
  }

  /**
   * 스케줄 오버라이드 삭제 (본인 것만)
   */
  async deleteOverride(
    overrideId: string,
    providerId: string,
  ): Promise<{ success: boolean }> {
    const [override] = await this.db
      .select()
      .from(bookingScheduleOverrides)
      .where(eq(bookingScheduleOverrides.id, overrideId))
      .limit(1);

    if (!override) {
      throw new NotFoundException(
        `스케줄 오버라이드를 찾을 수 없습니다: ${overrideId}`,
      );
    }

    if (override.providerId !== providerId) {
      throw new BadRequestException("본인의 스케줄 오버라이드만 삭제할 수 있습니다");
    }

    await this.db
      .delete(bookingScheduleOverrides)
      .where(eq(bookingScheduleOverrides.id, overrideId));

    return { success: true };
  }

  // ===========================================================================
  // 슬롯 계산
  // ===========================================================================

  /**
   * 특정 날짜의 가용 슬롯 계산
   *
   * 5단계 알고리즘:
   * 1. 기본 스케줄 조회 (요일 매칭)
   * 2. 오버라이드 적용
   * 3. 슬롯 분할 (durationMinutes 단위)
   * 4. 기존 예약 제외
   * 5. 과거 시간 제외
   */
  async getAvailableSlots(
    providerId: string,
    date: string,
    durationMinutes: number,
  ): Promise<AvailableSlot[]> {
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay(); // 0=일 ~ 6=토

    // 1. 기본 스케줄 조회
    const baseSchedules = await this.db
      .select()
      .from(bookingWeeklySchedules)
      .where(
        and(
          eq(bookingWeeklySchedules.providerId, providerId),
          eq(bookingWeeklySchedules.dayOfWeek, dayOfWeek),
          eq(bookingWeeklySchedules.isActive, true),
        ),
      );

    // 시간 범위 수집 (start/end minutes 쌍)
    let timeRanges: { start: number; end: number }[] = baseSchedules.map(
      (s) => ({
        start: timeToMinutes(s.startTime),
        end: timeToMinutes(s.endTime),
      }),
    );

    // 2. 오버라이드 적용
    const overrides = await this.db
      .select()
      .from(bookingScheduleOverrides)
      .where(
        and(
          eq(bookingScheduleOverrides.providerId, providerId),
          eq(bookingScheduleOverrides.date, targetDate),
        ),
      );

    for (const override of overrides) {
      if (override.overrideType === "unavailable") {
        if (!override.startTime || !override.endTime) {
          // 시간 없이 unavailable → 해당 날짜 전체 비활성
          return [];
        }
        // 특정 시간대만 제외
        const removeStart = timeToMinutes(override.startTime);
        const removeEnd = timeToMinutes(override.endTime);
        timeRanges = subtractTimeRange(timeRanges, removeStart, removeEnd);
      } else if (override.overrideType === "available") {
        if (override.startTime && override.endTime) {
          // 시간대 추가
          timeRanges.push({
            start: timeToMinutes(override.startTime),
            end: timeToMinutes(override.endTime),
          });
        }
      }
    }

    // 시간 범위가 없으면 빈 배열
    if (timeRanges.length === 0) {
      return [];
    }

    // 3. 슬롯 분할
    const slots: { start: number; end: number }[] = [];
    for (const range of timeRanges) {
      let current = range.start;
      while (current + durationMinutes <= range.end) {
        slots.push({ start: current, end: current + durationMinutes });
        current += durationMinutes;
      }
    }

    if (slots.length === 0) {
      return [];
    }

    // 4. 기존 예약 제외 (confirmed, pending_payment 상태)
    const existingBookings = await this.db
      .select({
        startTime: bookingBookings.startTime,
        endTime: bookingBookings.endTime,
      })
      .from(bookingBookings)
      .where(
        and(
          eq(bookingBookings.providerId, providerId),
          eq(bookingBookings.sessionDate, targetDate),
          sql`${bookingBookings.status} IN ('confirmed', 'pending_payment')`,
        ),
      );

    const bookedRanges = existingBookings.map((b) => ({
      start: timeToMinutes(b.startTime),
      end: timeToMinutes(b.endTime),
    }));

    // 5. 과거 시간 제외
    const now = new Date();
    const todayStr = formatDateString(now);
    const isToday = date === todayStr;
    const currentMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : 0;

    const availableSlots: AvailableSlot[] = [];

    for (const slot of slots) {
      // 오늘이면 현재 시각 이전 슬롯 제거
      if (isToday && slot.start <= currentMinutes) {
        continue;
      }

      // 예약과 겹치는지 확인: start_a < end_b AND start_b < end_a
      const isBooked = bookedRanges.some(
        (booked) => slot.start < booked.end && booked.start < slot.end,
      );

      availableSlots.push({
        date,
        startTime: minutesToTime(slot.start),
        endTime: minutesToTime(slot.end),
        available: !isBooked,
      });
    }

    return availableSlots;
  }

  /**
   * 여러 날짜의 가용 슬롯 한 번에 조회
   */
  async getAvailableSlotsForRange(
    providerId: string,
    dateFrom: string,
    dateTo: string,
    durationMinutes: number,
  ): Promise<Map<string, AvailableSlot[]>> {
    const result = new Map<string, AvailableSlot[]>();

    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    const current = new Date(start);

    while (current <= end) {
      const dateStr = formatDateString(current);
      const slots = await this.getAvailableSlots(
        providerId,
        dateStr,
        durationMinutes,
      );
      result.set(dateStr, slots);
      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * 스케줄 항목 검증
   */
  private validateScheduleEntry(entry: ScheduleEntry): void {
    if (entry.dayOfWeek < 0 || entry.dayOfWeek > 6) {
      throw new BadRequestException(
        `유효하지 않은 요일입니다: ${entry.dayOfWeek} (0=일 ~ 6=토)`,
      );
    }

    const startMinutes = timeToMinutes(entry.startTime);
    const endMinutes = timeToMinutes(entry.endTime);

    if (startMinutes >= endMinutes) {
      throw new BadRequestException(
        `시작 시간(${entry.startTime})은 종료 시간(${entry.endTime})보다 이전이어야 합니다`,
      );
    }
  }
}

// ===========================================================================
// 모듈 수준 헬퍼 함수
// ===========================================================================

/**
 * HH:MM 형식 → 분 단위로 변환
 */
function timeToMinutes(time: string): number {
  const parts = time.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  return h * 60 + m;
}

/**
 * 분 단위 → HH:MM 형식으로 변환
 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * 시간 범위 배열에서 특정 구간을 제거
 *
 * 예: [{9:00-17:00}] 에서 12:00-13:00 제거 → [{9:00-12:00}, {13:00-17:00}]
 */
function subtractTimeRange(
  ranges: { start: number; end: number }[],
  removeStart: number,
  removeEnd: number,
): { start: number; end: number }[] {
  const result: { start: number; end: number }[] = [];

  for (const range of ranges) {
    // 겹치지 않으면 그대로 유지
    if (range.end <= removeStart || range.start >= removeEnd) {
      result.push(range);
      continue;
    }

    // 앞부분 남음
    if (range.start < removeStart) {
      result.push({ start: range.start, end: removeStart });
    }

    // 뒷부분 남음
    if (range.end > removeEnd) {
      result.push({ start: removeEnd, end: range.end });
    }
  }

  return result;
}

/**
 * Date 객체를 YYYY-MM-DD 형식 문자열로 변환
 */
function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
