/**
 * Board Feature - REST Controller
 *
 * tRPC 프로시저와 1:1 대응하는 REST 엔드포인트를 제공합니다.
 * - Public: 게시판 목록, 게시판 조회(slug/id), 게시물 목록, 게시물 상세
 * - Auth: 게시물 생성, 게시물 수정, 게시물 삭제
 * - Admin: 게시판 생성, 게시판 수정, 게시판 삭제
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
  ParseUUIDPipe,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  ParseBoolPipe,
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
import { JwtAuthGuard, NestAdminGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import { BoardService } from "../service/board.service";
import { PostService } from "../service/post.service";
import type {
  CreateBoardInput,
  UpdateBoardInput,
  CreatePostInput,
  UpdatePostInput,
} from "../types";

@ApiTags("Board")
@Controller("board")
export class BoardController {
  constructor(
    private readonly boardService: BoardService,
    private readonly postService: PostService,
  ) {}

  // ============================================================================
  // Public Endpoints - 게시판
  // ============================================================================

  /** GET /api/board - 게시판 목록 조회 */
  @Get()
  @ApiOperation({ summary: "게시판 목록 조회" })
  @ApiQuery({ name: "includeInactive", required: false, type: Boolean, description: "비활성 게시판 포함 여부" })
  @ApiResponse({ status: 200, description: "게시판 목록 반환" })
  async list(
    @Query("includeInactive", new DefaultValuePipe(false), ParseBoolPipe) includeInactive: boolean,
  ) {
    return this.boardService.findAll(includeInactive);
  }

  /** GET /api/board/by-slug/:slug - Slug로 게시판 조회 */
  @Get("by-slug/:slug")
  @ApiOperation({ summary: "Slug로 게시판 조회" })
  @ApiParam({ name: "slug", description: "게시판 slug" })
  @ApiResponse({ status: 200, description: "게시판 정보 반환" })
  @ApiResponse({ status: 404, description: "게시판을 찾을 수 없음" })
  async bySlug(
    @Param("slug") slug: string,
  ) {
    return this.boardService.findBySlug(slug);
  }

  /** GET /api/board/:id - ID로 게시판 조회 */
  @Get(":id")
  @ApiOperation({ summary: "ID로 게시판 조회" })
  @ApiParam({ name: "id", description: "게시판 UUID" })
  @ApiResponse({ status: 200, description: "게시판 정보 반환" })
  @ApiResponse({ status: 404, description: "게시판을 찾을 수 없음" })
  async byId(
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.boardService.findById(id);
  }

  // ============================================================================
  // Admin Endpoints - 게시판 관리
  // ============================================================================

  /** POST /api/board/admin - 게시판 생성 (Admin) */
  @Post("admin")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "게시판 생성 (관리자)" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "게시판 이름", minLength: 1, maxLength: 100 },
        slug: { type: "string", description: "게시판 slug (영소문자, 숫자, 하이픈)", pattern: "^[a-z0-9-]+$" },
        type: { type: "string", enum: ["general", "gallery", "qna"], description: "게시판 유형" },
        description: { type: "string", description: "게시판 설명" },
        settings: { type: "object", description: "게시판 설정" },
        isActive: { type: "boolean", description: "활성화 여부" },
        order: { type: "number", description: "정렬 순서" },
      },
      required: ["name", "slug"],
    },
  })
  @ApiResponse({ status: 201, description: "게시판 생성 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  async create(
    @Body() body: CreateBoardInput,
  ) {
    return this.boardService.create(body);
  }

  /** PUT /api/board/admin/:id - 게시판 수정 (Admin) */
  @Put("admin/:id")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "게시판 수정 (관리자)" })
  @ApiParam({ name: "id", description: "게시판 UUID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "게시판 이름" },
        slug: { type: "string", description: "게시판 slug" },
        type: { type: "string", enum: ["general", "gallery", "qna"], description: "게시판 유형" },
        description: { type: "string", description: "게시판 설명" },
        settings: { type: "object", description: "게시판 설정" },
        isActive: { type: "boolean", description: "활성화 여부" },
        order: { type: "number", description: "정렬 순서" },
      },
    },
  })
  @ApiResponse({ status: 200, description: "게시판 수정 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  @ApiResponse({ status: 404, description: "게시판을 찾을 수 없음" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateBoardInput,
  ) {
    return this.boardService.update(id, body);
  }

  /** DELETE /api/board/admin/:id - 게시판 삭제 (Admin) */
  @Delete("admin/:id")
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "게시판 삭제 (관리자)" })
  @ApiParam({ name: "id", description: "게시판 UUID" })
  @ApiResponse({ status: 200, description: "게시판 삭제 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "관리자 권한 필요" })
  @ApiResponse({ status: 404, description: "게시판을 찾을 수 없음" })
  async delete(
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.boardService.delete(id);
    return { success: true };
  }

  // ============================================================================
  // Public Endpoints - 게시물
  // ============================================================================

  /** GET /api/board/:boardId/posts - 게시물 목록 조회 */
  @Get(":boardId/posts")
  @ApiOperation({ summary: "게시물 목록 조회" })
  @ApiParam({ name: "boardId", description: "게시판 UUID" })
  @ApiQuery({ name: "page", required: false, type: Number, description: "페이지 번호 (기본값: 1)" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "페이지당 개수 (기본값: 20, 최대: 100)" })
  @ApiResponse({ status: 200, description: "게시물 목록 반환 (페이지네이션)" })
  async posts(
    @Param("boardId", ParseUUIDPipe) boardId: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.postService.findByBoardId(boardId, { page, limit });
  }

  /** GET /api/board/posts/:id - 게시물 상세 조회 */
  @Get("posts/:id")
  @ApiOperation({ summary: "게시물 상세 조회" })
  @ApiParam({ name: "id", description: "게시물 UUID" })
  @ApiResponse({ status: 200, description: "게시물 상세 정보 반환" })
  @ApiResponse({ status: 404, description: "게시물을 찾을 수 없음" })
  async post(
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const post = await this.postService.findById(id);
    if (post) {
      // 조회수 증가 (비동기로 처리)
      this.postService.incrementViewCount(id).catch(() => {});
    }
    return post;
  }

  // ============================================================================
  // Auth Endpoints - 게시물 (인증 필요)
  // ============================================================================

  /** POST /api/board/posts - 게시물 생성 */
  @Post("posts")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "게시물 생성" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        boardId: { type: "string", format: "uuid", description: "게시판 UUID" },
        title: { type: "string", description: "게시물 제목", minLength: 1, maxLength: 200 },
        content: { type: "string", description: "게시물 내용", minLength: 1 },
        status: { type: "string", enum: ["draft", "published", "hidden"], description: "게시물 상태" },
        isPinned: { type: "boolean", description: "고정 여부" },
        isNotice: { type: "boolean", description: "공지 여부" },
      },
      required: ["boardId", "title", "content"],
    },
  })
  @ApiResponse({ status: 201, description: "게시물 생성 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async createPost(
    @CurrentUser() user: User,
    @Body() body: CreatePostInput,
  ) {
    return this.postService.create(body, user.id);
  }

  /** PUT /api/board/posts/:id - 게시물 수정 */
  @Put("posts/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "게시물 수정" })
  @ApiParam({ name: "id", description: "게시물 UUID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "게시물 제목" },
        content: { type: "string", description: "게시물 내용" },
        status: { type: "string", enum: ["draft", "published", "hidden"], description: "게시물 상태" },
        isPinned: { type: "boolean", description: "고정 여부" },
        isNotice: { type: "boolean", description: "공지 여부" },
      },
    },
  })
  @ApiResponse({ status: 200, description: "게시물 수정 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "본인 글만 수정 가능" })
  @ApiResponse({ status: 404, description: "게시물을 찾을 수 없음" })
  async updatePost(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() body: UpdatePostInput,
  ) {
    return this.postService.update(id, body, user.id);
  }

  /** DELETE /api/board/posts/:id - 게시물 삭제 */
  @Delete("posts/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "게시물 삭제" })
  @ApiParam({ name: "id", description: "게시물 UUID" })
  @ApiResponse({ status: 200, description: "게시물 삭제 성공" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 403, description: "본인 글만 삭제 가능" })
  @ApiResponse({ status: 404, description: "게시물을 찾을 수 없음" })
  async deletePost(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.postService.delete(id, user.id);
    return { success: true };
  }
}
