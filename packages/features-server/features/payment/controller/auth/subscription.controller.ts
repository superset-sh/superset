import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  DefaultValuePipe,
  ParseIntPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, type User } from '../../../../core/nestjs/auth';
import { PaymentService } from '../../service/payment.service';
import { PaymentProviderFactory } from '../../provider/payment-provider.factory';
import { CreditService } from '../../service/credit.service';
import { PlanService } from '../../service/plan.service';
import type {
  UpdateSubscriptionDto,
  CancelSubscriptionDto,
  ValidateLicenseDto,
  RequestRefundInput,
} from '../../dto';

@ApiTags('Payment Subscription')
@ApiBearerAuth()
@Controller('auth/subscription')
export class SubscriptionController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly creditService: CreditService,
    private readonly planService: PlanService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('my')
  @ApiOperation({ summary: '내 구독 정보 조회' })
  @ApiResponse({ status: 200, description: '구독 정보 반환' })
  async getMySubscription(@CurrentUser() user: User) {
    return this.paymentService.getUserSubscription(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiOperation({ summary: '구독 수정' })
  @ApiParam({ name: 'id', description: '구독 외부 ID' })
  @ApiResponse({ status: 200, description: '구독 수정 성공' })
  @ApiResponse({ status: 404, description: '구독을 찾을 수 없음' })
  @ApiBody({ schema: { type: 'object', properties: { variantId: { type: 'string', description: '변경할 변형 ID' }, pause: { type: 'boolean', description: '구독 일시정지' }, invoiceImmediately: { type: 'boolean', description: '즉시 청구' } } } })
  async updateSubscription(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser() user: User,
  ) {
    const subscription = await this.paymentService.getUserSubscription(user.id);

    if (!subscription || subscription.externalId !== id) {
      throw new ForbiddenException('Subscription not found or unauthorized');
    }

    return this.providerFactory.getActive().updateSubscription(
      id,
      dto as unknown as Record<string, unknown>,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/cancel')
  @ApiOperation({ summary: '구독 취소' })
  @ApiParam({ name: 'id', description: '구독 외부 ID' })
  @ApiResponse({ status: 200, description: '구독 취소 성공' })
  @ApiResponse({ status: 404, description: '구독을 찾을 수 없음' })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string', description: '취소 사유' } } } })
  async cancelSubscription(
    @Param('id') id: string,
    @Body() _dto: CancelSubscriptionDto,
    @CurrentUser() user: User,
  ) {
    const subscription = await this.paymentService.getUserSubscription(user.id);

    if (!subscription || subscription.externalId !== id) {
      throw new ForbiddenException('Subscription not found or unauthorized');
    }

    // 이미 취소/만료된 구독은 재취소 불가
    if (subscription.status === 'cancelled' || subscription.status === 'expired') {
      throw new BadRequestException('이미 취소되었거나 만료된 구독입니다');
    }

    return this.providerFactory.getActive().cancelSubscription(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-plan')
  @ApiOperation({ summary: '플랜 변경 (업그레이드/다운그레이드)' })
  @ApiResponse({ status: 200, description: '플랜 변경 성공' })
  @ApiResponse({ status: 404, description: '활성 구독이 없음' })
  @ApiResponse({ status: 400, description: '해당 플랜으로 변경 불가' })
  @ApiBody({ schema: { type: 'object', required: ['targetPlanId'], properties: { targetPlanId: { type: 'string', format: 'uuid', description: '변경할 플랜 ID' } } } })
  async changePlan(
    @Body() dto: { targetPlanId: string },
    @CurrentUser() user: User,
  ) {
    const subscription = await this.paymentService.getUserSubscription(user.id);
    if (!subscription || !subscription.externalId) {
      throw new NotFoundException('활성 구독이 없습니다');
    }

    const targetPlan = await this.planService.getPlanById(dto.targetPlanId);
    if (!targetPlan.providerVariantId) {
      throw new BadRequestException('해당 플랜으로 변경할 수 없습니다');
    }

    await this.providerFactory.getActive().updateSubscription(subscription.externalId, {
      variant_id: targetPlan.providerVariantId,
    });

    await this.planService.assignPlanToUser(user.id, targetPlan.id);

    return { success: true, planName: targetPlan.name };
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders')
  @ApiOperation({ summary: '내 주문(결제) 내역 조회' })
  @ApiResponse({ status: 200, description: '주문 내역 반환' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMyOrders(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.paymentService.getOrders({ page, limit, status: 'all', userId: user.id });
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/:orderId/refundable')
  @ApiOperation({ summary: '주문 환불 가능 여부 확인' })
  @ApiParam({ name: 'orderId', description: '주문 ID (UUID)' })
  @ApiResponse({ status: 200, description: '환불 가능 여부 반환' })
  @ApiResponse({ status: 404, description: '주문을 찾을 수 없음' })
  async checkRefundable(
    @CurrentUser() user: User,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.paymentService.checkRefundable(user.id, orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('refund-requests')
  @ApiOperation({ summary: '환불 요청 생성' })
  @ApiResponse({ status: 201, description: '환불 요청 생성 성공' })
  @ApiResponse({ status: 400, description: '환불 불가' })
  @ApiBody({ schema: { type: 'object', required: ['orderId', 'reasonType'], properties: { orderId: { type: 'string', format: 'uuid', description: '주문 ID' }, reasonType: { type: 'string', enum: ['dissatisfied', 'not_as_expected', 'duplicate_payment', 'changed_mind', 'technical_issue', 'other'], description: '환불 사유 유형' }, reasonDetail: { type: 'string', maxLength: 500, description: '상세 사유' } } } })
  async requestRefund(
    @CurrentUser() user: User,
    @Body() input: RequestRefundInput,
  ) {
    return this.paymentService.requestRefund(user.id, input);
  }

  @UseGuards(JwtAuthGuard)
  @Get('refund-requests')
  @ApiOperation({ summary: '내 환불 요청 목록 조회' })
  @ApiResponse({ status: 200, description: '환불 요청 목록 반환' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMyRefundRequests(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.paymentService.getMyRefundRequests(user.id, { page, limit });
  }

  @UseGuards(JwtAuthGuard)
  @Get('licenses')
  @ApiOperation({ summary: '내 라이선스 목록 조회' })
  @ApiResponse({ status: 200, description: '라이선스 목록 반환' })
  async getMyLicenses(@CurrentUser() user: User) {
    return this.paymentService.getUserLicenses(user.id);
  }

  @Post('licenses/validate')
  @ApiOperation({ summary: '라이선스 키 검증' })
  @ApiResponse({ status: 200, description: '라이선스 검증 결과 반환' })
  @ApiBody({ schema: { type: 'object', required: ['licenseKey'], properties: { licenseKey: { type: 'string', minLength: 1, description: '라이선스 키' }, instanceName: { type: 'string', description: '인스턴스 이름 (활성화용)' } } } })
  async validateLicense(@Body() dto: ValidateLicenseDto) {
    return this.paymentService.validateLicense(dto.licenseKey);
  }

  @UseGuards(JwtAuthGuard)
  @Get('credits/balance')
  @ApiOperation({ summary: '내 크레딧 잔액 조회' })
  @ApiResponse({ status: 200, description: '크레딧 잔액 반환' })
  async getMyBalance(@CurrentUser() user: User) {
    return this.creditService.getBalance(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('credits/transactions')
  @ApiOperation({ summary: '내 크레딧 트랜잭션 내역 조회' })
  @ApiResponse({ status: 200, description: '트랜잭션 내역 반환' })
  async getMyTransactions(@CurrentUser() user: User) {
    return this.creditService.getTransactions(user.id, { page: 1, limit: 20 });
  }
}
