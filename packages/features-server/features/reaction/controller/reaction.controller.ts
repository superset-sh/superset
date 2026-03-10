/**
 * Reaction Feature - REST Controller
 *
 * tRPC 프로시저와 1:1 대응하는 REST 엔드포인트를 제공합니다.
 * - Public: getCounts, getCountsBatch
 * - Auth: toggle, getUserStatus, getUserStatusBatch
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
import { ReactionService } from "../service/reaction.service";
import type { ReactionType } from "../types";

@ApiTags("Reaction")
@Controller("reaction")
export class ReactionController {
  constructor(private readonly reactionService: ReactionService) {}

  // ============================================================================
  // Public Endpoints
  // ============================================================================

  @Get("counts")
  @ApiOperation({ summary: "리액션 카운트 조회" })
  @ApiQuery({ name: "targetType", required: true, description: "대상 엔티티 타입 (e.g., board_post, product)" })
  @ApiQuery({ name: "targetId", required: true, description: "대상 엔티티 ID (UUID)" })
  @ApiResponse({ status: 200, description: "타입별 리액션 카운트 반환" })
  async getCounts(
    @Query("targetType") targetType: string,
    @Query("targetId", ParseUUIDPipe) targetId: string,
  ) {
    return this.reactionService.getReactionCounts(targetType, targetId);
  }

  @Post("counts/batch")
  @ApiOperation({ summary: "여러 대상 리액션 카운트 일괄 조회" })
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
  @ApiResponse({ status: 200, description: "대상별 리액션 카운트 맵 반환" })
  async getCountsBatch(
    @Body() body: { targetType: string; targetIds: string[] },
  ) {
    const result = await this.reactionService.getReactionCountsBatch(
      body.targetType,
      body.targetIds,
    );
    // Map -> Object 변환 (JSON 직렬화)
    return Object.fromEntries(result);
  }

  // ============================================================================
  // Auth Endpoints (인증 필요)
  // ============================================================================

  @Post("toggle")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "리액션 토글 (추가/제거)" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        targetType: { type: "string", description: "대상 엔티티 타입" },
        targetId: { type: "string", format: "uuid", description: "대상 엔티티 ID" },
        type: { type: "string", enum: ["like", "love", "haha", "wow", "sad", "angry"], description: "리액션 타입 (기본값: like)" },
      },
      required: ["targetType", "targetId"],
    },
  })
  @ApiResponse({ status: 200, description: "토글 결과 (added: true/false)" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async toggle(
    @CurrentUser() user: User,
    @Body() body: { targetType: string; targetId: string; type?: ReactionType },
  ) {
    return this.reactionService.toggle(
      body.targetType,
      body.targetId,
      user.id,
      body.type || "like",
    );
  }

  @Get("user-status")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "사용자 리액션 상태 조회" })
  @ApiQuery({ name: "targetType", required: true, description: "대상 엔티티 타입" })
  @ApiQuery({ name: "targetId", required: true, description: "대상 엔티티 ID (UUID)" })
  @ApiResponse({ status: 200, description: "사용자 리액션 상태 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async getUserStatus(
    @CurrentUser() user: User,
    @Query("targetType") targetType: string,
    @Query("targetId", ParseUUIDPipe) targetId: string,
  ) {
    return this.reactionService.getUserReactionStatus(targetType, targetId, user.id);
  }

  @Post("user-status/batch")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "여러 대상 사용자 리액션 상태 일괄 조회" })
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
  @ApiResponse({ status: 200, description: "대상별 사용자 리액션 상태 맵 반환" })
  @ApiResponse({ status: 401, description: "인증 필요" })
  async getUserStatusBatch(
    @CurrentUser() user: User,
    @Body() body: { targetType: string; targetIds: string[] },
  ) {
    const result = await this.reactionService.getUserReactionStatusBatch(
      body.targetType,
      body.targetIds,
      user.id,
    );
    // Map -> Object 변환 (JSON 직렬화)
    return Object.fromEntries(result);
  }
}
