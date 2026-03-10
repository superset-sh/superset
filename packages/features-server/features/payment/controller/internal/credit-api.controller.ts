import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, type User } from '../../../../core/nestjs/auth';
import { CreditService } from '../../service/credit.service';

@ApiTags('Credits (Internal)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('internal/credits')
export class CreditApiController {
  constructor(private readonly creditService: CreditService) {}

  @Post('check')
  @ApiOperation({ summary: '크레딧 잔액 확인 (agent-server용)' })
  @ApiBody({ schema: { type: 'object', required: ['estimatedCredits'], properties: { estimatedCredits: { type: 'number', description: '예상 소비 크레딧' } } } })
  @ApiResponse({ status: 200, description: '잔액 확인 결과 반환' })
  async checkBalance(
    @CurrentUser() user: User,
    @Body() dto: { estimatedCredits: number },
  ) {
    return this.creditService.checkBalance(user.id, dto.estimatedCredits);
  }

  @Post('deduct')
  @ApiOperation({ summary: '크레딧 차감 (agent-server AI 호출 후)' })
  @ApiBody({ schema: { type: 'object', required: ['amount'], properties: { amount: { type: 'number', description: '차감 크레딧' }, metadata: { type: 'object', properties: { modelId: { type: 'string' }, provider: { type: 'string' }, promptTokens: { type: 'number' }, completionTokens: { type: 'number' }, totalTokens: { type: 'number' }, messageId: { type: 'string' }, threadId: { type: 'string' } }, description: 'AI 호출 메타데이터' } } } })
  @ApiResponse({ status: 200, description: '크레딧 차감 결과 반환' })
  async deductCredits(
    @CurrentUser() user: User,
    @Body()
    dto: {
      amount: number;
      metadata?: {
        modelId?: string;
        provider?: string;
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        messageId?: string;
        threadId?: string;
      };
    },
  ) {
    return this.creditService.deductCredits(user.id, dto.amount, dto.metadata);
  }

  @Post('calculate')
  @ApiOperation({ summary: '토큰→크레딧 환산 (agent-server용)' })
  @ApiBody({ schema: { type: 'object', required: ['modelId', 'promptTokens', 'completionTokens'], properties: { modelId: { type: 'string', description: '모델 ID' }, promptTokens: { type: 'number', description: '프롬프트 토큰 수' }, completionTokens: { type: 'number', description: '완료 토큰 수' } } } })
  @ApiResponse({ status: 200, description: '크레딧 환산 결과 반환' })
  async calculateCredits(
    @Body()
    dto: {
      modelId: string;
      promptTokens: number;
      completionTokens: number;
    },
  ) {
    const credits = await this.creditService.calculateCredits(
      dto.modelId,
      dto.promptTokens,
      dto.completionTokens,
    );
    return { credits };
  }
}
