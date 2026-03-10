import { Module, OnModuleInit } from "@nestjs/common";
import { CouponService } from "./service";
import { CouponAdminController, CouponUserController } from "./controller";
import { setCouponService } from "./coupon.router";

@Module({
  controllers: [CouponAdminController, CouponUserController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule implements OnModuleInit {
  constructor(private readonly couponService: CouponService) {}

  onModuleInit() {
    setCouponService(this.couponService);
  }
}
