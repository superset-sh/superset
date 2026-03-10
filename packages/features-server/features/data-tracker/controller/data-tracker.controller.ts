/**
 * Data Tracker Feature - REST Controllers
 *
 * tRPC 프로시저와 1:1 대응하는 REST 엔드포인트를 제공합니다.
 * Admin: 트래커 CRUD (JwtAuthGuard + NestAdminGuard)
 * User: 데이터 조회/입력 (JwtAuthGuard)
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
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard, NestAdminGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import { DataTrackerService } from "../service/data-tracker.service";

// ============================================================================
// Admin Controller
// ============================================================================

@ApiTags("Data Tracker Admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NestAdminGuard)
@Controller("admin/data-tracker")
export class DataTrackerAdminController {
  constructor(private readonly dataTrackerService: DataTrackerService) {}

  @Get()
  @ApiOperation({ summary: "전체 트래커 목록 조회 (Admin)" })
  @ApiResponse({ status: 200, description: "트래커 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async adminList() {
    return this.dataTrackerService.adminList();
  }

  @Get(":id")
  @ApiOperation({ summary: "트래커 단건 조회 (Admin)" })
  @ApiParam({ name: "id", description: "트래커 ID (UUID)" })
  @ApiResponse({ status: 200, description: "트래커 상세 정보 반환" })
  @ApiResponse({ status: 404, description: "트래커를 찾을 수 없음" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async adminGetById(@Param("id", ParseUUIDPipe) id: string) {
    return this.dataTrackerService.adminGetById(id);
  }

  @Post()
  @ApiOperation({ summary: "트래커 생성 (Admin)" })
  @ApiResponse({ status: 201, description: "트래커 생성 성공" })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  @ApiResponse({ status: 409, description: "슬러그 중복" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async adminCreate(
    @CurrentUser() user: User,
    @Body() body: {
      name: string;
      description?: string;
      chartType: "line" | "bar" | "pie";
      chartConfig: { yAxisKey?: string; groupByKey?: string; categoryKey?: string; valueKey?: string; aggregation: "sum" | "avg" | "count" | "min" | "max" };
      scope?: "personal" | "organization" | "all";
      columns: { key: string; label: string; dataType: "text" | "number"; isRequired?: boolean; sortOrder: number }[];
    },
  ) {
    return this.dataTrackerService.adminCreate(body, user.id);
  }

  @Put(":id")
  @ApiOperation({ summary: "트래커 수정 (Admin)" })
  @ApiParam({ name: "id", description: "트래커 ID (UUID)" })
  @ApiResponse({ status: 200, description: "트래커 수정 성공" })
  @ApiResponse({ status: 404, description: "트래커를 찾을 수 없음" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async adminUpdate(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: {
      name?: string;
      description?: string;
      chartType?: "line" | "bar" | "pie";
      chartConfig?: { yAxisKey?: string; groupByKey?: string; categoryKey?: string; valueKey?: string; aggregation: "sum" | "avg" | "count" | "min" | "max" };
      scope?: "personal" | "organization" | "all";
      columns?: { key: string; label: string; dataType: "text" | "number"; isRequired?: boolean; sortOrder: number }[];
    },
  ) {
    return this.dataTrackerService.adminUpdate(id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "트래커 삭제 (Admin, Soft Delete)" })
  @ApiParam({ name: "id", description: "트래커 ID (UUID)" })
  @ApiResponse({ status: 200, description: "트래커 삭제 성공" })
  @ApiResponse({ status: 404, description: "트래커를 찾을 수 없음" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async adminDelete(@Param("id", ParseUUIDPipe) id: string) {
    return this.dataTrackerService.adminDelete(id);
  }

  @Patch(":id/toggle-active")
  @ApiOperation({ summary: "트래커 활성/비활성 토글 (Admin)" })
  @ApiParam({ name: "id", description: "트래커 ID (UUID)" })
  @ApiResponse({ status: 200, description: "트래커 상태 토글 성공" })
  @ApiResponse({ status: 404, description: "트래커를 찾을 수 없음" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async adminToggleActive(@Param("id", ParseUUIDPipe) id: string) {
    return this.dataTrackerService.adminToggleActive(id);
  }
}

// ============================================================================
// User Controller
// ============================================================================

@ApiTags("Data Tracker")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("data-tracker")
export class DataTrackerUserController {
  constructor(private readonly dataTrackerService: DataTrackerService) {}

  @Get()
  @ApiOperation({ summary: "활성 트래커 목록 조회" })
  @ApiResponse({ status: 200, description: "활성 트래커 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async list() {
    return this.dataTrackerService.list();
  }

  @Get("by-slug/:slug")
  @ApiOperation({ summary: "slug로 트래커 조회" })
  @ApiParam({ name: "slug", description: "트래커 슬러그" })
  @ApiResponse({ status: 200, description: "트래커 상세 정보 반환" })
  @ApiResponse({ status: 404, description: "트래커를 찾을 수 없음" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async getBySlug(@Param("slug") slug: string) {
    return this.dataTrackerService.getBySlug(slug);
  }

  @Get(":trackerId/entries")
  @ApiOperation({ summary: "트래커 엔트리 목록 조회 (페이지네이션)" })
  @ApiParam({ name: "trackerId", description: "트래커 ID (UUID)" })
  @ApiQuery({ name: "page", required: false, type: Number, description: "페이지 번호 (기본값: 1)" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "페이지 크기 (기본값: 20, 최대: 100)" })
  @ApiQuery({ name: "viewMode", required: false, enum: ["personal", "organization"], description: "조회 모드 (기본값: organization)" })
  @ApiResponse({ status: 200, description: "엔트리 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async getEntries(
    @CurrentUser() user: User,
    @Param("trackerId", ParseUUIDPipe) trackerId: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("viewMode") viewMode?: "personal" | "organization",
  ) {
    const userId = viewMode === "personal" ? user.id : undefined;
    return this.dataTrackerService.getEntries(trackerId, { page, limit, userId });
  }

  @Get(":trackerId/chart")
  @ApiOperation({ summary: "차트 데이터 조회" })
  @ApiParam({ name: "trackerId", description: "트래커 ID (UUID)" })
  @ApiQuery({ name: "days", required: false, type: Number, description: "조회 기간 (일, 기본값: 30, 최대: 365)" })
  @ApiQuery({ name: "viewMode", required: false, enum: ["personal", "organization"], description: "조회 모드 (기본값: organization)" })
  @ApiResponse({ status: 200, description: "차트 데이터 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async getChartData(
    @CurrentUser() user: User,
    @Param("trackerId", ParseUUIDPipe) trackerId: string,
    @Query("days", new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query("viewMode") viewMode?: "personal" | "organization",
  ) {
    const userId = viewMode === "personal" ? user.id : undefined;
    return this.dataTrackerService.getChartData(trackerId, { days, userId });
  }

  @Post("entries")
  @ApiOperation({ summary: "데이터 엔트리 추가" })
  @ApiResponse({ status: 201, description: "엔트리 생성 성공" })
  @ApiResponse({ status: 400, description: "잘못된 요청 또는 비활성 트래커" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async addEntry(
    @CurrentUser() user: User,
    @Body() body: {
      trackerId: string;
      date: string;
      data: Record<string, string | number>;
    },
  ) {
    return this.dataTrackerService.addEntry(
      body.trackerId,
      { date: new Date(body.date), data: body.data },
      user.id,
      "manual",
    );
  }

  @Put("entries/:entryId")
  @ApiOperation({ summary: "데이터 엔트리 수정" })
  @ApiParam({ name: "entryId", description: "엔트리 ID (UUID)" })
  @ApiResponse({ status: 200, description: "엔트리 수정 성공" })
  @ApiResponse({ status: 404, description: "엔트리를 찾을 수 없음" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async updateEntry(
    @Param("entryId", ParseUUIDPipe) entryId: string,
    @Body() body: {
      date?: string;
      data?: Record<string, string | number>;
    },
  ) {
    return this.dataTrackerService.updateEntry(entryId, {
      date: body.date ? new Date(body.date) : undefined,
      data: body.data,
    });
  }

  @Delete("entries/:entryId")
  @ApiOperation({ summary: "데이터 엔트리 삭제 (Soft Delete)" })
  @ApiParam({ name: "entryId", description: "엔트리 ID (UUID)" })
  @ApiResponse({ status: 200, description: "엔트리 삭제 성공" })
  @ApiResponse({ status: 404, description: "엔트리를 찾을 수 없음" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async deleteEntry(@Param("entryId", ParseUUIDPipe) entryId: string) {
    return this.dataTrackerService.deleteEntry(entryId);
  }

  @Post("import-csv")
  @ApiOperation({ summary: "CSV 데이터 일괄 가져오기" })
  @ApiResponse({ status: 201, description: "CSV 가져오기 성공" })
  @ApiResponse({ status: 400, description: "잘못된 요청 또는 비활성 트래커" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async importCsv(
    @CurrentUser() user: User,
    @Body() body: {
      trackerId: string;
      rows: { date: string; data: Record<string, string | number> }[];
    },
  ) {
    return this.dataTrackerService.importCsv(
      body.trackerId,
      body.rows.map((row) => ({ date: new Date(row.date), data: row.data })),
      user.id,
    );
  }
}
