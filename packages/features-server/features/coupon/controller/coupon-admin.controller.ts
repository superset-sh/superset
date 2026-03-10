import {
  Controller,
  Get,
  Post,
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
import {
  JwtAuthGuard,
  NestAdminGuard,
  CurrentUser,
  type User,
} from "../../../core/nestjs/auth";
import { CouponService } from "../service/coupon.service";
import type { CreateCouponDto } from "../dto/create-coupon.dto";
import type { UpdateCouponDto } from "../dto/update-coupon.dto";

@ApiTags("Coupon Admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NestAdminGuard)
@Controller("admin/coupon")
export class CouponAdminController {
  constructor(private readonly couponService: CouponService) {}

  @Post()
  @ApiOperation({ summary: "쿠폰 생성" })
  @ApiResponse({ status: 201, description: "쿠폰 생성 성공" })
  @ApiResponse({ status: 409, description: "쿠폰 코드 중복" })
  async create(@CurrentUser() user: User, @Body() dto: CreateCouponDto) {
    return this.couponService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: "쿠폰 목록 조회" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "쿠폰 목록" })
  async list(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.couponService.list(page, limit);
  }

  @Get(":id")
  @ApiOperation({ summary: "쿠폰 상세 조회 (사용 기록 포함)" })
  @ApiParam({ name: "id", description: "쿠폰 ID" })
  @ApiResponse({ status: 200, description: "쿠폰 상세" })
  @ApiResponse({ status: 404, description: "쿠폰 없음" })
  async getById(@Param("id", ParseUUIDPipe) id: string) {
    return this.couponService.getByIdWithRedemptions(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "쿠폰 수정" })
  @ApiParam({ name: "id", description: "쿠폰 ID" })
  @ApiResponse({ status: 200, description: "쿠폰 수정 성공" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.couponService.update(id, dto);
  }

  @Patch(":id/deactivate")
  @ApiOperation({ summary: "쿠폰 비활성화" })
  @ApiParam({ name: "id", description: "쿠폰 ID" })
  @ApiResponse({ status: 200, description: "쿠폰 비활성화 성공" })
  async deactivate(@Param("id", ParseUUIDPipe) id: string) {
    return this.couponService.deactivate(id);
  }

  @Delete(":id")
  @ApiOperation({ summary: "쿠폰 삭제 (soft delete)" })
  @ApiParam({ name: "id", description: "쿠폰 ID" })
  @ApiResponse({ status: 200, description: "쿠폰 삭제 성공" })
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.couponService.softDelete(id);
  }
}
