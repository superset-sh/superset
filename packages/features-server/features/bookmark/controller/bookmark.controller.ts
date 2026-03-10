/**
 * Bookmark Feature - REST Controller
 *
 * tRPC 프로시저와 1:1 대응하는 REST 엔드포인트를 제공합니다.
 * - Auth: toggle, isBookmarked, isBookmarkedBatch, myList
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from "@nestjs/swagger";
import { JwtAuthGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import { BookmarkService } from "../service/bookmark.service";

@ApiTags("Bookmark")
@Controller("bookmark")
export class BookmarkController {
  constructor(private readonly bookmarkService: BookmarkService) {}

  // ============================================================================
  // Auth Endpoints (인증 필요)
  // ============================================================================

  @Post("toggle")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "북마크 토글 (추가/제거)" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        targetType: { type: "string", description: "대상 엔티티 타입 (e.g., board_post, blog_post)" },
        targetId: { type: "string", format: "uuid", description: "대상 엔티티 ID" },
      },
      required: ["targetType", "targetId"],
    },
  })
  @ApiResponse({ status: 200, description: "토글 결과 (added: true/false)" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async toggle(
    @CurrentUser() user: User,
    @Body() body: { targetType: string; targetId: string },
  ) {
    return this.bookmarkService.toggle(
      body.targetType,
      body.targetId,
      user.id,
    );
  }

  @Get("status")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "북마크 여부 조회" })
  @ApiQuery({ name: "targetType", required: true, description: "대상 엔티티 타입" })
  @ApiQuery({ name: "targetId", required: true, description: "대상 엔티티 ID (UUID)" })
  @ApiResponse({ status: 200, description: "북마크 여부 (true/false)" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async isBookmarked(
    @CurrentUser() user: User,
    @Query("targetType") targetType: string,
    @Query("targetId", ParseUUIDPipe) targetId: string,
  ) {
    return this.bookmarkService.isBookmarked(targetType, targetId, user.id);
  }

  @Post("status/batch")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "여러 대상 북마크 여부 일괄 조회" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        targetType: { type: "string", description: "대상 엔티티 타입" },
        targetIds: { type: "array", items: { type: "string", format: "uuid" }, description: "대상 엔티티 ID 목록" },
      },
      required: ["targetType", "targetIds"],
    },
  })
  @ApiResponse({ status: 200, description: "대상별 북마크 여부 맵 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async isBookmarkedBatch(
    @CurrentUser() user: User,
    @Body() body: { targetType: string; targetIds: string[] },
  ) {
    const result = await this.bookmarkService.isBookmarkedBatch(
      body.targetType,
      body.targetIds,
      user.id,
    );
    return Object.fromEntries(result);
  }

  @Get("my-list")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "내 북마크 목록 조회" })
  @ApiQuery({ name: "targetType", required: false, description: "필터: 대상 엔티티 타입" })
  @ApiResponse({ status: 200, description: "북마크 목록 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async getMyBookmarks(
    @CurrentUser() user: User,
    @Query("targetType") targetType?: string,
  ) {
    return this.bookmarkService.getMyBookmarks(user.id, targetType);
  }
}
