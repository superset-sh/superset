import { Module, type OnModuleInit } from "@nestjs/common";
import {
  CategoryService,
  ProviderService,
  SessionProductService,
  AvailabilityService,
  BookingService,
  MatchingService,
  RefundService,
} from "./service";
import { BookingController, BookingAdminController } from "./controller";
import { injectBookingServices } from "./trpc";

/**
 * Booking Feature Module
 *
 * 상담 예약 시스템 — 카테고리, 상담사, 세션 상품, 가용성,
 * 예약, 매칭, 환불 기능을 제공합니다.
 */
@Module({
  controllers: [BookingController, BookingAdminController],
  providers: [
    CategoryService,
    ProviderService,
    SessionProductService,
    AvailabilityService,
    BookingService,
    MatchingService,
    RefundService,
  ],
  exports: [
    CategoryService,
    ProviderService,
    SessionProductService,
    AvailabilityService,
    BookingService,
    MatchingService,
    RefundService,
  ],
})
export class BookingModule implements OnModuleInit {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly providerService: ProviderService,
    private readonly sessionProductService: SessionProductService,
    private readonly availabilityService: AvailabilityService,
    private readonly bookingService: BookingService,
    private readonly matchingService: MatchingService,
    private readonly refundService: RefundService,
  ) {}

  /**
   * Inject services into tRPC routers on module initialization
   */
  onModuleInit() {
    injectBookingServices({
      categoryService: this.categoryService,
      providerService: this.providerService,
      sessionProductService: this.sessionProductService,
      availabilityService: this.availabilityService,
      bookingService: this.bookingService,
      matchingService: this.matchingService,
      refundService: this.refundService,
    });
  }
}
