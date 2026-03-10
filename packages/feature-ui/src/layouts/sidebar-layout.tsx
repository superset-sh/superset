/**
 * Sidebar Layout — 공유 레이아웃 셸
 *
 * 두 앱(apps/features-app, apps/feature-admin)에서 공통으로 사용하는
 * Sidebar + Header + Main 구조를 제공합니다.
 */
import { cn } from "@superbuilder/feature-ui/lib/utils";
import {
  SidebarInset,
  SidebarProvider as OriginalSidebarProvider,
  SidebarTrigger,
} from "@superbuilder/feature-ui/shadcn/sidebar";
import { SidebarProvider as CompactSidebarProvider } from "./compact-sidebar";

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface SidebarLayoutProps {
  /** 사이드바 전체 (Sidebar + 콘텐츠) */
  sidebar: React.ReactNode;
  /** 메인 콘텐츠 (Outlet) */
  children: React.ReactNode;
  /** 헤더 좌측 (SidebarTrigger 오른쪽에 추가) */
  headerLeft?: React.ReactNode;
  /** 헤더 우측 */
  headerRight?: React.ReactNode;
  /** 메인 영역 커스텀 클래스 */
  mainClassName?: string;
  /** compact(Linear) 스타일 사이드바 사용 */
  compact?: boolean;
}

/* -------------------------------------------------------------------------------------------------
 * Component
 * -----------------------------------------------------------------------------------------------*/

export function SidebarLayout({
  sidebar,
  children,
  headerLeft,
  headerRight,
  mainClassName,
  compact = false,
}: SidebarLayoutProps) {
  const Provider = compact ? CompactSidebarProvider : OriginalSidebarProvider;

  return (
    <Provider className="max-h-dvh overflow-hidden">
      {sidebar}
      <SidebarInset className="min-w-0">
        <header className="flex h-12 items-center gap-2 border-b border-sidebar-border px-6">
          <SidebarTrigger />
          {headerLeft}
          <div className="flex-1" />
          {headerRight}
        </header>
        <main className={cn("flex-1 overflow-auto px-10 py-6", mainClassName)}>
          {children}
        </main>
      </SidebarInset>
    </Provider>
  );
}
