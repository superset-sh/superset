/**
 * Booking Admin REST Controller
 *
 * 시스템 관리자 전용 예약/상담사/상품/카테고리/환불정책 관리 엔드포인트
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
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
import { JwtAuthGuard, NestAdminGuard } from "../../../core/nestjs/auth";
import {
  CategoryService,
  ProviderService,
  SessionProductService,
  BookingService,
  RefundService,
} from "../service";
import type { z } from "zod";
import {
  type CreateCategoryDto,
  createCategorySchema,
  type UpdateCategoryDto,
  updateCategorySchema,
  type UpdateProviderStatusDto,
  updateProviderStatusSchema,
  type CreateSessionProductDto,
  createSessionProductSchema,
  type UpdateSessionProductDto,
  updateSessionProductSchema,
  type UpdateRefundPolicyDto,
  updateRefundPolicySchema,
} from "../dto";

@ApiTags("Booking Admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NestAdminGuard)
@Controller("admin/booking")
export class BookingAdminController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly providerService: ProviderService,
    private readonly sessionProductService: SessionProductService,
    private readonly bookingService: BookingService,
    private readonly refundService: RefundService,
  ) {}

  // ==========================================================================
  // 카테고리 관리
  // ==========================================================================

  @Get("categories")
  @ApiOperation({ summary: "카테고리 목록 (관리자용)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiResponse({ status: 200, description: "카테고리 목록 반환" })
  async categoryList(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("search") search?: string,
  ) {
    return this.categoryService.adminFindAll({ page, limit, search });
  }

  @Post("categories")
  @ApiOperation({ summary: "카테고리 생성" })
  @ApiResponse({ status: 201, description: "카테고리 생성 성공" })
  @ApiResponse({ status: 409, description: "슬러그 중복" })
  @ApiBody({ schema: { type: 'object', required: ['name', 'slug'], properties: { name: { type: 'string', maxLength: 100, description: '카테고리명' }, description: { type: 'string', description: '설명' }, slug: { type: 'string', maxLength: 100, description: 'URL slug' }, icon: { type: 'string', maxLength: 50, description: 'lucide 아이콘명' }, sortOrder: { type: 'integer', default: 0, description: '정렬 순서' } } } })
  async createCategory(@Body() dto: CreateCategoryDto) {
    const input = dto as unknown as z.infer<typeof createCategorySchema>;
    return this.categoryService.create(input);
  }

  @Patch("categories/:id")
  @ApiOperation({ summary: "카테고리 수정" })
  @ApiParam({ name: "id", description: "카테고리 ID" })
  @ApiResponse({ status: 200, description: "카테고리 수정 성공" })
  @ApiResponse({ status: 404, description: "카테고리를 찾을 수 없음" })
  @ApiResponse({ status: 409, description: "슬러그 중복" })
  async updateCategory(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const input = dto as unknown as z.infer<typeof updateCategorySchema>;
    return this.categoryService.update(id, input);
  }

  @Delete("categories/:id")
  @ApiOperation({ summary: "카테고리 삭제" })
  @ApiParam({ name: "id", description: "카테고리 ID" })
  @ApiResponse({ status: 200, description: "카테고리 삭제 성공" })
  @ApiResponse({ status: 404, description: "카테고리를 찾을 수 없음" })
  async deleteCategory(@Param("id", ParseUUIDPipe) id: string) {
    return this.categoryService.delete(id);
  }

  @Put("categories/reorder")
  @ApiOperation({ summary: "카테고리 정렬 순서 변경" })
  @ApiResponse({ status: 200, description: "정렬 순서 변경 성공" })
  @ApiBody({ schema: { type: 'array', items: { type: 'object', required: ['id', 'sortOrder'], properties: { id: { type: 'string', format: 'uuid', description: '카테고리 ID' }, sortOrder: { type: 'integer', description: '정렬 순서' } } } } })
  async reorderCategories(
    @Body() items: { id: string; sortOrder: number }[],
  ) {
    return this.categoryService.reorder(items);
  }

  // ==========================================================================
  // 상담사 관리
  // ==========================================================================

  @Get("providers")
  @ApiOperation({ summary: "상담사 목록 (관리자용)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "status", required: false, enum: ["active", "inactive", "suspended"] })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiResponse({ status: 200, description: "상담사 목록 반환" })
  async providerList(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("status") status?: string,
    @Query("search") search?: string,
  ) {
    return this.providerService.listProviders({ page, limit, status, search });
  }

  @Patch("providers/:id/status")
  @ApiOperation({ summary: "상담사 상태 변경" })
  @ApiParam({ name: "id", description: "상담사 ID" })
  @ApiResponse({ status: 200, description: "상담사 상태 변경 성공" })
  @ApiResponse({ status: 404, description: "상담사를 찾을 수 없음" })
  @ApiBody({ schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['active', 'inactive', 'suspended'], description: '상담사 상태' }, reason: { type: 'string', description: '상태 변경 사유' } } } })
  async updateProviderStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderStatusDto,
  ) {
    const input = dto as unknown as z.infer<typeof updateProviderStatusSchema>;
    return this.providerService.updateStatus(id, input, { isAdmin: true });
  }

  // ==========================================================================
  // 세션 상품 관리
  // ==========================================================================

  @Get("products")
  @ApiOperation({ summary: "세션 상품 목록 (관리자용)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiResponse({ status: 200, description: "세션 상품 목록 반환" })
  async productList(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("search") search?: string,
  ) {
    return this.sessionProductService.adminFindAll({ page, limit, search });
  }

  @Post("products")
  @ApiOperation({ summary: "세션 상품 생성" })
  @ApiResponse({ status: 201, description: "세션 상품 생성 성공" })
  @ApiBody({ schema: { type: 'object', required: ['name', 'durationMinutes', 'price'], properties: { name: { type: 'string', maxLength: 200, description: '상품명' }, description: { type: 'string', description: '상품 설명' }, durationMinutes: { type: 'integer', minimum: 15, maximum: 480, description: '상담 시간 (분)' }, price: { type: 'integer', minimum: 0, description: '가격' }, currency: { type: 'string', maxLength: 3, default: 'KRW', description: '통화' }, sortOrder: { type: 'integer', default: 0, description: '정렬 순서' } } } })
  async createProduct(@Body() dto: CreateSessionProductDto) {
    const input = dto as unknown as z.infer<typeof createSessionProductSchema>;
    return this.sessionProductService.create(input);
  }

  @Patch("products/:id")
  @ApiOperation({ summary: "세션 상품 수정" })
  @ApiParam({ name: "id", description: "상품 ID" })
  @ApiResponse({ status: 200, description: "세션 상품 수정 성공" })
  @ApiResponse({ status: 404, description: "상품을 찾을 수 없음" })
  async updateProduct(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionProductDto,
  ) {
    const input = dto as unknown as z.infer<typeof updateSessionProductSchema>;
    return this.sessionProductService.update(id, input);
  }

  @Delete("products/:id")
  @ApiOperation({ summary: "세션 상품 삭제" })
  @ApiParam({ name: "id", description: "상품 ID" })
  @ApiResponse({ status: 200, description: "세션 상품 삭제 성공" })
  @ApiResponse({ status: 404, description: "상품을 찾을 수 없음" })
  async deleteProduct(@Param("id", ParseUUIDPipe) id: string) {
    return this.sessionProductService.delete(id);
  }

  @Post("products/:id/toggle-status")
  @ApiOperation({ summary: "세션 상품 상태 토글 (active ↔ inactive)" })
  @ApiParam({ name: "id", description: "상품 ID" })
  @ApiResponse({ status: 200, description: "상태 토글 성공" })
  @ApiResponse({ status: 404, description: "상품을 찾을 수 없음" })
  async toggleProductStatus(@Param("id", ParseUUIDPipe) id: string) {
    return this.sessionProductService.toggleStatus(id);
  }

  // ==========================================================================
  // 예약 관리
  // ==========================================================================

  @Get("bookings")
  @ApiOperation({ summary: "전체 예약 목록 (관리자용)" })
  @ApiQuery({ name: "status", required: false, enum: ["pending_payment", "confirmed", "completed", "no_show", "cancelled_by_user", "cancelled_by_provider", "refunded", "expired"] })
  @ApiQuery({ name: "dateFrom", required: false, type: String, description: "시작 날짜 (YYYY-MM-DD)" })
  @ApiQuery({ name: "dateTo", required: false, type: String, description: "종료 날짜 (YYYY-MM-DD)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "전체 예약 목록 반환" })
  async bookingList(
    @Query("status") status?: "pending_payment" | "confirmed" | "completed" | "no_show" | "cancelled_by_user" | "cancelled_by_provider" | "refunded" | "expired",
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.bookingService.adminFindAll({
      status,
      dateFrom,
      dateTo,
      page: page ?? 1,
      limit: limit ?? 20,
    });
  }

  @Post("bookings/:id/force-cancel")
  @ApiOperation({ summary: "관리자 강제 취소" })
  @ApiParam({ name: "id", description: "예약 ID" })
  @ApiResponse({ status: 200, description: "강제 취소 성공" })
  @ApiResponse({ status: 400, description: "상태 전이 불가" })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string', description: '취소 사유' } } } })
  async forceCancel(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { reason?: string },
  ) {
    return this.bookingService.updateStatus(id, "cancelled_by_user", {
      cancellationReason: body.reason,
    });
  }

  @Post("bookings/:id/force-complete")
  @ApiOperation({ summary: "관리자 강제 완료" })
  @ApiParam({ name: "id", description: "예약 ID" })
  @ApiResponse({ status: 200, description: "강제 완료 성공" })
  @ApiResponse({ status: 400, description: "상태 전이 불가" })
  async forceComplete(@Param("id", ParseUUIDPipe) id: string) {
    return this.bookingService.completeSession(id);
  }

  @Post("bookings/:id/force-no-show")
  @ApiOperation({ summary: "관리자 강제 노쇼 처리" })
  @ApiParam({ name: "id", description: "예약 ID" })
  @ApiResponse({ status: 200, description: "강제 노쇼 처리 성공" })
  @ApiResponse({ status: 400, description: "상태 전이 불가" })
  async forceNoShow(@Param("id", ParseUUIDPipe) id: string) {
    return this.bookingService.markNoShow(id);
  }

  @Post("bookings/:id/force-refund")
  @ApiOperation({ summary: "관리자 강제 환불" })
  @ApiParam({ name: "id", description: "예약 ID" })
  @ApiResponse({ status: 200, description: "강제 환불 성공" })
  @ApiResponse({ status: 400, description: "환불 금액 유효하지 않음" })
  @ApiBody({ schema: { type: 'object', required: ['refundAmount'], properties: { refundAmount: { type: 'integer', minimum: 0, description: '환불 금액' } } } })
  async forceRefund(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { refundAmount: number },
  ) {
    return this.refundService.processAdminRefund(id, body.refundAmount);
  }

  // ==========================================================================
  // 환불 정책 관리
  // ==========================================================================

  @Get("refund-policies")
  @ApiOperation({ summary: "환불 정책 목록" })
  @ApiResponse({ status: 200, description: "환불 정책 목록 반환" })
  async refundPolicyList() {
    return this.refundService.findAllPolicies();
  }

  @Post("refund-policies")
  @ApiOperation({ summary: "환불 정책 생성" })
  @ApiResponse({ status: 201, description: "환불 정책 생성 성공" })
  @ApiBody({ schema: { type: 'object', required: ['name', 'rules', 'noShowRefundPercentage', 'providerCancelRefundPercentage'], properties: { name: { type: 'string', maxLength: 200, description: '정책명' }, rules: { type: 'array', items: { type: 'object', required: ['hours_before', 'refund_percentage'], properties: { hours_before: { type: 'integer', minimum: 0, description: '상담 시작 전 시간' }, refund_percentage: { type: 'integer', minimum: 0, maximum: 100, description: '환불 비율 (%)' } } }, description: '시간대별 환불 규칙' }, noShowRefundPercentage: { type: 'integer', minimum: 0, maximum: 100, description: '노쇼 시 환불 비율 (%)' }, providerCancelRefundPercentage: { type: 'integer', minimum: 0, maximum: 100, description: '상담사 취소 시 환불 비율 (%)' }, isActive: { type: 'boolean', description: '활성 여부' }, isDefault: { type: 'boolean', description: '기본 정책 여부' } } } })
  async createRefundPolicy(
    @Body() dto: UpdateRefundPolicyDto & { isDefault?: boolean },
  ) {
    const input = dto as unknown as z.infer<typeof updateRefundPolicySchema> & { isDefault?: boolean };
    return this.refundService.createPolicy(input);
  }

  @Patch("refund-policies/:id")
  @ApiOperation({ summary: "환불 정책 수정" })
  @ApiParam({ name: "id", description: "정책 ID" })
  @ApiResponse({ status: 200, description: "환불 정책 수정 성공" })
  @ApiResponse({ status: 404, description: "정책을 찾을 수 없음" })
  async updateRefundPolicy(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRefundPolicyDto & { isDefault?: boolean },
  ) {
    const input = dto as unknown as z.infer<typeof updateRefundPolicySchema> & { isDefault?: boolean };
    return this.refundService.updatePolicy(id, input);
  }

  @Delete("refund-policies/:id")
  @ApiOperation({ summary: "환불 정책 삭제" })
  @ApiParam({ name: "id", description: "정책 ID" })
  @ApiResponse({ status: 200, description: "환불 정책 삭제 성공" })
  @ApiResponse({ status: 400, description: "기본 정책은 삭제 불가" })
  @ApiResponse({ status: 404, description: "정책을 찾을 수 없음" })
  async deleteRefundPolicy(@Param("id", ParseUUIDPipe) id: string) {
    return this.refundService.deletePolicy(id);
  }

  // ==========================================================================
  // 통계
  // ==========================================================================

  @Get("stats")
  @ApiOperation({ summary: "Booking 시스템 통합 통계" })
  @ApiResponse({ status: 200, description: "통합 통계 반환" })
  async stats() {
    const [categories, providers, products, bookings] = await Promise.all([
      this.categoryService.adminFindAll({ page: 1, limit: 1 }),
      this.providerService.listProviders({ page: 1, limit: 1 }),
      this.sessionProductService.adminFindAll({ page: 1, limit: 1 }),
      this.bookingService.adminFindAll({ page: 1, limit: 1 }),
    ]);

    return {
      totalCategories: categories.total,
      totalProviders: providers.total,
      totalProducts: products.total,
      totalBookings: bookings.total,
    };
  }
}
