import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard, NestAdminGuard, CurrentUser, type User } from '../../../../core/nestjs/auth';
import { PaymentService } from '../../service/payment.service';
import { PaymentProviderFactory } from '../../provider/payment-provider.factory';
import { PlanService } from '../../service/plan.service';
import { CreditService } from '../../service/credit.service';
import { ModelPricingService } from '../../service/model-pricing.service';
import type {
  SubscriptionQueryDto,
  OrderQueryDto,
  LicenseQueryDto,
  RefundOrderDto,
  RefundSubscriptionDto,
} from '../../dto';

@ApiTags('Payment Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NestAdminGuard)
@Controller('admin/payment')
export class PaymentAdminController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly planService: PlanService,
    private readonly creditService: CreditService,
    private readonly modelPricingService: ModelPricingService,
  ) {}

  // ==========================================================================
  // 상품 동기화
  // ==========================================================================

  @Post('products/sync')
  @ApiOperation({ summary: '상품 동기화' })
  @ApiResponse({ status: 200, description: '상품 동기화 성공' })
  async syncProducts() {
    await this.paymentService.syncProducts();
    return { success: true, message: 'Products synced successfully' };
  }

  // ==========================================================================
  // 구독 관리
  // ==========================================================================

  @Get('subscriptions')
  @ApiOperation({ summary: '구독 목록 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: '구독 목록 반환' })
  async getSubscriptions(@Query() query: SubscriptionQueryDto) {
    return this.paymentService.getSubscriptions(query);
  }

  @Get('subscriptions/stats')
  @ApiOperation({ summary: '구독 통계 조회' })
  @ApiResponse({ status: 200, description: '구독 통계 반환' })
  async getSubscriptionStats() {
    return this.paymentService.getSubscriptionStats();
  }

  @Post('subscriptions/:id/refund')
  @ApiOperation({ summary: '구독 환불' })
  @ApiParam({ name: 'id', description: '구독 ID' })
  @ApiResponse({ status: 200, description: '구독 환불 성공' })
  @ApiBody({ schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', description: '환불 사유' } } } })
  async refundSubscription(
    @Param('id') subscriptionId: string,
    @Body() dto: RefundSubscriptionDto,
  ) {
    return this.paymentService.refundSubscription(subscriptionId, dto.reason);
  }

  // ==========================================================================
  // 주문 관리
  // ==========================================================================

  @Get('orders')
  @ApiOperation({ summary: '주문 목록 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: '주문 목록 반환' })
  async getOrders(@Query() query: OrderQueryDto) {
    return this.paymentService.getOrders(query);
  }

  @Post('orders/:id/refund')
  @ApiOperation({ summary: '주문 환불' })
  @ApiParam({ name: 'id', description: '주문 ID' })
  @ApiResponse({ status: 200, description: '주문 환불 성공' })
  @ApiBody({ schema: { type: 'object', properties: { amount: { type: 'integer', minimum: 1, description: '환불 금액 (cents, 미입력 시 전액 환불)' }, reason: { type: 'string', description: '환불 사유' } } } })
  async refundOrder(
    @Param('id') orderId: string,
    @Body() dto: RefundOrderDto,
  ) {
    return this.paymentService.refundOrder(orderId, dto.amount, dto.reason);
  }

  // ==========================================================================
  // 라이선스 관리
  // ==========================================================================

  @Get('licenses')
  @ApiOperation({ summary: '라이선스 목록 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: '라이선스 목록 반환' })
  async getLicenses(@Query() query: LicenseQueryDto) {
    return this.paymentService.getLicenses(query);
  }

  @Get('refunds')
  @ApiOperation({ summary: '환불 요청 목록 조회' })
  @ApiResponse({ status: 200, description: '환불 요청 목록 반환' })
  async getRefundRequests() {
    return this.paymentService.getRefundRequests();
  }

  @Post('refund-requests/:requestId/process')
  @ApiOperation({ summary: '[Admin] 환불 요청 처리 (승인/거절)' })
  @ApiParam({ name: 'requestId', description: '환불 요청 ID (UUID)' })
  @ApiResponse({ status: 200, description: '환불 요청 처리 성공' })
  @ApiResponse({ status: 404, description: '환불 요청을 찾을 수 없음' })
  @ApiResponse({ status: 400, description: '이미 처리된 요청' })
  @ApiBody({ schema: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['approve', 'reject'], description: '처리 액션' }, adminNote: { type: 'string', maxLength: 500, description: 'Admin 메모' } } } })
  async processRefundRequest(
    @CurrentUser() user: User,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() body: { action: 'approve' | 'reject'; adminNote?: string },
  ) {
    return this.paymentService.adminProcessRefundRequest(user.id, {
      requestId,
      action: body.action,
      adminNote: body.adminNote,
    });
  }

  // ==========================================================================
  // 플랜 관리
  // ==========================================================================

  @Post('plans/sync')
  @ApiOperation({ summary: '결제 프로바이더 상품 → 플랜 동기화' })
  @ApiResponse({ status: 200, description: '플랜 동기화 결과 반환' })
  async syncPlans() {
    const result = await this.planService.syncPlansFromProvider(this.providerFactory.getActive());
    return { success: true, ...result };
  }

  @Post('plans/push')
  @ApiOperation({ summary: 'DB 플랜 → 프로바이더 동기화 (Push)' })
  @ApiResponse({ status: 200, description: 'DB→프로바이더 동기화 결과 반환' })
  async pushPlansToProvider() {
    const result = await this.planService.pushPlansToProvider(this.providerFactory.getActive());
    return { success: true, ...result };
  }

  @Get('plans')
  @ApiOperation({ summary: '전체 플랜 목록 조회 (비활성 포함)' })
  @ApiResponse({ status: 200, description: '플랜 목록 반환' })
  async getAllPlans() {
    return this.planService.getPlans();
  }

  @Post('plans')
  @ApiOperation({ summary: '플랜 생성' })
  @ApiResponse({ status: 201, description: '플랜 생성 성공' })
  @ApiBody({ schema: { type: 'object', required: ['name', 'slug', 'tier', 'monthlyCredits'], properties: { name: { type: 'string', description: '플랜 이름' }, slug: { type: 'string', description: '플랜 슬러그' }, description: { type: 'string', description: '플랜 설명' }, tier: { type: 'string', enum: ['free', 'pro', 'team', 'enterprise'], description: '플랜 등급' }, monthlyCredits: { type: 'number', description: '월간 크레딧' }, price: { type: 'number', description: '가격' }, currency: { type: 'string', description: '통화' }, interval: { type: 'string', description: '결제 주기' }, providerProductId: { type: 'string', description: '프로바이더 상품 ID' }, providerVariantId: { type: 'string', description: '프로바이더 변형 ID' }, features: { type: 'array', items: { type: 'string' }, description: '플랜 기능 목록' }, isActive: { type: 'boolean', description: '활성 여부' }, sortOrder: { type: 'number', description: '정렬 순서' } } } })
  async createPlan(
    @Body() dto: {
      name: string;
      slug: string;
      description?: string;
      tier: 'free' | 'pro' | 'team' | 'enterprise';
      monthlyCredits: number;
      price?: number;
      currency?: string;
      interval?: string;
      providerProductId?: string;
      providerVariantId?: string;
      features?: string[];
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.planService.createPlan(dto);
  }

  @Post('plans/:id')
  @ApiOperation({ summary: '플랜 수정' })
  @ApiParam({ name: 'id', description: '플랜 ID' })
  @ApiResponse({ status: 200, description: '플랜 수정 성공' })
  @ApiBody({ schema: { type: 'object', description: '플랜 수정 필드', properties: { name: { type: 'string', description: '플랜 이름' }, description: { type: 'string', description: '플랜 설명' }, monthlyCredits: { type: 'number', description: '월간 크레딧' }, price: { type: 'number', description: '가격' }, features: { type: 'array', items: { type: 'string' }, description: '플랜 기능 목록' }, isActive: { type: 'boolean', description: '활성 여부' }, sortOrder: { type: 'number', description: '정렬 순서' } } } })
  async updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.planService.updatePlan(id, dto);
  }

  @Post('plans/assign')
  @ApiOperation({ summary: '사용자에게 플랜 할당' })
  @ApiResponse({ status: 200, description: '플랜 할당 성공' })
  @ApiBody({ schema: { type: 'object', required: ['userId', 'planId'], properties: { userId: { type: 'string', format: 'uuid', description: '사용자 ID' }, planId: { type: 'string', format: 'uuid', description: '플랜 ID' } } } })
  async assignPlan(
    @Body() dto: { userId: string; planId: string },
  ) {
    return this.planService.assignPlanToUser(dto.userId, dto.planId);
  }

  // ==========================================================================
  // 크레딧 관리
  // ==========================================================================

  @Get('credits/:userId')
  @ApiOperation({ summary: '특정 사용자 크레딧 잔액 조회' })
  @ApiParam({ name: 'userId', description: '사용자 ID' })
  @ApiResponse({ status: 200, description: '크레딧 잔액 반환' })
  async getUserCredits(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.creditService.getBalance(userId);
  }

  @Get('credits/:userId/transactions')
  @ApiOperation({ summary: '특정 사용자 트랜잭션 내역 조회' })
  @ApiParam({ name: 'userId', description: '사용자 ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: '트랜잭션 내역 반환' })
  async getUserTransactions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.creditService.getTransactions(userId, { page, limit });
  }

  @Post('credits/adjust')
  @ApiOperation({ summary: '관리자 수동 크레딧 조정' })
  @ApiResponse({ status: 200, description: '크레딧 조정 성공' })
  @ApiBody({ schema: { type: 'object', required: ['userId', 'amount', 'reason'], properties: { userId: { type: 'string', format: 'uuid', description: '사용자 ID' }, amount: { type: 'number', description: '조정 크레딧 수 (양수=추가, 음수=차감)' }, reason: { type: 'string', description: '조정 사유' } } } })
  async adjustCredits(
    @Body() dto: { userId: string; amount: number; reason: string },
  ) {
    return this.creditService.adjustBalance(dto.userId, dto.amount, dto.reason);
  }

  // ==========================================================================
  // 구독자 관리
  // ==========================================================================

  @Get('subscribers')
  @ApiOperation({ summary: '구독자 목록 조회' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'planName', required: false, type: String })
  @ApiResponse({ status: 200, description: '구독자 목록 반환' })
  async getSubscribers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('planName') planName?: string,
  ) {
    return this.paymentService.getSubscribers({ page, limit, search, status, planName });
  }

  // ==========================================================================
  // 모델 가격 관리
  // ==========================================================================

  @Get('model-pricing')
  @ApiOperation({ summary: '모델 가격 목록 조회' })
  @ApiResponse({ status: 200, description: '모델 가격 목록 반환' })
  async getModelPricing() {
    return this.modelPricingService.getPricingList();
  }

  @Post('model-pricing')
  @ApiOperation({ summary: '모델 가격 생성/수정 (upsert)' })
  @ApiResponse({ status: 200, description: '모델 가격 저장 성공' })
  @ApiBody({ schema: { type: 'object', required: ['modelId', 'provider', 'displayName', 'inputCreditsPerKToken', 'outputCreditsPerKToken'], properties: { modelId: { type: 'string', description: '모델 ID' }, provider: { type: 'string', description: '제공자' }, displayName: { type: 'string', description: '표시 이름' }, inputCreditsPerKToken: { type: 'number', description: '입력 1K 토큰당 크레딧' }, outputCreditsPerKToken: { type: 'number', description: '출력 1K 토큰당 크레딧' }, isActive: { type: 'boolean', description: '활성 여부' } } } })
  async upsertModelPricing(
    @Body() dto: {
      modelId: string;
      provider: string;
      displayName: string;
      inputCreditsPerKToken: number;
      outputCreditsPerKToken: number;
      isActive?: boolean;
    },
  ) {
    return this.modelPricingService.upsertPricing(dto);
  }
}
