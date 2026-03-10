/**
 * Terms Feature - REST Controllers
 *
 * Public: 활성 약관 목록 조회
 * Admin: 약관 CRUD 관리
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard, NestAdminGuard } from '../../../core/nestjs/auth';
import { ProfileService } from '../service/profile.service';
import type { CreateTermInput, UpdateTermInput } from '../dto';

@ApiTags('Terms')
@Controller('terms')
export class TermsController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: '활성 약관 목록 조회 (Public)' })
  @ApiResponse({ status: 200, description: '활성 약관 목록 반환' })
  async listActiveTerms() {
    return this.profileService.listTerms(true);
  }
}

@ApiTags('Terms Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NestAdminGuard)
@Controller('admin/terms')
export class TermsAdminController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] 전체 약관 목록 조회' })
  @ApiResponse({ status: 200, description: '전체 약관 목록 반환' })
  async listAllTerms() {
    return this.profileService.listTerms(false);
  }

  @Post()
  @ApiOperation({ summary: '[Admin] 약관 등록' })
  @ApiResponse({ status: 201, description: '약관 생성 성공' })
  @ApiResponse({ status: 400, description: '잘못된 요청' })
  async createTerm(@Body() input: CreateTermInput) {
    return this.profileService.createTerm(input);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Admin] 약관 수정' })
  @ApiParam({ name: 'id', description: '약관 ID (UUID)' })
  @ApiResponse({ status: 200, description: '약관 수정 성공' })
  @ApiResponse({ status: 404, description: '약관을 찾을 수 없음' })
  async updateTerm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateTermInput,
  ) {
    return this.profileService.updateTerm(id, input);
  }

  @Delete(':id')
  @ApiOperation({ summary: '[Admin] 약관 비활성화' })
  @ApiParam({ name: 'id', description: '약관 ID (UUID)' })
  @ApiResponse({ status: 200, description: '약관 비활성화 성공' })
  @ApiResponse({ status: 404, description: '약관을 찾을 수 없음' })
  async deleteTerm(@Param('id', ParseUUIDPipe) id: string) {
    return this.profileService.deleteTerm(id);
  }
}
