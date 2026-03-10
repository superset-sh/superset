/**
 * Scheduled Job Feature - REST Controller
 *
 * tRPC 프로시저와 1:1 대응하는 REST 엔드포인트를 제공합니다.
 * - Admin: 잡 목록 조회, 잡 실행 이력 조회, 잡 토글, 즉시 실행
 *
 * 모든 엔드포인트는 Admin 전용입니다.
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
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
import { ScheduledJobService } from "../service/scheduled-job.service";
import { CronRunnerService } from "../service/cron-runner.service";

@ApiTags("Scheduled Job")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NestAdminGuard)
@Controller("admin/scheduled-job")
export class ScheduledJobController {
  constructor(
    private readonly scheduledJobService: ScheduledJobService,
    private readonly cronRunnerService: CronRunnerService,
  ) {}

  // ============================================================================
  // Admin Endpoints
  // ============================================================================

  /** GET /api/admin/scheduled-job - 잡 목록 조회 */
  @Get()
  @ApiOperation({ summary: "스케줄 잡 목록 조회 (관리자)" })
  @ApiResponse({ status: 200, description: "잡 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async listJobs() {
    return this.scheduledJobService.listJobs();
  }

  /** GET /api/admin/scheduled-job/:jobId/runs - 잡 실행 이력 조회 */
  @Get(":jobId/runs")
  @ApiOperation({ summary: "잡 실행 이력 조회 (관리자)" })
  @ApiParam({ name: "jobId", description: "잡 UUID" })
  @ApiQuery({ name: "page", required: false, type: Number, description: "페이지 번호 (기본값: 1)" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "페이지당 개수 (기본값: 20, 최대: 100)" })
  @ApiResponse({ status: 200, description: "잡 실행 이력 반환 (페이지네이션)" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async getJobRuns(
    @Param("jobId", ParseUUIDPipe) jobId: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.scheduledJobService.getJobRuns(jobId, { page, limit });
  }

  /** POST /api/admin/scheduled-job/:jobId/toggle - 잡 활성/비활성 토글 */
  @Post(":jobId/toggle")
  @ApiOperation({ summary: "잡 활성/비활성 토글 (관리자)" })
  @ApiParam({ name: "jobId", description: "잡 UUID" })
  @ApiResponse({ status: 200, description: "토글된 잡 정보 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  @ApiResponse({ status: 404, description: "잡을 찾을 수 없음" })
  async toggleJob(
    @Param("jobId", ParseUUIDPipe) jobId: string,
  ) {
    return this.scheduledJobService.toggleJob(jobId);
  }

  /** POST /api/admin/scheduled-job/run-now - 잡 즉시 실행 */
  @Post("run-now")
  @ApiOperation({ summary: "잡 즉시 실행 (관리자)" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        jobKey: {
          type: "string",
          description: "잡 키",
          enum: [
            "credit_monthly_renewal",
            "marketing_scheduled_publish",
            "data_cleanup",
            "analytics_daily_aggregate",
          ],
        },
      },
      required: ["jobKey"],
    },
  })
  @ApiResponse({ status: 200, description: "잡 실행 성공" })
  @ApiResponse({ status: 400, description: "알 수 없는 잡 키" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async runJobNow(
    @Body() body: { jobKey: string },
  ) {
    switch (body.jobKey) {
      case "credit_monthly_renewal":
        await this.cronRunnerService.creditMonthlyRenewal();
        break;
      case "marketing_scheduled_publish":
        await this.cronRunnerService.marketingScheduledPublish();
        break;
      case "data_cleanup":
        await this.cronRunnerService.dataCleanup();
        break;
      case "analytics_daily_aggregate":
        await this.cronRunnerService.analyticsDailyAggregate();
        break;
      default:
        throw new Error(`Unknown job: ${body.jobKey}`);
    }
    return { success: true };
  }
}
