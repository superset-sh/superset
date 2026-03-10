import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  Req,
  BadRequestException,
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
  ApiConsumes,
  ApiBody,
} from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { JwtAuthGuard, NestAdminGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import { FileService } from "../service/file.service";
import type { FileRecord, PaginatedFiles, SignedUploadUrlResponse } from "../types";

@ApiTags("Files")
@Controller("files")
export class FileController {
  constructor(private readonly fileService: FileService) {}

  /**
   * POST /api/files/upload
   * multipart/form-data로 파일 업로드
   */
  @ApiBearerAuth()
  @ApiOperation({ summary: "파일 업로드" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        bucket: { type: "string", enum: ["files", "public-files"] },
        folder: { type: "string" },
      },
      required: ["file"],
    },
  })
  @ApiResponse({ status: 201, description: "파일 업로드 성공" })
  @ApiResponse({ status: 400, description: "파일 없음 또는 유효하지 않은 파일" })
  @UseGuards(JwtAuthGuard)
  @Post("upload")
  async upload(
    @Req() request: FastifyRequest,
    @CurrentUser() user: User
  ): Promise<FileRecord> {
    // Fastify multipart 처리
    const data = await request.file();
    if (!data) {
      throw new BadRequestException("No file uploaded");
    }

    const file = data as MultipartFile;
    const buffer = await file.toBuffer();

    // bucket 필드 추출 (있으면)
    const fields = data.fields as Record<string, { value?: string }>;
    const bucket = fields?.bucket?.value ?? "files";
    const folder = fields?.folder?.value;

    return this.fileService.upload(
      {
        file: buffer,
        originalName: file.filename,
        mimeType: file.mimetype,
        size: buffer.length,
        bucket,
        folder,
      },
      user.id
    );
  }

  /**
   * GET /api/files
   * 사용자별 파일 목록 조회
   */
  @ApiBearerAuth()
  @ApiOperation({ summary: "내 파일 목록 조회" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "파일 목록 반환" })
  @UseGuards(JwtAuthGuard)
  @Get()
  async list(
    @CurrentUser() user: User,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<PaginatedFiles> {
    return this.fileService.findByUser(user.id, { page, limit });
  }

  /**
   * GET /api/files/admin
   * 전체 파일 목록 조회 (Admin)
   */
  @ApiBearerAuth()
  @ApiOperation({ summary: "전체 파일 목록 조회 (관리자용)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "전체 파일 목록 반환" })
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @Get("admin")
  async adminList(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<PaginatedFiles> {
    return this.fileService.findAll({ page, limit });
  }

  /**
   * GET /api/files/:id
   * ID로 파일 조회
   */
  @ApiOperation({ summary: "ID로 파일 조회" })
  @ApiParam({ name: "id", description: "파일 UUID" })
  @ApiResponse({ status: 200, description: "파일 정보 반환" })
  @ApiResponse({ status: 404, description: "파일을 찾을 수 없음" })
  @Get(":id")
  async findById(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<FileRecord | null> {
    return this.fileService.findById(id);
  }

  /**
   * DELETE /api/files/:id
   * 파일 삭제
   */
  @ApiBearerAuth()
  @ApiOperation({ summary: "내 파일 삭제" })
  @ApiParam({ name: "id", description: "파일 UUID" })
  @ApiResponse({ status: 200, description: "파일 삭제 성공" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @ApiResponse({ status: 404, description: "파일을 찾을 수 없음" })
  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  async delete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User
  ): Promise<{ success: boolean }> {
    await this.fileService.delete(id, user.id);
    return { success: true };
  }

  /**
   * DELETE /api/files/admin/:id
   * Admin용 파일 삭제 (권한 검사 없음)
   */
  @ApiBearerAuth()
  @ApiOperation({ summary: "파일 삭제 (관리자용)" })
  @ApiParam({ name: "id", description: "파일 UUID" })
  @ApiResponse({ status: 200, description: "파일 삭제 성공" })
  @ApiResponse({ status: 404, description: "파일을 찾을 수 없음" })
  @UseGuards(JwtAuthGuard, NestAdminGuard)
  @Delete("admin/:id")
  async adminDelete(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<{ success: boolean }> {
    await this.fileService.adminDelete(id);
    return { success: true };
  }

  /**
   * GET /api/files/:id/signed-url
   * 다운로드용 Signed URL 발급
   */
  @ApiBearerAuth()
  @ApiOperation({ summary: "다운로드용 Signed URL 발급" })
  @ApiParam({ name: "id", description: "파일 UUID" })
  @ApiQuery({ name: "expiresIn", required: false, type: Number, description: "만료 시간(초)" })
  @ApiResponse({ status: 200, description: "Signed URL 반환" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @ApiResponse({ status: 404, description: "파일을 찾을 수 없음" })
  @UseGuards(JwtAuthGuard)
  @Get(":id/signed-url")
  async getSignedUrl(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Query("expiresIn") expiresIn?: string
  ): Promise<{ url: string; expiresIn: number }> {
    const expiry = expiresIn ? parseInt(expiresIn, 10) : 3600;
    const url = await this.fileService.getSignedUrl(id, user.id);

    return { url, expiresIn: expiry };
  }

  /**
   * POST /api/files/signed-upload-url
   * Client Direct Upload용 Signed Upload URL 발급
   */
  @ApiBearerAuth()
  @ApiOperation({ summary: "Direct Upload용 Signed Upload URL 발급" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        bucket: { type: "string" },
        filename: { type: "string" },
      },
      required: ["filename"],
    },
  })
  @ApiResponse({ status: 201, description: "Signed Upload URL 반환" })
  @ApiResponse({ status: 400, description: "filename 누락" })
  @UseGuards(JwtAuthGuard)
  @Post("signed-upload-url")
  async createSignedUploadUrl(
    @Req() request: FastifyRequest,
    @CurrentUser() user: User
  ): Promise<SignedUploadUrlResponse> {
    const body = request.body as { bucket?: string; filename?: string };
    const bucket = body?.bucket ?? "files";
    const filename = body?.filename;

    if (!filename) {
      throw new BadRequestException("filename is required");
    }

    return this.fileService.createSignedUploadUrl(bucket, filename, user.id);
  }
}
