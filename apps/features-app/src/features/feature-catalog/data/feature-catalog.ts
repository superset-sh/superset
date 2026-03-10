import type { LucideIcon } from "lucide-react";
import {
  Shield, User, Lock,
  FileText, LayoutList, Users, GraduationCap, BarChart3,
  Palette, ImagePlus, BookOpen, Bot,
  Megaphone,
  CreditCard, CalendarCheck, Ticket,
  Bell, TrendingUp, ScrollText, Clock, Mail,
  MessageSquare, Heart, Star, Bookmark, FolderOpen, Rocket,
} from "lucide-react";

export type FeatureGroup = "core" | "content" | "ai-creative" | "marketing" | "commerce" | "system" | "widget";
export type FeatureType = "page" | "widget" | "agent";
export type FeatureStatus = "active" | "wip" | "planned";

export interface FeaturePage {
  label: string;
  path: string;
}

export interface FeatureCatalogItem {
  id: string;
  name: string;
  icon: LucideIcon;
  description: string;
  group: FeatureGroup;
  type: FeatureType;
  pages: FeaturePage[];
  services: string[];
  tables: string[];
  status: FeatureStatus;
}

export interface FeatureGroupInfo {
  id: FeatureGroup;
  label: string;
  description: string;
}

export const FEATURE_GROUPS: FeatureGroupInfo[] = [
  { id: "core", label: "Core", description: "시스템 핵심 기반" },
  { id: "content", label: "Content", description: "콘텐츠 관리" },
  { id: "ai-creative", label: "AI / Creative", description: "AI 기반 창작 도구" },
  { id: "marketing", label: "Marketing", description: "마케팅 자동화" },
  { id: "commerce", label: "Commerce", description: "결제 및 상거래" },
  { id: "system", label: "System", description: "시스템 관리 및 모니터링" },
  { id: "widget", label: "Widget", description: "재사용 Connected 컴포넌트" },
];

export const FEATURE_CATALOG: FeatureCatalogItem[] = [
  // ── Core ──
  {
    id: "auth",
    name: "인증",
    icon: Shield,
    description: "로그인, 회원가입, 세션 관리",
    group: "core",
    type: "page",
    pages: [
      { label: "로그인", path: "/sign-in" },
      { label: "회원가입", path: "/sign-up" },
    ],
    services: ["Session 관리", "JWT 토큰", "Supabase Auth 연동"],
    tables: ["profiles"],
    status: "active",
  },
  {
    id: "profile",
    name: "프로필",
    icon: User,
    description: "사용자 프로필 조회 및 수정",
    group: "core",
    type: "page",
    pages: [{ label: "프로필", path: "/profile" }],
    services: ["프로필 조회/수정", "아바타 업로드"],
    tables: ["profiles"],
    status: "active",
  },
  {
    id: "role-permission",
    name: "역할 권한",
    icon: Lock,
    description: "역할 기반 접근 제어 (RBAC)",
    group: "core",
    type: "page",
    pages: [{ label: "내 권한", path: "/my-permissions" }],
    services: ["역할 관리", "권한 할당", "인가 검사"],
    tables: ["roles", "permissions", "role_permissions", "user_roles"],
    status: "active",
  },

  // ── Content ──
  {
    id: "blog",
    name: "블로그",
    icon: FileText,
    description: "게시물 작성, 조회, 관리",
    group: "content",
    type: "page",
    pages: [],
    services: ["게시물 CRUD", "슬러그 조회", "박수/댓글", "북마크"],
    tables: ["blog_posts", "blog_claps", "blog_responses"],
    status: "wip",
  },
  {
    id: "board",
    name: "게시판",
    icon: LayoutList,
    description: "게시판 및 게시물 관리",
    group: "content",
    type: "page",
    pages: [
      { label: "게시판 목록", path: "/board" },
      { label: "글쓰기", path: "/board/write" },
    ],
    services: ["게시판 CRUD", "게시물 CRUD", "슬러그 조회"],
    tables: ["board_boards", "board_posts"],
    status: "active",
  },
  {
    id: "community",
    name: "커뮤니티",
    icon: Users,
    description: "커뮤니티 생성, 멤버십, 신고, 중재",
    group: "content",
    type: "page",
    pages: [
      { label: "홈 피드", path: "/home" },
      { label: "커뮤니티 목록", path: "/communities" },
      { label: "커뮤니티 생성", path: "/communities/create" },
    ],
    services: ["커뮤니티 CRUD", "멤버십 관리", "신고 시스템", "자동 중재"],
    tables: ["community_communities", "community_posts", "community_members", "community_reports"],
    status: "active",
  },
  {
    id: "course",
    name: "강의",
    icon: GraduationCap,
    description: "강의 콘텐츠 관리, 수강신청, 진행률",
    group: "content",
    type: "page",
    pages: [{ label: "강의 목록", path: "/course" }],
    services: ["강의 CRUD", "레슨/섹션 관리", "수강신청", "진행률 추적"],
    tables: ["course_courses", "course_sections", "course_lessons", "course_enrollments"],
    status: "active",
  },
  {
    id: "data-tracker",
    name: "데이터 트래커",
    icon: BarChart3,
    description: "커스텀 데이터 추적 및 분석",
    group: "content",
    type: "page",
    pages: [{ label: "트래커", path: "/data-tracker" }],
    services: ["데이터 추적", "메트릭 조회", "추적기 관리"],
    tables: ["data_tracker_trackers", "data_tracker_entries"],
    status: "active",
  },

  // ── AI / Creative ──
  {
    id: "content-studio",
    name: "콘텐츠 스튜디오",
    icon: Palette,
    description: "React Flow 캔버스 기반 콘텐츠 작성, 리퍼포징, SEO, 브랜드 보이스",
    group: "ai-creative",
    type: "page",
    pages: [
      { label: "스튜디오 목록", path: "/content-studio" },
      { label: "캘린더", path: "/content-studio/calendar" },
    ],
    services: [
      "스튜디오/토픽/콘텐츠 CRUD",
      "캔버스 데이터 (노드/엣지)",
      "리퍼포징 (카드뉴스, 숏폼, 트윗, 이메일)",
      "SEO 최적화/분석",
      "브랜드 보이스 프로필/프리셋",
      "AI 콘텐츠/토픽 제안",
      "반복 규칙 (Recurrence)",
      "콘텐츠 스케줄링",
    ],
    tables: ["studio_studios", "studio_topics", "studio_contents", "studio_edges", "studio_brand_voices"],
    status: "active",
  },
  {
    id: "ai-image",
    name: "AI 이미지",
    icon: ImagePlus,
    description: "AI 이미지 생성 (인스타 피드, 캐러셀, 스토리, 릴스 커버)",
    group: "ai-creative",
    type: "page",
    pages: [{ label: "이미지 생성", path: "/ai-image" }],
    services: [
      "이미지 생성 (프롬프트 + 스타일)",
      "생성 히스토리/즐겨찾기",
      "스타일 템플릿 관리",
      "콘텐츠 테마 시스템",
    ],
    tables: ["ai_image_generations", "ai_image_style_templates", "ai_image_content_themes"],
    status: "active",
  },
  {
    id: "story-studio",
    name: "스토리 스튜디오",
    icon: BookOpen,
    description: "대화형 스토리 에디터 (챕터, 캐릭터, 대사, 플래그, 그래프)",
    group: "ai-creative",
    type: "page",
    pages: [{ label: "프로젝트 목록", path: "/story-studio" }],
    services: [
      "프로젝트 CRUD",
      "챕터 관리/순서 변경",
      "캐릭터 관리",
      "대사/선택지",
      "이벤트/비트/엔딩",
      "플래그/변수 시스템",
      "스토리 그래프 (빌드/검증/경로 탐색)",
      "검증 (프로젝트/대사/이벤트)",
      "내보내기 (JSON, Markdown)",
    ],
    tables: [
      "story_studio_projects", "story_studio_chapters", "story_studio_characters",
      "story_studio_dialogues", "story_studio_graph_nodes",
      "story_studio_beats", "story_studio_events", "story_studio_endings", "story_studio_flags",
    ],
    status: "active",
  },
  {
    id: "agent-desk",
    name: "에이전트 데스크",
    icon: Bot,
    description: "명세서 → 화면 자동 설계 AI 에이전트",
    group: "ai-creative",
    type: "agent",
    pages: [
      { label: "서비스 생성", path: "/agent-desk" },
      { label: "Feature 분석", path: "/agent-desk/operator" },
      { label: "화면 흐름 설계", path: "/agent-desk/designer" },
    ],
    services: [
      "세션 관리 (상태 플로우)",
      "파일 업로드/파싱",
      "요구사항 분석/정규화",
      "화면 후보 생성/순위",
      "UI 컴포넌트 해석",
      "다이어그램 생성",
      "흐름 그래프 빌드",
      "실행 엔진",
      "캔버스 내보내기",
      "핸드오프 문서 생성",
      "Linear 연동 발행",
      "LLM 스트리밍 (Flow Agent/Designer)",
    ],
    tables: ["agent_desk_sessions", "agent_desk_files", "agent_desk_messages", "agent_desk_executions"],
    status: "active",
  },

  // ── Marketing ──
  {
    id: "marketing",
    name: "마케팅",
    icon: Megaphone,
    description: "캠페인 관리, 다중 SNS 발행 (Instagram, Facebook, X, Threads, LinkedIn)",
    group: "marketing",
    type: "page",
    pages: [
      { label: "대시보드", path: "/marketing" },
      { label: "캠페인 생성", path: "/marketing/campaigns/new" },
      { label: "발행 캘린더", path: "/marketing/calendar" },
      { label: "SNS 계정", path: "/marketing/accounts" },
    ],
    services: [
      "캠페인 CRUD",
      "콘텐츠 CRUD / 소스 변환",
      "SNS 계정 연동/토큰 갱신",
      "멀티채널 발행 오케스트레이션",
      "플랫폼별 어댑터 (5개 SNS)",
      "예약 발행 스케줄",
      "UTM 추적 URL 생성",
    ],
    tables: ["marketing_campaigns", "marketing_contents", "marketing_platform_variants", "marketing_publications", "marketing_sns_accounts"],
    status: "active",
  },

  // ── Commerce ──
  {
    id: "payment",
    name: "결제",
    icon: CreditCard,
    description: "결제, 구독 플랜, 크레딧, 모델 가격",
    group: "commerce",
    type: "page",
    pages: [
      { label: "상품", path: "/payment/products" },
      { label: "구독", path: "/payment/subscription" },
    ],
    services: [
      "결제 생성/확인/환불",
      "구독 플랜 관리",
      "크레딧 잔액/충전/차감",
      "모델별 가격 계산",
      "Webhook 처리",
      "결제 게이트웨이 (이니시스, Lemon Squeezy)",
    ],
    tables: ["payment_payments", "payment_plans", "payment_subscriptions", "payment_credits"],
    status: "active",
  },
  {
    id: "booking",
    name: "예약 상담",
    icon: CalendarCheck,
    description: "예약, 상담사 매칭, 세션 상품, 환불",
    group: "commerce",
    type: "page",
    pages: [
      { label: "예약", path: "/booking" },
      { label: "내 예약", path: "/booking/my" },
    ],
    services: [
      "예약 생성/확인/완료/노쇼",
      "상담사 관리/가용성",
      "세션 상품 관리",
      "카테고리 관리",
      "예약 슬롯 조회",
      "상담사 매칭",
      "환불 요청/처리",
    ],
    tables: ["booking_bookings", "booking_providers", "booking_session_products", "booking_categories", "booking_availability"],
    status: "active",
  },
  {
    id: "coupon",
    name: "쿠폰",
    icon: Ticket,
    description: "쿠폰 생성, 유효성 검증, 사용",
    group: "commerce",
    type: "page",
    pages: [],
    services: ["쿠폰 CRUD", "유효성 검증", "쿠폰 사용"],
    tables: ["coupon_coupons", "coupon_redemptions"],
    status: "active",
  },

  // ── System ──
  {
    id: "notification",
    name: "알림",
    icon: Bell,
    description: "알림 목록, 읽음 처리, 설정, 브로드캐스트",
    group: "system",
    type: "page",
    pages: [{ label: "알림", path: "/notifications" }],
    services: ["알림 목록/읽음 처리", "미읽음 개수", "알림 설정", "브로드캐스트"],
    tables: ["notification_notifications", "notification_settings"],
    status: "active",
  },
  {
    id: "analytics",
    name: "분석",
    icon: TrendingUp,
    description: "이벤트 추적, 대시보드 개요, 추세/분포 분석",
    group: "system",
    type: "page",
    pages: [],
    services: ["이벤트 추적", "대시보드 개요", "추세 분석", "분포 분석", "일일 집계"],
    tables: ["system_analytics_events", "system_analytics_daily"],
    status: "active",
  },
  {
    id: "audit-log",
    name: "감사 로그",
    icon: ScrollText,
    description: "관리자 작업 추적 및 로그 조회",
    group: "system",
    type: "page",
    pages: [],
    services: ["감사 로그 기록", "로그 목록 (필터/정렬)", "로그 상세"],
    tables: ["system_audit_logs"],
    status: "active",
  },
  {
    id: "scheduled-job",
    name: "스케줄러",
    icon: Clock,
    description: "백그라운드 Cron 작업 관리",
    group: "system",
    type: "page",
    pages: [],
    services: ["작업 목록/토글", "실행 히스토리", "Cron 실행 (Content Studio 반복 등)"],
    tables: ["system_scheduled_jobs", "system_job_runs"],
    status: "active",
  },
  {
    id: "email",
    name: "이메일",
    icon: Mail,
    description: "이메일 발송 서비스",
    group: "system",
    type: "page",
    pages: [],
    services: ["이메일 발송", "템플릿 관리"],
    tables: [],
    status: "active",
  },

  // ── Widget ──
  {
    id: "comment",
    name: "댓글",
    icon: MessageSquare,
    description: "다형성 댓글 (targetType + targetId)",
    group: "widget",
    type: "widget",
    pages: [],
    services: ["댓글 CRUD", "대댓글 조회", "댓글 개수"],
    tables: ["comments"],
    status: "active",
  },
  {
    id: "reaction",
    name: "반응",
    icon: Heart,
    description: "다형성 이모지 반응 (좋아요 등)",
    group: "widget",
    type: "widget",
    pages: [],
    services: ["반응 토글", "반응 개수", "배치 조회"],
    tables: ["reactions"],
    status: "active",
  },
  {
    id: "review",
    name: "리뷰",
    icon: Star,
    description: "다형성 리뷰 (별점 + 텍스트)",
    group: "widget",
    type: "widget",
    pages: [],
    services: ["리뷰 CRUD", "중복 검사", "관리자 승인/거절"],
    tables: ["reviews"],
    status: "active",
  },
  {
    id: "bookmark",
    name: "북마크",
    icon: Bookmark,
    description: "다형성 북마크 토글",
    group: "widget",
    type: "widget",
    pages: [],
    services: ["북마크 토글", "사용자 북마크 목록", "북마크 개수"],
    tables: ["bookmarks"],
    status: "active",
  },
  {
    id: "file-manager",
    name: "파일 관리",
    icon: FolderOpen,
    description: "파일 업로드, 관리, 공유",
    group: "widget",
    type: "widget",
    pages: [{ label: "파일", path: "/files" }],
    services: ["파일 업로드/삭제", "파일 목록", "파일 공유", "사용량 조회"],
    tables: ["files"],
    status: "active",
  },
  {
    id: "onboarding",
    name: "온보딩",
    icon: Rocket,
    description: "모달/투어 기반 온보딩 가이드",
    group: "widget",
    type: "widget",
    pages: [],
    services: ["온보딩 단계 관리", "완료 상태 추적"],
    tables: [],
    status: "active",
  },
];

export function getFeaturesByGroup(group: FeatureGroup): FeatureCatalogItem[] {
  return FEATURE_CATALOG.filter((f) => f.group === group);
}

export function getFeatureCounts() {
  const total = FEATURE_CATALOG.length;
  const server = FEATURE_CATALOG.filter((f) => f.type !== "widget").length;
  const client = FEATURE_CATALOG.filter((f) => f.pages.length > 0).length;
  const widget = FEATURE_CATALOG.filter((f) => f.type === "widget").length;
  return { total, server, client, widget };
}
