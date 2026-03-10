/**
 * Admin Layout - Admin 권한 유저용 레이아웃
 *
 * packages/ui의 공유 SidebarLayout 사용
 */
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AdminGuard,
  authenticatedAtom,
  getSupabaseAtom,
  profileAtom,
  userRoleAtom,
} from "@superbuilder/features-client/core/auth";
import { useTRPC } from "@/lib/trpc";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
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
  SidebarRail,
} from "@superbuilder/feature-ui/layouts/compact-sidebar";
import {
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@superbuilder/feature-ui/shadcn/sidebar";
import { SidebarLayout } from "@superbuilder/feature-ui/layouts/sidebar-layout";
import { SidebarUserFooter } from "@superbuilder/feature-ui/layouts/sidebar-user-footer";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { LayoutDashboard, LogOut, Settings, User } from "lucide-react";
import { getSortedFeatureMenus } from "../feature-config";

export function AdminLayout() {
  const navigate = useNavigate();
  const authenticated = useAtomValue(authenticatedAtom);
  const userRole = useAtomValue(userRoleAtom);

  const handleUnauthenticated = useCallback(() => {
    navigate({ to: "/login", replace: true });
  }, [navigate]);

  const handleUnauthorized = useCallback(() => {
    navigate({ to: "/", replace: true });
  }, [navigate]);

  return (
    <AdminGuard
      authenticated={authenticated}
      userRole={userRole}
      onUnauthenticated={handleUnauthenticated}
      onUnauthorized={handleUnauthorized}
    >
      <SidebarLayout compact sidebar={<AdminSidebar />}>
        <Outlet />
      </SidebarLayout>
    </AdminGuard>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function AdminSidebar() {
  const profile = useAtomValue(profileAtom);
  const supabase = useAtomValue(getSupabaseAtom);
  const navigate = useNavigate();
  const routerState = useRouterState();
  const trpc = useTRPC();
  const { data: subscription } = useQuery(trpc.payment.getMySubscription.queryOptions());
  const currentPath = routerState.location.pathname;

  // Feature 메뉴 조회
  const featureMenus = useMemo(() => getSortedFeatureMenus(), []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <Sidebar collapsible="icon">
      {/* Header */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/" />}>
              <Settings className="size-4" />
              <span className="font-semibold">Atlas Admin</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Content */}
      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link to="/" />}
                  isActive={currentPath === "/"}
                >
                  <LayoutDashboard />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Feature Menus */}
        {featureMenus.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Features</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {featureMenus.map((menu) => {
                  const isMenuActive = currentPath === menu.path
                    || currentPath.startsWith(menu.path + "/")
                    || menu.submenus?.some((sub) => currentPath === sub.path);

                  return (
                    <SidebarMenuItem key={menu.id}>
                      <SidebarMenuButton
                        render={<Link to={menu.path as "/"} />}
                        isActive={isMenuActive}
                      >
                        <menu.icon />
                        <span>{menu.label}</span>
                      </SidebarMenuButton>
                      {menu.submenus && menu.submenus.length > 0 && isMenuActive && (
                        <SidebarMenuSub>
                          {menu.submenus.map((sub) => (
                            <SidebarMenuSubItem key={sub.id}>
                              <SidebarMenuSubButton
                                render={<Link to={sub.path as "/"} />}
                                isActive={currentPath === sub.path}
                              >
                                {sub.label}
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer - User Menu */}
      <SidebarUserFooter
        user={{
          name: profile?.name,
          email: profile?.email,
          avatar: profile?.avatar,
          planName: subscription?.product?.name ?? "Free",
        }}
        fallback={profile?.name?.charAt(0)?.toUpperCase() ?? "A"}
        menuItems={
          <>
            <DropdownMenuItem>
              <Link to="/profile" className="cursor-pointer w-full flex items-center">
                <User className="mr-2 size-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link to="/" className="cursor-pointer w-full">
                Go to App
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
              <LogOut className="mr-2 size-4" />
              Sign Out
            </DropdownMenuItem>
          </>
        }
      />

      <SidebarRail />
    </Sidebar>
  );
}
