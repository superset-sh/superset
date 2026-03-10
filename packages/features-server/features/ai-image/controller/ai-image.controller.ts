/**
 * AI Image REST Controllers
 *
 * Public/Auth 엔드포인트 + Admin 엔드포인트
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  Sse,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import {
  JwtAuthGuard,
  NestAdminGuard,
  CurrentUser,
  type User,
} from "../../../core/nestjs/auth";
import { AiImageService } from "../generation/ai-image.service";
import { StyleTemplateService } from "../generation/style-template.service";
import { ContentThemeService } from "../content-theme/content-theme.service";
import type { GenerateImageInput, CreateStyleInput, CreateContentThemeInput } from "../dto";

@ApiTags("AI Image")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("ai-image")
export class AiImageController {
  constructor(
    private readonly aiImageService: AiImageService,
    private readonly styleTemplateService: StyleTemplateService,
    private readonly contentThemeService: ContentThemeService,
  ) {}

  @Post("generate")
  @ApiOperation({ summary: "AI 이미지 생성" })
  @ApiResponse({ status: 201, description: "이미지 생성 시작" })
  @ApiResponse({ status: 400, description: "잘못된 프롬프트" })
  async generate(
    @Body() dto: GenerateImageInput,
    @CurrentUser() user: User,
  ) {
    return this.aiImageService.generate(dto, user.id);
  }

  @Sse("stream/:id")
  @ApiOperation({ summary: "이미지 생성 스트리밍 상태" })
  @ApiParam({ name: "id", description: "Generation ID" })
  streamStatus(@Param("id", ParseUUIDPipe) id: string) {
    return this.aiImageService.createStream(id);
  }

  @Get("result/:id")
  @ApiOperation({ summary: "이미지 생성 결과 조회" })
  @ApiParam({ name: "id", description: "Generation ID" })
  @ApiResponse({ status: 200, description: "생성 결과" })
  @ApiResponse({ status: 404, description: "결과 없음" })
  async getResult(@Param("id", ParseUUIDPipe) id: string) {
    return this.aiImageService.getResult(id);
  }

  @Get("history")
  @ApiOperation({ summary: "이미지 생성 이력 조회" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "생성 이력 목록" })
  async history(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @CurrentUser() user: User,
  ) {
    return this.aiImageService.getHistory(user.id, { page, limit });
  }

  @Delete(":id")
  @ApiOperation({ summary: "이미지 삭제" })
  @ApiParam({ name: "id", description: "Generation ID" })
  @ApiResponse({ status: 200, description: "삭제 성공" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @ApiResponse({ status: 404, description: "이미지 없음" })
  async delete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.aiImageService.delete(id, user.id);
  }

  @Get(":id/reuse")
  @ApiOperation({ summary: "프롬프트 재사용 데이터" })
  @ApiParam({ name: "id", description: "Generation ID" })
  @ApiResponse({ status: 200, description: "프롬프트 + 스타일 정보" })
  async reuse(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.aiImageService.getReuse(id, user.id);
  }

  @Get("styles")
  @ApiOperation({ summary: "활성 스타일 템플릿 목록" })
  @ApiResponse({ status: 200, description: "스타일 목록" })
  async styleTemplates() {
    return this.styleTemplateService.findActive();
  }

  @Get("content-themes")
  @ApiOperation({ summary: "활성 콘텐츠 테마 목록" })
  @ApiResponse({ status: 200, description: "콘텐츠 테마 목록" })
  async contentThemes() {
    return this.contentThemeService.findActive();
  }
}

@ApiTags("AI Image Admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NestAdminGuard)
@Controller("admin/ai-image")
export class AiImageAdminController {
  constructor(
    private readonly aiImageService: AiImageService,
    private readonly styleTemplateService: StyleTemplateService,
    private readonly contentThemeService: ContentThemeService,
  ) {}

  @Get("history")
  @ApiOperation({ summary: "전체 이미지 생성 이력 (Admin)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "userId", required: false, type: String })
  @ApiResponse({ status: 200, description: "전체 이력" })
  async adminHistory(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("userId") userId?: string,
  ) {
    return this.aiImageService.adminGetHistory({ page, limit, userId });
  }

  @Post("styles")
  @ApiOperation({ summary: "스타일 템플릿 생성" })
  @ApiResponse({ status: 201, description: "스타일 생성 성공" })
  @ApiResponse({ status: 409, description: "슬러그 중복" })
  async createStyle(@Body() dto: CreateStyleInput) {
    return this.styleTemplateService.create(dto);
  }

  @Patch("styles/:id")
  @ApiOperation({ summary: "스타일 템플릿 수정" })
  @ApiParam({ name: "id", description: "Style ID" })
  @ApiResponse({ status: 200, description: "수정 성공" })
  async updateStyle(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateStyleInput,
  ) {
    return this.styleTemplateService.update(id, dto);
  }

  @Delete("styles/:id")
  @ApiOperation({ summary: "스타일 템플릿 삭제" })
  @ApiParam({ name: "id", description: "Style ID" })
  @ApiResponse({ status: 200, description: "삭제 성공" })
  async deleteStyle(@Param("id", ParseUUIDPipe) id: string) {
    return this.styleTemplateService.delete(id);
  }

  @Post("content-themes")
  @ApiOperation({ summary: "콘텐츠 테마 생성" })
  @ApiResponse({ status: 201, description: "테마 생성 성공" })
  @ApiResponse({ status: 409, description: "슬러그 중복" })
  async createContentTheme(@Body() dto: CreateContentThemeInput) {
    return this.contentThemeService.create(dto);
  }

  @Patch("content-themes/:id")
  @ApiOperation({ summary: "콘텐츠 테마 수정" })
  @ApiParam({ name: "id", description: "Content Theme ID" })
  @ApiResponse({ status: 200, description: "수정 성공" })
  async updateContentTheme(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateContentThemeInput,
  ) {
    return this.contentThemeService.update(id, dto);
  }

  @Delete("content-themes/:id")
  @ApiOperation({ summary: "콘텐츠 테마 삭제" })
  @ApiParam({ name: "id", description: "Content Theme ID" })
  @ApiResponse({ status: 200, description: "삭제 성공" })
  async deleteContentTheme(@Param("id", ParseUUIDPipe) id: string) {
    return this.contentThemeService.delete(id);
  }
}
