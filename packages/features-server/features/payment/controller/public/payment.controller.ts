import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from '../../service/payment.service';
import { PlanService } from '../../service/plan.service';
import type { CreateCheckoutDto } from '../../dto';
import { parseJwtFromHeader } from '../../../../core/nestjs/auth';
import type { FastifyRequest } from 'fastify';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly planService: PlanService,
  ) {}

  @Get('products')
  @ApiOperation({ summary: '활성 상품 목록 조회' })
  @ApiResponse({ status: 200, description: '활성 상품 목록 반환' })
  async getActiveProducts() {
    return this.paymentService.getActiveProducts();
  }

  @Post('checkout')
  @ApiBearerAuth()
  @ApiOperation({ summary: '결제 체크아웃 생성 (로그인 시 userId 자동 연동)' })
  @ApiResponse({ status: 201, description: '체크아웃 URL 반환' })
  @ApiResponse({ status: 400, description: '잘못된 요청' })
  @ApiBody({ schema: { type: 'object', required: ['variantId'], properties: { variantId: { type: 'string', description: 'Lemon Squeezy Variant ID' }, customPrice: { type: 'integer', minimum: 1, description: '커스텀 가격 (cents)' }, email: { type: 'string', format: 'email', description: '고객 이메일' }, name: { type: 'string', description: '고객 이름' }, discountCode: { type: 'string', description: '할인 코드' }, customData: { type: 'object', description: '추가 커스텀 데이터' }, redirectUrl: { type: 'string', format: 'uri', description: '결제 후 리디렉트 URL' } } } })
  async createCheckout(@Req() req: FastifyRequest, @Body() dto: CreateCheckoutDto) {
    // Optional auth — 로그인 상태면 userId를 전달하여 구독과 사용자 연결
    const user = parseJwtFromHeader(req.headers.authorization);
    return this.paymentService.createCheckout(dto, user?.id);
  }

  @Get('plans')
  @ApiOperation({ summary: '활성 플랜 목록 조회' })
  @ApiResponse({ status: 200, description: '플랜 목록 반환' })
  async getPlans() {
    return this.planService.getPlans();
  }
}
