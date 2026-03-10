import type { RefundRule } from "@superbuilder/drizzle";

// 상담사 + 프로필 + 카테고리 정보
export interface ProviderWithDetails {
  id: string;
  profileId: string;
  name: string;
  email: string;
  avatar: string | null;
  bio: string | null;
  experienceYears: number | null;
  consultationMode: string;
  languages: string[];
  status: string;
  createdAt: Date | string | null;
  categories: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
  }[];
  products: {
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  }[];
}

// 예약 상세 (고객/상담사/상품 포함)
export interface BookingWithDetails {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerAvatar: string | null;
  providerId: string;
  providerName: string;
  providerAvatar: string | null;
  productId: string;
  productName: string;
  durationMinutes: number;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: string;
  consultationMode: string;
  meetingLink: string | null;
  location: string | null;
  paymentAmount: number;
  refundAmount: number | null;
  cancellationReason: string | null;
  createdAt: string;
}

// 가용 슬롯
export interface AvailableSlot {
  date: string;
  startTime: string;
  endTime: string;
  available: boolean;
}

// 매칭 결과
export interface MatchResult {
  provider: ProviderWithDetails;
  score: number;
  reasons: string[];
}

// 환불 미리보기
export interface RefundPreview {
  refundAmount: number;
  refundPercentage: number;
  appliedRule: RefundRule | null;
  reason: string;
}

// Admin 예약 목록 아이템 (JOIN된 이름 포함)
export interface AdminBookingListItem {
  id: string;
  customerId: string;
  customerName: string;
  providerId: string;
  providerName: string;
  productId: string;
  productName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: string;
  consultationMode: string;
  paymentAmount: number;
  refundAmount: number | null;
  cancellationReason: string | null;
  createdAt: string;
}

// Admin 통합 통계
export interface AdminBookingStats {
  totalCategories: number;
  activeCategories: number;
  totalProviders: number;
  activeProviders: number;
  pendingProviders: number;
  totalProducts: number;
  activeProducts: number;
  totalBookings: number;
  todayBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  refundedBookings: number;
  noShowBookings: number;
  totalRevenue: number;
}

// 페이지네이션 결과
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
