/**
 * Booking REST Controller
 *
 * 예약, 상담사, 상품, 가용시간, 매칭 공개/인증 엔드포인트
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  NotFoundException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from "@nestjs/swagger";
import { JwtAuthGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import {
  CategoryService,
  ProviderService,
  SessionProductService,
  AvailabilityService,
  BookingService,
  MatchingService,
  RefundService,
} from "../service";
import type { z } from "zod";
import {
  type CreateBookingDto,
  createBookingSchema,
  type CancelBookingDto,
  cancelBookingSchema,
  type CreateProviderDto,
  createProviderSchema,
  type UpdateProviderProfileDto,
  updateProviderProfileSchema,
  type UpdateWeeklyScheduleDto,
  updateWeeklyScheduleSchema,
  type CreateScheduleOverrideDto,
  createScheduleOverrideSchema,
} from "../dto";

@ApiTags("Booking")
@Controller("booking")
export class BookingController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly providerService: ProviderService,
    private readonly sessionProductService: SessionProductService,
    private readonly availabilityService: AvailabilityService,
    private readonly bookingService: BookingService,
    private readonly matchingService: MatchingService,
    private readonly refundService: RefundService,
  ) {}

  // ==========================================================================
  // 카테고리 — Public
  // ==========================================================================

  @Get("categories")
  @ApiOperation({ summary: "카테고리 목록 조회" })
  @ApiResponse({ status: 200, description: "카테고리 목록" })
  async categories() {
    return this.categoryService.findAll();
  }

  // ==========================================================================
  // 상담사 — Public
  // ==========================================================================

  @Get("providers")
  @ApiOperation({ summary: "활성 상담사 목록 조회" })
  @ApiResponse({ status: 200, description: "활성 상담사 목록" })
  async providerList() {
    return this.providerService.getActiveProviders();
  }

  @Get("providers/:id")
  @ApiOperation({ summary: "상담사 상세 조회" })
  @ApiParam({ name: "id", description: "상담사 ID" })
  @ApiResponse({ status: 200, description: "상담사 상세 정보" })
  @ApiResponse({ status: 404, description: "상담사를 찾을 수 없음" })
  async providerById(@Param("id", ParseUUIDPipe) id: string) {
    return this.providerService.getProviderWithDetails(id);
  }

  @Get("providers/:id/slots")
  @ApiOperation({ summary: "상담사 가용 슬롯 조회" })
  @ApiParam({ name: "id", description: "상담사 ID" })
  @ApiQuery({ name: "date", required: true, type: String, description: "조회 날짜 (YYYY-MM-DD)" })
  @ApiQuery({ name: "durationMinutes", required: true, type: Number, description: "세션 시간 (분)" })
  @ApiResponse({ status: 200, description: "가용 슬롯 목록" })
  async providerSlots(
    @Param("id", ParseUUIDPipe) providerId: string,
    @Query("date") date: string,
    @Query("durationMinutes", ParseIntPipe) durationMinutes: number,
  ) {
    return this.availabilityService.getAvailableSlots(
      providerId,
      date,
      durationMinutes,
    );
  }

  // ==========================================================================
  // 세션 상품 — Public
  // ==========================================================================

  @Get("products")
  @ApiOperation({ summary: "세션 상품 목록 조회" })
  @ApiResponse({ status: 200, description: "활성 세션 상품 목록" })
  async products() {
    return this.sessionProductService.findAll();
  }

  // ==========================================================================
  // 검색/매칭 — Public
  // ==========================================================================

  @Get("search")
  @ApiOperation({ summary: "상담사 검색" })
  @ApiQuery({ name: "categoryId", required: false, type: String, description: "카테고리 ID" })
  @ApiQuery({ name: "budgetMax", required: false, type: Number, description: "최대 예산" })
  @ApiQuery({ name: "language", required: false, type: String, description: "언어 필터" })
  @ApiQuery({ name: "mode", required: false, enum: ["online", "offline", "hybrid"], description: "상담 방식" })
  @ApiQuery({ name: "keyword", required: false, type: String, description: "검색어 (이름, 소개)" })
  @ApiQuery({ name: "date", required: false, type: String, description: "가용 날짜 (YYYY-MM-DD)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "상담사 검색 결과" })
  async search(
    @Query("categoryId") categoryId?: string,
    @Query("budgetMax") budgetMax?: string,
    @Query("language") language?: string,
    @Query("mode") mode?: "online" | "offline" | "hybrid",
    @Query("keyword") keyword?: string,
    @Query("date") date?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.matchingService.searchProviders({
      categoryId,
      budgetMax: budgetMax ? Number(budgetMax) : undefined,
      language,
      mode,
      keyword,
      date,
      page: page ?? 1,
      limit: limit ?? 20,
    });
  }

  @Get("match")
  @ApiOperation({ summary: "상담사 매칭 추천" })
  @ApiQuery({ name: "categoryId", required: false, type: String, description: "카테고리 ID" })
  @ApiQuery({ name: "budgetMax", required: false, type: Number, description: "최대 예산" })
  @ApiQuery({ name: "language", required: false, type: String, description: "언어 필터" })
  @ApiQuery({ name: "mode", required: false, enum: ["online", "offline", "hybrid"], description: "상담 방식" })
  @ApiQuery({ name: "keyword", required: false, type: String, description: "검색어 (이름, 소개)" })
  @ApiQuery({ name: "date", required: false, type: String, description: "가용 날짜 (YYYY-MM-DD)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "매칭 추천 결과 (점수 내림차순)" })
  async match(
    @Query("categoryId") categoryId?: string,
    @Query("budgetMax") budgetMax?: string,
    @Query("language") language?: string,
    @Query("mode") mode?: "online" | "offline" | "hybrid",
    @Query("keyword") keyword?: string,
    @Query("date") date?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.matchingService.getMatchResults({
      categoryId,
      budgetMax: budgetMax ? Number(budgetMax) : undefined,
      language,
      mode,
      keyword,
      date,
      page: page ?? 1,
      limit: limit ?? 20,
    });
  }

  // ==========================================================================
  // 예약 — Auth
  // ==========================================================================

  @Post("bookings")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "예약 생성" })
  @ApiResponse({ status: 201, description: "예약 생성 성공" })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  @ApiResponse({ status: 404, description: "상담사/상품을 찾을 수 없음" })
  @ApiResponse({ status: 409, description: "슬롯 충돌" })
  @ApiBody({ schema: { type: 'object', required: ['providerId', 'productId', 'sessionDate', 'startTime', 'consultationMode'], properties: { providerId: { type: 'string', format: 'uuid', description: '상담사 ID' }, productId: { type: 'string', format: 'uuid', description: '상품 ID' }, sessionDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: '상담 날짜 (YYYY-MM-DD)' }, startTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$', description: '시작 시간 (HH:MM)' }, consultationMode: { type: 'string', enum: ['online', 'offline', 'hybrid'], description: '상담 방식' } } } })
  async createBooking(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: User,
  ) {
    const input = dto as unknown as z.infer<typeof createBookingSchema>;
    return this.bookingService.create(user.id, input);
  }

  @Get("bookings/mine")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "내 예약 목록 조회" })
  @ApiQuery({ name: "status", required: false, enum: ["pending_payment", "confirmed", "completed", "no_show", "cancelled_by_user", "cancelled_by_provider", "refunded", "expired"], description: "예약 상태 필터" })
  @ApiQuery({ name: "dateFrom", required: false, type: String, description: "시작 날짜 (YYYY-MM-DD)" })
  @ApiQuery({ name: "dateTo", required: false, type: String, description: "종료 날짜 (YYYY-MM-DD)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "내 예약 목록" })
  async myBookings(
    @CurrentUser() user: User,
    @Query("status") status?: "pending_payment" | "confirmed" | "completed" | "no_show" | "cancelled_by_user" | "cancelled_by_provider" | "refunded" | "expired",
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.bookingService.getCustomerBookings(user.id, {
      status,
      dateFrom,
      dateTo,
      page: page ?? 1,
      limit: limit ?? 20,
    });
  }

  @Get("bookings/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "예약 상세 조회" })
  @ApiParam({ name: "id", description: "예약 ID" })
  @ApiResponse({ status: 200, description: "예약 상세 정보" })
  @ApiResponse({ status: 404, description: "예약을 찾을 수 없음" })
  async bookingById(@Param("id", ParseUUIDPipe) id: string) {
    return this.bookingService.getBookingWithDetails(id);
  }

  @Post("bookings/:id/cancel")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "예약 취소" })
  @ApiParam({ name: "id", description: "예약 ID" })
  @ApiResponse({ status: 200, description: "예약 취소 성공" })
  @ApiResponse({ status: 400, description: "취소 불가 상태" })
  @ApiResponse({ status: 403, description: "본인 예약이 아님" })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string', description: '취소 사유' } } } })
  async cancelBooking(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: User,
  ) {
    const input = dto as unknown as z.infer<typeof cancelBookingSchema>;
    return this.refundService.processCustomerCancellation(
      id,
      user.id,
      input.reason,
    );
  }

  @Get("bookings/:id/refund-preview")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "환불 미리보기" })
  @ApiParam({ name: "id", description: "예약 ID" })
  @ApiResponse({ status: 200, description: "환불 미리보기 정보" })
  @ApiResponse({ status: 400, description: "환불 불가 상태" })
  async refundPreview(@Param("id", ParseUUIDPipe) id: string) {
    return this.refundService.getRefundPreview(id);
  }

  @Post("bookings/:id/confirm-payment")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "결제 확인" })
  @ApiParam({ name: "id", description: "예약 ID" })
  @ApiResponse({ status: 200, description: "결제 확인 성공" })
  @ApiResponse({ status: 400, description: "결제 확인 불가 상태" })
  @ApiBody({ schema: { type: 'object', required: ['paymentReference'], properties: { paymentReference: { type: 'string', description: '결제 참조 번호' } } } })
  async confirmPayment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { paymentReference: string },
  ) {
    return this.bookingService.confirmPayment(id, body.paymentReference);
  }

  // ==========================================================================
  // 상담사 프로필 — Auth
  // ==========================================================================

  @Post("provider/register")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "상담사 등록" })
  @ApiResponse({ status: 201, description: "상담사 등록 성공" })
  @ApiResponse({ status: 409, description: "이미 등록된 상담사" })
  @ApiBody({ schema: { type: 'object', required: ['categoryIds'], properties: { bio: { type: 'string', description: '자기소개' }, experienceYears: { type: 'integer', minimum: 0, description: '경력 연수' }, consultationMode: { type: 'string', enum: ['online', 'offline', 'hybrid'], default: 'online', description: '상담 방식' }, languages: { type: 'array', items: { type: 'string' }, default: ['ko'], description: '사용 가능 언어' }, categoryIds: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1, description: '카테고리 ID 배열' } } } })
  async registerProvider(
    @Body() dto: CreateProviderDto,
    @CurrentUser() user: User,
  ) {
    const input = dto as unknown as z.infer<typeof createProviderSchema>;
    return this.providerService.register(user.id, input);
  }

  @Get("provider/me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "내 상담사 프로필" })
  @ApiResponse({ status: 200, description: "상담사 프로필 정보" })
  @ApiResponse({ status: 404, description: "상담사 프로필을 찾을 수 없음" })
  async myProviderProfile(@CurrentUser() user: User) {
    return this.providerService.getMyProfile(user.id);
  }

  @Patch("provider/me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "상담사 프로필 수정" })
  @ApiResponse({ status: 200, description: "상담사 프로필 수정 성공" })
  @ApiResponse({ status: 404, description: "상담사 프로필을 찾을 수 없음" })
  @ApiBody({ schema: { type: 'object', properties: { bio: { type: 'string', description: '자기소개' }, experienceYears: { type: 'integer', minimum: 0, description: '경력 연수' }, consultationMode: { type: 'string', enum: ['online', 'offline', 'hybrid'], description: '상담 방식' }, languages: { type: 'array', items: { type: 'string' }, description: '사용 가능 언어' }, categoryIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: '카테고리 ID 배열' } } } })
  async updateMyProviderProfile(
    @Body() dto: UpdateProviderProfileDto,
    @CurrentUser() user: User,
  ) {
    const input = dto as unknown as z.infer<typeof updateProviderProfileSchema>;
    return this.providerService.updateProfile(user.id, input);
  }

  // ==========================================================================
  // 상담사 예약 관리 — Auth
  // ==========================================================================

  @Get("provider/bookings")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "상담사 예약 목록" })
  @ApiQuery({ name: "status", required: false, enum: ["pending_payment", "confirmed", "completed", "no_show", "cancelled_by_user", "cancelled_by_provider", "refunded", "expired"], description: "예약 상태 필터" })
  @ApiQuery({ name: "dateFrom", required: false, type: String, description: "시작 날짜 (YYYY-MM-DD)" })
  @ApiQuery({ name: "dateTo", required: false, type: String, description: "종료 날짜 (YYYY-MM-DD)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "상담사 예약 목록" })
  @ApiResponse({ status: 404, description: "상담사 프로필을 찾을 수 없음" })
  async providerBookings(
    @CurrentUser() user: User,
    @Query("status") status?: "pending_payment" | "confirmed" | "completed" | "no_show" | "cancelled_by_user" | "cancelled_by_provider" | "refunded" | "expired",
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    // 현재 유저의 상담사 프로필에서 providerId 확인
    const profile = await this.providerService.getMyProfile(user.id);
    if (!profile) {
      throw new NotFoundException("상담사 프로필을 찾을 수 없습니다");
    }
    return this.bookingService.getProviderBookings(profile.id, {
      status,
      dateFrom,
      dateTo,
      page: page ?? 1,
      limit: limit ?? 20,
    });
  }

  @Post("provider/bookings/:id/complete")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "세션 완료 처리" })
  @ApiParam({ name: "id", description: "예약 ID" })
  @ApiResponse({ status: 200, description: "세션 완료 처리 성공" })
  @ApiResponse({ status: 400, description: "상태 전이 불가" })
  async completeSession(@Param("id", ParseUUIDPipe) id: string) {
    return this.bookingService.completeSession(id);
  }

  @Post("provider/bookings/:id/no-show")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "노쇼 처리" })
  @ApiParam({ name: "id", description: "예약 ID" })
  @ApiResponse({ status: 200, description: "노쇼 처리 성공" })
  @ApiResponse({ status: 400, description: "상태 전이 불가" })
  async markNoShow(@Param("id", ParseUUIDPipe) id: string) {
    return this.bookingService.markNoShow(id);
  }

  @Post("provider/bookings/:id/cancel")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "상담사 예약 취소" })
  @ApiParam({ name: "id", description: "예약 ID" })
  @ApiResponse({ status: 200, description: "상담사 예약 취소 성공" })
  @ApiResponse({ status: 400, description: "취소 불가 상태" })
  @ApiResponse({ status: 403, description: "본인 예약이 아님" })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string', description: '취소 사유' } } } })
  async providerCancelBooking(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: User,
  ) {
    // 현재 유저의 상담사 프로필에서 providerId 확인
    const profile = await this.providerService.getMyProfile(user.id);
    if (!profile) {
      throw new NotFoundException("상담사 프로필을 찾을 수 없습니다");
    }
    return this.refundService.processProviderCancellation(
      id,
      profile.id,
      body.reason,
    );
  }

  // ==========================================================================
  // 상담사 스케줄 — Auth
  // ==========================================================================

  @Get("provider/schedule")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "주간 스케줄 조회" })
  @ApiResponse({ status: 200, description: "주간 스케줄 목록" })
  @ApiResponse({ status: 404, description: "상담사 프로필을 찾을 수 없음" })
  async getProviderSchedule(@CurrentUser() user: User) {
    const profile = await this.providerService.getMyProfile(user.id);
    if (!profile) {
      throw new NotFoundException("상담사 프로필을 찾을 수 없습니다");
    }
    return this.availabilityService.getWeeklySchedule(profile.id);
  }

  @Put("provider/schedule")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "주간 스케줄 수정" })
  @ApiResponse({ status: 200, description: "주간 스케줄 수정 성공" })
  @ApiResponse({ status: 404, description: "상담사 프로필을 찾을 수 없음" })
  @ApiBody({ schema: { type: 'object', required: ['schedules'], properties: { schedules: { type: 'array', items: { type: 'object', required: ['dayOfWeek', 'startTime', 'endTime', 'isActive'], properties: { dayOfWeek: { type: 'integer', minimum: 0, maximum: 6, description: '요일 (0=일 ~ 6=토)' }, startTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$', description: '시작 시간 (HH:MM)' }, endTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$', description: '종료 시간 (HH:MM)' }, isActive: { type: 'boolean', description: '활성 여부' } } }, description: '주간 스케줄 배열' } } } })
  async updateProviderSchedule(
    @Body() dto: UpdateWeeklyScheduleDto,
    @CurrentUser() user: User,
  ) {
    const profile = await this.providerService.getMyProfile(user.id);
    if (!profile) {
      throw new NotFoundException("상담사 프로필을 찾을 수 없습니다");
    }
    const input = dto as unknown as z.infer<typeof updateWeeklyScheduleSchema>;
    return this.availabilityService.updateWeeklySchedule(profile.id, input);
  }

  @Get("provider/overrides")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "스케줄 오버라이드 조회" })
  @ApiQuery({ name: "dateFrom", required: true, type: String, description: "시작 날짜 (YYYY-MM-DD)" })
  @ApiQuery({ name: "dateTo", required: true, type: String, description: "종료 날짜 (YYYY-MM-DD)" })
  @ApiResponse({ status: 200, description: "스케줄 오버라이드 목록" })
  @ApiResponse({ status: 404, description: "상담사 프로필을 찾을 수 없음" })
  async getProviderOverrides(
    @CurrentUser() user: User,
    @Query("dateFrom") dateFrom: string,
    @Query("dateTo") dateTo: string,
  ) {
    const profile = await this.providerService.getMyProfile(user.id);
    if (!profile) {
      throw new NotFoundException("상담사 프로필을 찾을 수 없습니다");
    }
    return this.availabilityService.getOverrides(profile.id, dateFrom, dateTo);
  }

  @Post("provider/overrides")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "스케줄 오버라이드 생성" })
  @ApiResponse({ status: 201, description: "스케줄 오버라이드 생성 성공" })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  @ApiResponse({ status: 404, description: "상담사 프로필을 찾을 수 없음" })
  @ApiBody({ schema: { type: 'object', required: ['date', 'overrideType'], properties: { date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: '적용 날짜 (YYYY-MM-DD)' }, overrideType: { type: 'string', enum: ['unavailable', 'available'], description: '오버라이드 유형' }, startTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$', description: '시작 시간 (available 시 필수)' }, endTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$', description: '종료 시간 (available 시 필수)' }, reason: { type: 'string', description: '사유' } } } })
  async createProviderOverride(
    @Body() dto: CreateScheduleOverrideDto,
    @CurrentUser() user: User,
  ) {
    const profile = await this.providerService.getMyProfile(user.id);
    if (!profile) {
      throw new NotFoundException("상담사 프로필을 찾을 수 없습니다");
    }
    const input = dto as unknown as z.infer<typeof createScheduleOverrideSchema>;
    return this.availabilityService.createOverride(profile.id, input);
  }

  @Delete("provider/overrides/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "스케줄 오버라이드 삭제" })
  @ApiParam({ name: "id", description: "오버라이드 ID" })
  @ApiResponse({ status: 200, description: "스케줄 오버라이드 삭제 성공" })
  @ApiResponse({ status: 404, description: "오버라이드를 찾을 수 없음" })
  async deleteProviderOverride(
    @Param("id", ParseUUIDPipe) overrideId: string,
    @CurrentUser() user: User,
  ) {
    const profile = await this.providerService.getMyProfile(user.id);
    if (!profile) {
      throw new NotFoundException("상담사 프로필을 찾을 수 없습니다");
    }
    return this.availabilityService.deleteOverride(overrideId, profile.id);
  }

  // ==========================================================================
  // 상담사 상품 관리 — Auth
  // ==========================================================================

  @Get("provider/products")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "내 활성 상품 목록" })
  @ApiResponse({ status: 200, description: "상담사의 활성 상품 목록" })
  @ApiResponse({ status: 404, description: "상담사 프로필을 찾을 수 없음" })
  async providerProducts(@CurrentUser() user: User) {
    const profile = await this.providerService.getMyProfile(user.id);
    if (!profile) {
      throw new NotFoundException("상담사 프로필을 찾을 수 없습니다");
    }
    return this.sessionProductService.getProviderProducts(profile.id);
  }

  @Post("provider/products/:productId/activate")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "상품 활성화" })
  @ApiParam({ name: "productId", description: "상품 ID" })
  @ApiResponse({ status: 200, description: "상품 활성화 성공" })
  @ApiResponse({ status: 404, description: "상품을 찾을 수 없음" })
  @ApiResponse({ status: 409, description: "이미 활성화된 상품" })
  async activateProduct(
    @Param("productId", ParseUUIDPipe) productId: string,
    @CurrentUser() user: User,
  ) {
    const profile = await this.providerService.getMyProfile(user.id);
    if (!profile) {
      throw new NotFoundException("상담사 프로필을 찾을 수 없습니다");
    }
    return this.sessionProductService.activateForProvider(
      profile.id,
      productId,
    );
  }

  @Post("provider/products/:productId/deactivate")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "상품 비활성화" })
  @ApiParam({ name: "productId", description: "상품 ID" })
  @ApiResponse({ status: 200, description: "상품 비활성화 성공" })
  @ApiResponse({ status: 404, description: "상품이 연결되어 있지 않음" })
  @ApiResponse({ status: 409, description: "이미 비활성화된 상품" })
  async deactivateProduct(
    @Param("productId", ParseUUIDPipe) productId: string,
    @CurrentUser() user: User,
  ) {
    const profile = await this.providerService.getMyProfile(user.id);
    if (!profile) {
      throw new NotFoundException("상담사 프로필을 찾을 수 없습니다");
    }
    return this.sessionProductService.deactivateForProvider(
      profile.id,
      productId,
    );
  }
}
