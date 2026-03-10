/**
 * Audit Log Feature - REST Controller
 *
 * tRPC 프로시저와 1:1 대응하는 REST 엔드포인트를 제공합니다.
 * 모든 엔드포인트는 Admin 권한이 필요합니다.
 */

import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard, NestAdminGuard } from '../../../core/nestjs/auth';
import { AuditLogService } from '../service/audit-log.service';

@ApiTags('Audit Log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NestAdminGuard)
@Controller('admin/audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  // ============================================================================
  // Admin Endpoints (Admin 권한 필요)
  // ============================================================================

  @Get()
  @ApiOperation({ summary: '[Admin] 감사 로그 목록 조회 (필터 + 페이지네이션)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호 (기본값: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지당 항목 수 (기본값: 20, 최대: 100)' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: '사용자 ID 필터 (UUID)' })
  @ApiQuery({ name: 'action', required: false, type: String, description: '액션 필터' })
  @ApiQuery({ name: 'resourceType', required: false, type: String, description: '리소스 타입 필터' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: '시작 날짜 (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: '종료 날짜 (ISO 8601)' })
  @ApiResponse({ status: 200, description: '감사 로그 목록 반환 (페이지네이션)' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  async listLogs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditLogService.listLogs({
      page,
      limit,
      userId,
      action,
      resourceType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] 감사 로그 상세 조회' })
  @ApiParam({ name: 'id', description: '감사 로그 ID (UUID)' })
  @ApiResponse({ status: 200, description: '감사 로그 상세 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '관리자 권한 필요' })
  @ApiResponse({ status: 404, description: '감사 로그를 찾을 수 없음' })
  async getLog(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditLogService.getLog(id);
  }
}
