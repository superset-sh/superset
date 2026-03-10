/**
 * App Shell 01 - Compact Sidebar 레이아웃
 *
 * packages/ui의 공유 SidebarLayout 사용
 */
import { useCallback } from "react";
import { AuthGuard, authenticatedAtom, getSupabaseAtom, profileAtom } from "@superbuilder/features-client/core/auth";
import LogoSvg from "@superbuilder/feature-ui/assets/svg/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@superbuilder/feature-ui/layouts/compact-sidebar";
import { SidebarLayout } from "@superbuilder/feature-ui/layouts/sidebar-layout";
import { SidebarUserFooter } from "@superbuilder/feature-ui/layouts/sidebar-user-footer";
import { DropdownMenuItem, DropdownMenuSeparator } from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import {
  BookOpen,
  Bot,
  CalendarCheck,
  CalendarDays,
  CheckSquare,
  ImagePlus,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  LogOut,
  Megaphone,
  MessageSquare,
  Palette,
  Rocket,
  Settings,
  User,
  Users,
} from "lucide-react";
import { OnboardingModal, useOnboarding } from "@superbuilder/widgets/onboarding";
import { SettingsModal, useSettingsModal } from "@/features/settings";
import { useTRPC } from "@/lib/trpc";

export function AppShell01() {
  const navigate = useNavigate();
  const authenticated = useAtomValue(authenticatedAtom);

  const handleUnauthenticated = useCallback(() => {
    navigate({ to: "/sign-in", replace: true });
  }, [navigate]);

  return (
    <AuthGuard authenticated={authenticated} onUnauthenticated={handleUnauthenticated}>
      <SidebarLayout compact sidebar={<AppSidebar />}>
        <Outlet />
      </SidebarLayout>
      <SettingsModal />
      <OnboardingModal />
    </AuthGuard>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function AppSidebar() {
  const profile = useAtomValue(profileAtom);
  const supabase = useAtomValue(getSupabaseAtom);
  const navigate = useNavigate();
  const { setOpen: setSettingsOpen } = useSettingsModal();
  const { reopen: reopenOnboarding } = useOnboarding();
  const trpc = useTRPC();
  const { data: subscription } = useQuery(trpc.payment.getMySubscription.queryOptions());

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/sign-in", replace: true });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <LogoSvg className="size-5" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">Feature Atlas</span>
                <span className="text-muted-foreground text-xs">Dashboard</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/" />}>
                  <LayoutDashboard />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/board" />}>
                  <MessageSquare />
                  <span>게시판</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/tasks" search={{ view: undefined }} />}>
                  <CheckSquare />
                  <span>태스크</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/communities" />}>
                  <Users />
                  <span>커뮤니티</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/features" />}>
                  <LayoutGrid />
                  <span>Feature 카탈로그</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>예약 상담</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/my/bookings" />}>
                  <CalendarCheck />
                  <span>내 예약</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>에이전트 데스크</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/agent-desk" />}>
                  <Bot />
                  <span>서비스 생성</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/agent-desk/operator" />}>
                  <MessageSquare />
                  <span>Feature 분석</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/agent-desk/designer" />}>
                  <Palette />
                  <span>화면 흐름 설계</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>AI 도구</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/ai-image" />}>
                  <ImagePlus />
                  <span>이미지 생성</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>스토리 스튜디오</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/story-studio" />}>
                  <BookOpen />
                  <span>스토리 스튜디오</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>콘텐츠 스튜디오</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/content-studio" />}>
                  <Palette />
                  <span>스튜디오</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/content-studio/calendar" />}>
                  <CalendarDays />
                  <span>캘린더</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>마케팅</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/marketing" />}>
                  <Megaphone />
                  <span>캠페인</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/marketing/calendar" />}>
                  <CalendarDays />
                  <span>발행 캘린더</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/marketing/accounts" />}>
                  <Link2 />
                  <span>SNS 계정</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>가이드</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={reopenOnboarding}>
                  <Rocket />
                  <span>온보딩</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarUserFooter
        user={{
          name: profile?.name,
          email: profile?.email,
          avatar: profile?.avatar,
          planName: subscription?.product?.name ?? "Free",
        }}
        menuItems={
          <>
            <DropdownMenuItem>
              <Link to="/profile" className="flex w-full cursor-pointer items-center">
                <User className="mr-2 size-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSettingsOpen(true)} className="cursor-pointer">
              <Settings className="mr-2 size-4" />
              설정
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
              <LogOut className="mr-2 size-4" />
              Sign Out
            </DropdownMenuItem>
          </>
        }
      />
    </Sidebar>
  );
}
