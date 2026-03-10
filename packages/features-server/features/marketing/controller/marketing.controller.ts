/**
 * Marketing REST Controller
 *
 * 캠페인, 콘텐츠, SNS 계정, 발행 엔드포인트
 */
import {
  Controller,
  Get,
  Post,
  Put,
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
  ApiBody,
} from "@nestjs/swagger";
import { JwtAuthGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import {
  MarketingService,
  PublishOrchestratorService,
  SnsAccountService,
  SnsPublisherService,
} from "../service";
import type {
  CreateCampaignDto,
  UpdateCampaignDto,
  CreateContentDto,
  UpdateContentDto,
  CreateContentFromSourceDto,
  ConnectAccountDto,
  PublishNowDto,
  SchedulePublishDto,
} from "../dto";

@ApiTags("Marketing")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("marketing")
export class MarketingController {
  constructor(
    private readonly marketingService: MarketingService,
    private readonly publishOrchestratorService: PublishOrchestratorService,
    private readonly snsAccountService: SnsAccountService,
    private readonly snsPublisherService: SnsPublisherService,
  ) {}

  // ==========================================================================
  // 캠페인
  // ==========================================================================

  @Get("campaigns")
  @ApiOperation({ summary: "내 캠페인 목록 조회" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "캠페인 목록 반환" })
  async listCampaigns(
    @CurrentUser() user: User,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.marketingService.findCampaigns(user.id, page, limit);
  }

  @Get("campaigns/:id")
  @ApiOperation({ summary: "캠페인 상세 조회" })
  @ApiParam({ name: "id", description: "캠페인 ID" })
  @ApiResponse({ status: 200, description: "캠페인 상세 정보" })
  @ApiResponse({ status: 404, description: "캠페인을 찾을 수 없음" })
  async getCampaign(@Param("id", ParseUUIDPipe) id: string) {
    return this.marketingService.findCampaignById(id);
  }

  @Post("campaigns")
  @ApiOperation({ summary: "캠페인 생성" })
  @ApiResponse({ status: 201, description: "캠페인 생성 성공" })
  @ApiBody({ schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 200, description: '캠페인명' }, description: { type: 'string', maxLength: 2000, description: '캠페인 설명' }, startsAt: { type: 'string', format: 'date-time', description: '시작일' }, endsAt: { type: 'string', format: 'date-time', description: '종료일' }, tags: { type: 'array', items: { type: 'string' }, maxItems: 20, description: '태그' } } } })
  async createCampaign(@Body() dto: CreateCampaignDto, @CurrentUser() user: User) {
    return this.marketingService.createCampaign(dto, user.id);
  }

  @Put("campaigns/:id")
  @ApiOperation({ summary: "캠페인 수정" })
  @ApiParam({ name: "id", description: "캠페인 ID" })
  @ApiResponse({ status: 200, description: "캠페인 수정 성공" })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string', maxLength: 200, description: '캠페인명' }, description: { type: 'string', maxLength: 2000, description: '캠페인 설명' }, startsAt: { type: 'string', format: 'date-time', description: '시작일' }, endsAt: { type: 'string', format: 'date-time', description: '종료일' }, tags: { type: 'array', items: { type: 'string' }, description: '태그' }, status: { type: 'string', enum: ['draft', 'active', 'paused', 'completed', 'archived'], description: '상태' } } } })
  async updateCampaign(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: User,
  ) {
    return this.marketingService.updateCampaign(id, dto, user.id);
  }

  @Delete("campaigns/:id")
  @ApiOperation({ summary: "캠페인 삭제" })
  @ApiParam({ name: "id", description: "캠페인 ID" })
  @ApiResponse({ status: 200, description: "캠페인 삭제 성공" })
  async deleteCampaign(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.marketingService.deleteCampaign(id, user.id);
  }

  // ==========================================================================
  // 콘텐츠
  // ==========================================================================

  @Get("contents")
  @ApiOperation({ summary: "콘텐츠 목록 조회" })
  @ApiQuery({ name: "campaignId", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "콘텐츠 목록 반환" })
  async listContents(
    @CurrentUser() user: User,
    @Query("campaignId") campaignId?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.marketingService.findContents(
      { campaignId, authorId: user.id },
      page!,
      limit!,
    );
  }

  @Get("contents/:id")
  @ApiOperation({ summary: "콘텐츠 상세 조회" })
  @ApiParam({ name: "id", description: "콘텐츠 ID" })
  @ApiResponse({ status: 200, description: "콘텐츠 상세 정보" })
  @ApiResponse({ status: 404, description: "콘텐츠를 찾을 수 없음" })
  async getContent(@Param("id", ParseUUIDPipe) id: string) {
    return this.marketingService.findContentById(id);
  }

  @Post("contents")
  @ApiOperation({ summary: "콘텐츠 생성" })
  @ApiResponse({ status: 201, description: "콘텐츠 생성 성공" })
  @ApiBody({ schema: { type: 'object', required: ['title', 'body'], properties: { campaignId: { type: 'string', format: 'uuid', description: '소속 캠페인 ID' }, title: { type: 'string', minLength: 1, maxLength: 200, description: '콘텐츠 제목' }, body: { type: 'string', minLength: 1, description: '본문' }, images: { type: 'array', items: { type: 'string', format: 'uri' }, maxItems: 10, description: '이미지 URL' }, linkUrl: { type: 'string', format: 'uri', description: '공유 링크' }, tags: { type: 'array', items: { type: 'string' }, maxItems: 30, description: '해시태그' } } } })
  async createContent(@Body() dto: CreateContentDto, @CurrentUser() user: User) {
    return this.marketingService.createContent(dto, user.id);
  }

  @Post("contents/from-source")
  @ApiOperation({ summary: "소스 콘텐츠로부터 마케팅 콘텐츠 초안 생성" })
  @ApiResponse({ status: 201, description: "초안 생성 성공" })
  @ApiBody({ schema: { type: 'object', required: ['sourceType', 'sourceId'], properties: { sourceType: { type: 'string', enum: ['board_post', 'community_post', 'content_studio'], description: '소스 유형' }, sourceId: { type: 'string', format: 'uuid', description: '소스 콘텐츠 ID' }, campaignId: { type: 'string', format: 'uuid', description: '소속 캠페인' } } } })
  async createContentFromSource(
    @Body() dto: CreateContentFromSourceDto,
    @CurrentUser() user: User,
  ) {
    return this.marketingService.createContentFromSource(
      dto.sourceType,
      dto.sourceId,
      user.id,
      dto.campaignId,
    );
  }

  @Put("contents/:id")
  @ApiOperation({ summary: "콘텐츠 수정" })
  @ApiParam({ name: "id", description: "콘텐츠 ID" })
  @ApiResponse({ status: 200, description: "콘텐츠 수정 성공" })
  @ApiBody({ schema: { type: 'object', properties: { campaignId: { type: 'string', format: 'uuid', description: '소속 캠페인 ID' }, title: { type: 'string', maxLength: 200, description: '콘텐츠 제목' }, body: { type: 'string', description: '본문' }, images: { type: 'array', items: { type: 'string', format: 'uri' }, description: '이미지 URL' }, linkUrl: { type: 'string', format: 'uri', description: '공유 링크' }, tags: { type: 'array', items: { type: 'string' }, description: '해시태그' } } } })
  async updateContent(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentDto,
    @CurrentUser() user: User,
  ) {
    return this.marketingService.updateContent(id, dto, user.id);
  }

  @Delete("contents/:id")
  @ApiOperation({ summary: "콘텐츠 삭제" })
  @ApiParam({ name: "id", description: "콘텐츠 ID" })
  @ApiResponse({ status: 200, description: "콘텐츠 삭제 성공" })
  async deleteContent(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.marketingService.deleteContent(id, user.id);
  }

  // ==========================================================================
  // SNS 계정
  // ==========================================================================

  @Get("accounts")
  @ApiOperation({ summary: "내 연결된 SNS 계정 목록" })
  @ApiResponse({ status: 200, description: "SNS 계정 목록 반환" })
  async listAccounts(@CurrentUser() user: User) {
    return this.snsAccountService.findAccounts(user.id);
  }

  @Post("accounts/connect")
  @ApiOperation({ summary: "SNS 계정 연결 (OAuth)" })
  @ApiResponse({ status: 201, description: "SNS 계정 연결 성공" })
  @ApiBody({ schema: { type: 'object', required: ['platform', 'authCode', 'redirectUri'], properties: { platform: { type: 'string', enum: ['facebook', 'instagram', 'threads', 'x', 'linkedin'], description: 'SNS 플랫폼' }, authCode: { type: 'string', description: 'OAuth 인증 코드' }, redirectUri: { type: 'string', format: 'uri', description: 'OAuth 리디렉트 URI' } } } })
  async connectAccount(@Body() dto: ConnectAccountDto, @CurrentUser() user: User) {
    return this.snsAccountService.connectAccount(dto, user.id);
  }

  @Delete("accounts/:id")
  @ApiOperation({ summary: "SNS 계정 연결 해제" })
  @ApiParam({ name: "id", description: "SNS 계정 ID" })
  @ApiResponse({ status: 200, description: "SNS 계정 연결 해제 성공" })
  async disconnectAccount(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.snsAccountService.disconnectAccount(id, user.id);
  }

  // ==========================================================================
  // 발행
  // ==========================================================================

  @Post("publish/now")
  @ApiOperation({ summary: "즉시 발행" })
  @ApiResponse({ status: 200, description: "발행 결과 반환" })
  @ApiBody({ schema: { type: 'object', required: ['contentId', 'platforms', 'accountIds'], properties: { contentId: { type: 'string', format: 'uuid', description: '발행할 콘텐츠 ID' }, platforms: { type: 'array', items: { type: 'string', enum: ['facebook', 'instagram', 'threads', 'x', 'linkedin'] }, minItems: 1, description: '발행 플랫폼' }, accountIds: { type: 'object', additionalProperties: { type: 'string', format: 'uuid' }, description: '플랫폼별 계정 ID' } } } })
  async publishNow(
    @Body() dto: PublishNowDto,
    @CurrentUser() user: User,
  ): Promise<{
    results: Array<{
      platform: "facebook" | "instagram" | "threads" | "x" | "linkedin";
      success: boolean;
      publicationId?: string;
      error?: string;
    }>;
  }> {
    return this.publishOrchestratorService.publishNow(dto, user.id);
  }

  @Post("publish/schedule")
  @ApiOperation({ summary: "예약 발행" })
  @ApiResponse({ status: 200, description: "예약 발행 등록 성공" })
  @ApiBody({ schema: { type: 'object', required: ['contentId', 'platforms', 'accountIds', 'scheduledAt'], properties: { contentId: { type: 'string', format: 'uuid', description: '발행할 콘텐츠 ID' }, platforms: { type: 'array', items: { type: 'string', enum: ['facebook', 'instagram', 'threads', 'x', 'linkedin'] }, minItems: 1, description: '발행 플랫폼' }, accountIds: { type: 'object', additionalProperties: { type: 'string', format: 'uuid' }, description: '플랫폼별 계정 ID' }, scheduledAt: { type: 'string', format: 'date-time', description: '예약 발행 시간' } } } })
  async schedulePublish(
    @Body() dto: SchedulePublishDto,
    @CurrentUser() user: User,
  ): Promise<{
    scheduledAt: string;
    results: Array<{
      platform: "facebook" | "instagram" | "threads" | "x" | "linkedin";
      publicationId: string;
    }>;
  }> {
    return this.publishOrchestratorService.schedulePublish(dto, user.id);
  }

  @Get("publish/constraints")
  @ApiOperation({ summary: "플랫폼 제약사항 조회" })
  @ApiResponse({ status: 200, description: "플랫폼별 제약사항 반환" })
  async getConstraints() {
    return this.snsPublisherService.getAllConstraints();
  }
}
