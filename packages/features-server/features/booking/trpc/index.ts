/**
 * Booking tRPC Routers
 */
import { router, createServiceContainer } from "../../../core/trpc";
import type {
  CategoryService,
  ProviderService,
  SessionProductService,
  AvailabilityService,
  BookingService,
  MatchingService,
  RefundService,
} from "../service";

import { categoryRouter } from "./category.route";
import { providerRouter } from "./provider.route";
import { productRouter } from "./product.route";
import { availabilityRouter } from "./availability.route";
import { bookingRouter } from "./booking.route";
import { matchingRouter } from "./matching.route";
import { refundRouter } from "./refund.route";
import { bookingAdminRouter } from "./admin.route";

// ============================================================================
// Shared Service Container
// ============================================================================

const services = createServiceContainer<{
  categoryService: CategoryService;
  providerService: ProviderService;
  sessionProductService: SessionProductService;
  availabilityService: AvailabilityService;
  bookingService: BookingService;
  matchingService: MatchingService;
  refundService: RefundService;
}>();

export const getBookingServices = services.get;
export const injectBookingServices = services.inject;

// 통합 라우터
export const bookingMainRouter = router({
  category: categoryRouter,
  provider: providerRouter,
  product: productRouter,
  availability: availabilityRouter,
  booking: bookingRouter,
  matching: matchingRouter,
  refund: refundRouter,
  admin: bookingAdminRouter,
});

export type BookingMainRouter = typeof bookingMainRouter;
