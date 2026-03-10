/**
 * Feature Configuration
 *
 * 앱에 연결된 Feature들의 Admin 메뉴 설정
 * Feature 추가/제거 시 이 파일을 수정합니다.
 */
// Feature에서 경로 상수 import
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bot,
  CalendarCheck,
  CreditCard,
  FolderOpen,
  GraduationCap,
  LayoutList,
  Megaphone,
  Package,
  Palette,
  ScrollText,
  Sparkles,
  Star,
  Ticket,
  Timer,
  UserCog,
  Users,
} from "lucide-react";
import { AGENT_ADMIN_PATH } from "./features/agent";
import { ANALYTICS_ADMIN_PATH } from "./features/analytics";
import { AUDIT_LOG_ADMIN_PATH } from "./features/audit-log";
import { BOARD_ADMIN_PATH } from "./features/board";
import {
  BOOKING_ADMIN_BOOKINGS_PATH,
  BOOKING_ADMIN_CATEGORIES_PATH,
  BOOKING_ADMIN_PATH,
  BOOKING_ADMIN_PRODUCTS_PATH,
  BOOKING_ADMIN_PROVIDERS_PATH,
  BOOKING_ADMIN_REFUND_POLICY_PATH,
} from "./features/booking";
import {
  COMMUNITY_ADMIN_PATH,
  COMMUNITY_ADMIN_REPORTS_PATH,
  COMMUNITY_ADMIN_STATS_PATH,
  COMMUNITY_ADMIN_USERS_PATH,
} from "./features/community";
import { CONTENT_STUDIO_ADMIN_PATH } from "./features/content-studio";
import { COUPON_ADMIN_PATH } from "./features/coupon";
import { COURSE_ADMIN_PATH, COURSE_ADMIN_TOPICS_PATH } from "./features/course";
import { DATA_TRACKER_ADMIN_PATH } from "./features/data-tracker";
import { FILE_MANAGER_ADMIN_PATH } from "./features/file-manager";
import { HELLO_WORLD_ADMIN_PATH } from "./features/hello-world";
import { MARKETING_ADMIN_PATH } from "./features/marketing";
import {
  PAYMENT_ADMIN_CREDITS_PATH,
  PAYMENT_ADMIN_PATH,
  PAYMENT_ADMIN_PLANS_PATH,
  PAYMENT_ADMIN_PRICING_PATH,
  PAYMENT_ADMIN_SUBSCRIBERS_PATH,
} from "./features/payment";
import { REVIEW_ADMIN_PATH } from "./features/review";
import { ROLES_ADMIN_PATH, TERMS_ADMIN_PATH, USERS_ADMIN_PATH } from "./features/role-permission";
import { FEATURE_CATALOG_ADMIN_PATH } from "./features/feature-catalog";
import { SCHEDULER_ADMIN_PATH } from "./features/scheduled-job";

// ============================================================================
// Types
// ============================================================================

export interface FeatureAdminSubmenu {
  id: string;
  label: string;
  path: string;
}

export interface FeatureAdminMenu {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  order: number;
  submenus?: FeatureAdminSubmenu[];
}

// ============================================================================
// Feature Admin Menus
// ============================================================================

/**
 * Admin 사이드바에 표시할 Feature 메뉴 목록
 *
 * Feature 추가 시:
 * 1. Feature에서 경로 상수 import (예: BLOG_ADMIN_PATH)
 * 2. 아래 배열에 메뉴 항목 추가
 *
 * @example
 * ```ts
 * import { BLOG_ADMIN_PATH } from "@superbuilder/features-server/blog";
 * import { FileText } from "lucide-react";
 *
 * export const featureAdminMenus: FeatureAdminMenu[] = [
 *   // ... existing menus
 *   {
 *     id: "blog",
 *     label: "블로그",
 *     path: BLOG_ADMIN_PATH,
 *     icon: FileText,
 *     order: 10,
 *   },
 * ];
 * ```
 */
export const featureAdminMenus: FeatureAdminMenu[] = [
  {
    id: "user-management",
    label: "사용자 관리",
    path: USERS_ADMIN_PATH,
    icon: UserCog,
    order: 2,
    submenus: [
      {
        id: "user-list",
        label: "사용자 목록",
        path: USERS_ADMIN_PATH,
      },
      {
        id: "role-management",
        label: "역할 관리",
        path: ROLES_ADMIN_PATH,
      },
      {
        id: "terms-management",
        label: "약관 관리",
        path: TERMS_ADMIN_PATH,
      },
    ],
  },
  {
    id: "board",
    label: "게시판",
    path: BOARD_ADMIN_PATH,
    icon: LayoutList,
    order: 10,
  },
  {
    id: "community",
    label: "커뮤니티",
    path: COMMUNITY_ADMIN_PATH,
    icon: Users,
    order: 15,
    submenus: [
      {
        id: "community-list",
        label: "커뮤니티 관리",
        path: COMMUNITY_ADMIN_PATH,
      },
      {
        id: "community-reports",
        label: "신고 관리",
        path: COMMUNITY_ADMIN_REPORTS_PATH,
      },
      {
        id: "community-stats",
        label: "통계",
        path: COMMUNITY_ADMIN_STATS_PATH,
      },
      {
        id: "community-users",
        label: "사용자 관리",
        path: COMMUNITY_ADMIN_USERS_PATH,
      },
    ],
  },
  {
    id: "file-manager",
    label: "파일 관리",
    path: FILE_MANAGER_ADMIN_PATH,
    icon: FolderOpen,
    order: 20,
  },
  {
    id: "review",
    label: "리뷰 관리",
    path: REVIEW_ADMIN_PATH,
    icon: Star,
    order: 30,
  },
  {
    id: "hello-world",
    label: "Hello World",
    path: HELLO_WORLD_ADMIN_PATH,
    icon: Sparkles,
    order: 100,
  },
  {
    id: "agent",
    label: "AI 에이전트",
    path: AGENT_ADMIN_PATH,
    icon: Bot,
    order: 5,
  },
  {
    id: "marketing",
    label: "마케팅",
    path: MARKETING_ADMIN_PATH,
    icon: Megaphone,
    order: 8,
  },
  {
    id: "payment",
    label: "결제",
    path: PAYMENT_ADMIN_PATH,
    icon: CreditCard,
    order: 25,
    submenus: [
      {
        id: "payment-dashboard",
        label: "대시보드",
        path: PAYMENT_ADMIN_PATH,
      },
      {
        id: "payment-plans",
        label: "플랜 관리",
        path: PAYMENT_ADMIN_PLANS_PATH,
      },
      {
        id: "payment-subscribers",
        label: "구독자 관리",
        path: PAYMENT_ADMIN_SUBSCRIBERS_PATH,
      },
      {
        id: "payment-credits",
        label: "크레딧 관리",
        path: PAYMENT_ADMIN_CREDITS_PATH,
      },
      {
        id: "payment-pricing",
        label: "모델 가격",
        path: PAYMENT_ADMIN_PRICING_PATH,
      },
    ],
  },
  {
    id: "scheduler",
    label: "스케줄러",
    path: SCHEDULER_ADMIN_PATH,
    icon: Timer,
    order: 35,
  },
  {
    id: "audit-log",
    label: "감사 로그",
    path: AUDIT_LOG_ADMIN_PATH,
    icon: ScrollText,
    order: 36,
  },
  {
    id: "analytics",
    label: "분석",
    path: ANALYTICS_ADMIN_PATH,
    icon: BarChart3,
    order: 3,
  },
  {
    id: "content-studio",
    label: "콘텐츠 스튜디오",
    path: CONTENT_STUDIO_ADMIN_PATH,
    icon: Palette,
    order: 35,
  },
  {
    id: "course",
    label: "강의 관리",
    path: COURSE_ADMIN_PATH,
    icon: GraduationCap,
    order: 12,
    submenus: [
      {
        id: "course-list",
        label: "강의 목록",
        path: COURSE_ADMIN_PATH,
      },
      {
        id: "course-topics",
        label: "주제 관리",
        path: COURSE_ADMIN_TOPICS_PATH,
      },
    ],
  },
  {
    id: "booking",
    label: "예약 관리",
    path: BOOKING_ADMIN_PATH,
    icon: CalendarCheck,
    order: 13,
    submenus: [
      {
        id: "booking-dashboard",
        label: "대시보드",
        path: BOOKING_ADMIN_PATH,
      },
      {
        id: "booking-providers",
        label: "상담사 관리",
        path: BOOKING_ADMIN_PROVIDERS_PATH,
      },
      {
        id: "booking-products",
        label: "세션 상품",
        path: BOOKING_ADMIN_PRODUCTS_PATH,
      },
      {
        id: "booking-categories",
        label: "카테고리",
        path: BOOKING_ADMIN_CATEGORIES_PATH,
      },
      {
        id: "booking-bookings",
        label: "예약 목록",
        path: BOOKING_ADMIN_BOOKINGS_PATH,
      },
      {
        id: "booking-refund-policy",
        label: "환불 정책",
        path: BOOKING_ADMIN_REFUND_POLICY_PATH,
      },
    ],
  },
  {
    id: "data-tracker",
    label: "데이터 트래커",
    path: DATA_TRACKER_ADMIN_PATH,
    icon: Activity,
    order: 40,
  },
  {
    id: "coupon",
    label: "쿠폰",
    path: COUPON_ADMIN_PATH,
    icon: Ticket,
    order: 26,
  },
  {
    id: "feature-catalog",
    label: "Feature 카탈로그",
    path: FEATURE_CATALOG_ADMIN_PATH,
    icon: Package,
    order: 50,
  },
  // Feature 추가 시 여기에 등록
];

/**
 * order 기준으로 정렬된 메뉴 목록 반환
 */
export function getSortedFeatureMenus(): FeatureAdminMenu[] {
  return [...featureAdminMenus].sort((a, b) => a.order - b.order);
}
