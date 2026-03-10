/**
 * AI REST Controller
 *
 * 범용 AI 엔드포인트 — 주제 추천, 초안 생성
 */
import {
  Controller,
  Post,
  Body,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../core/nestjs/auth";
import { LLMService } from "../service/llm.service";

@ApiTags("AI")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("ai")
export class AIController {
  constructor(private readonly llmService: LLMService) {}

  @Post("suggest-topics")
  @ApiOperation({ summary: "AI 주제 추천" })
  @ApiResponse({ status: 200, description: "주제 추천 결과 반환" })
  @ApiBody({ schema: { type: 'object', required: ['contextTitle', 'items'], properties: { contextTitle: { type: 'string', description: '컨텍스트 제목' }, contextDescription: { type: 'string', description: '컨텍스트 설명' }, items: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, itemType: { type: 'string' }, contentPreview: { type: 'string' } } }, description: '기존 항목 목록' }, nodeTypes: { type: 'array', items: { type: 'string' }, description: '노드 유형 필터' } } } })
  async suggestTopics(
    @Body()
    dto: {
      contextTitle: string;
      contextDescription?: string;
      items: Array<{ title: string; itemType: string; contentPreview: string }>;
      nodeTypes?: string[];
    },
  ) {
    return this.llmService.suggestTopics(dto);
  }

  @Post("generate-draft")
  @ApiOperation({ summary: "AI 초안 생성" })
  @ApiResponse({ status: 200, description: "초안 생성 결과 반환" })
  @ApiBody({ schema: { type: 'object', required: ['contextTitle', 'topicTitle', 'topicDescription', 'nodeType', 'existingTitles'], properties: { contextTitle: { type: 'string', description: '컨텍스트 제목' }, topicTitle: { type: 'string', description: '주제 제목' }, topicDescription: { type: 'string', description: '주제 설명' }, nodeType: { type: 'string', description: '노드 유형' }, existingTitles: { type: 'array', items: { type: 'string' }, description: '기존 제목 목록 (중복 방지)' } } } })
  async generateDraft(
    @Body()
    dto: {
      contextTitle: string;
      topicTitle: string;
      topicDescription: string;
      nodeType: string;
      existingTitles: string[];
    },
  ) {
    return this.llmService.generateDraft(dto);
  }
}
