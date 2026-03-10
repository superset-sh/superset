/**
 * Analytics Feature - REST Controller
 *
 * tRPC 프로시저와 1:1 대응하는 REST 엔드포인트를 제공합니다.
 * 모든 엔드포인트는 Admin 권한이 필요합니다.
 */

import {
  Controller,
  Get,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard, NestAdminGuard } from "../../../core/nestjs/auth";
import { AnalyticsService } from "../service/analytics.service";

@ApiTags("Analytics")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NestAdminGuard)
@Controller("admin/analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("overview")
  @ApiOperation({ summary: "KPI 개요 조회 (총 사용자, DAU, MAU, 신규 가입)" })
  @ApiResponse({ status: 200, description: "KPI 개요 데이터 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async getOverview() {
    return this.analyticsService.getOverview();
  }

  @Get("trend")
  @ApiOperation({ summary: "기간별 메트릭 트렌드 조회" })
  @ApiQuery({ name: "metricKey", required: true, description: "메트릭 키 (e.g., dau, mau, sign_ups)" })
  @ApiQuery({ name: "days", required: false, type: Number, description: "조회 기간 (일, 기본값: 30, 최대: 365)" })
  @ApiResponse({ status: 200, description: "트렌드 데이터 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async getTrend(
    @Query("metricKey") metricKey: string,
    @Query("days", new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.analyticsService.getTrend({ metricKey, days });
  }

  @Get("distribution")
  @ApiOperation({ summary: "이벤트 타입별 분포 조회 (최근 30일)" })
  @ApiResponse({ status: 200, description: "이벤트 분포 데이터 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async getDistribution() {
    return this.analyticsService.getDistribution();
  }
}
