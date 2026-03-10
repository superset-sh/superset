import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { JwtAuthGuard, CurrentUser, type User } from "../../../core/nestjs/auth";
import { CouponService } from "../service/coupon.service";
import type { ValidateCouponDto } from "../dto/validate-coupon.dto";
import type { ApplyCouponDto } from "../dto/apply-coupon.dto";

@ApiTags("Coupon")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("coupon")
export class CouponUserController {
  constructor(private readonly couponService: CouponService) {}

  @Post("validate")
  @ApiOperation({ summary: "쿠폰 코드 검증" })
  @ApiResponse({ status: 200, description: "검증 결과" })
  async validate(@CurrentUser() user: User, @Body() dto: ValidateCouponDto) {
    return this.couponService.validate(dto, user.id);
  }

  @Post("apply")
  @ApiOperation({ summary: "쿠폰 적용" })
  @ApiResponse({ status: 200, description: "쿠폰 적용 성공" })
  @ApiResponse({ status: 400, description: "검증 실패" })
  @ApiResponse({ status: 409, description: "이미 적용 중인 쿠폰" })
  async apply(@CurrentUser() user: User, @Body() dto: ApplyCouponDto) {
    return this.couponService.apply(dto, user.id);
  }

  @Get("my")
  @ApiOperation({ summary: "내 활성 쿠폰 조회" })
  @ApiResponse({ status: 200, description: "활성 쿠폰 목록" })
  async myRedemption(@CurrentUser() user: User) {
    return this.couponService.getMyRedemption(user.id);
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "쿠폰 해제" })
  @ApiResponse({ status: 200, description: "쿠폰 해제 성공" })
  async cancel(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.couponService.cancel(id, user.id);
  }
}
