/**
 * App Shell 07 Layout
 *
 * Application shell layout adapted from shadcn-studio application-shell-07 block.
 * Uses muted background with collapsible icon sidebar.
 */
import type { ComponentType } from "react";
import { useCallback } from "react";
import {
  AuthGuard,
  authenticatedAtom,
  getSupabaseAtom,
  profileAtom,
} from "@superbuilder/features-client/core/auth";
import { useAtomValue } from "jotai";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  ChevronUp,
  LayoutDashboardIcon,
  LogOut,
  User,
} from "lucide-react";

import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@superbuilder/feature-ui/shadcn/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@superbuilder/feature-ui/shadcn/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "@superbuilder/feature-ui/shadcn/sidebar";

import LogoSvg from "@superbuilder/feature-ui/assets/svg/logo";

// ---------------------------------------------------------------------------
// Menu types & data
// ---------------------------------------------------------------------------

type MenuSubItem = {
  label: string;
  href: string;
  badge?: string;
};

type MenuItem = {
  icon: ComponentType;
  label: string;
} & (
  | { href: string; badge?: string; items?: never }
  | { href?: never; badge?: never; items: MenuSubItem[] }
);

const menuItems: MenuItem[] = [
  {
    icon: LayoutDashboardIcon,
    label: "Dashboard",
    href: "/",
  },
];

// ---------------------------------------------------------------------------
// Sidebar grouped menu helper
// ---------------------------------------------------------------------------

const SidebarGroupedMenuItems = ({
  data,
  groupLabel,
}: {
  data: MenuItem[];
  groupLabel?: string;
}) => {
  return (
    <SidebarGroup>
      {groupLabel && <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {data.map((item) =>
            item.items ? (
              <Collapsible className="group/collapsible" key={item.label}>
                <SidebarMenuItem>
                  <CollapsibleTrigger>
                    <SidebarMenuButton tooltip={item.label}>
                      <item.icon />
                      <span>{item.label}</span>
                      <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.label}>
                          <SidebarMenuSubButton className="justify-between">
                            <Link to={subItem.href as "/"}>
                              {subItem.label}
                              {subItem.badge && (
                                <span className="bg-primary/10 flex h-5 min-w-5 items-center justify-center rounded-full text-xs">
                                  {subItem.badge}
                                </span>
                              )}
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            ) : (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton tooltip={item.label}>
                  <Link to={item.href as "/"}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
                {item.badge && (
                  <SidebarMenuBadge className="bg-primary/10 rounded-full">
                    {item.badge}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            ),
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

// ---------------------------------------------------------------------------
// Header profile dropdown
// ---------------------------------------------------------------------------

function HeaderProfileDropdown() {
  const profile = useAtomValue(profileAtom);
  const supabase = useAtomValue(getSupabaseAtom);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/sign-in", replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost" size="icon" className="size-9.5">
          <Avatar className="size-9.5 rounded-md">
            <AvatarImage src={profile?.avatar ?? undefined} />
            <AvatarFallback>
              {profile?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-56">
        <DropdownMenuItem>
          <Link
            to="/profile"
            className="flex w-full cursor-pointer items-center"
          >
            <User className="mr-2 size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
          <LogOut className="mr-2 size-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Sidebar footer with user menu
// ---------------------------------------------------------------------------

function AppSidebarFooter() {
  const profile = useAtomValue(profileAtom);
  const supabase = useAtomValue(getSupabaseAtom);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/sign-in", replace: true });
  };

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <SidebarMenuButton
              render={<DropdownMenuTrigger />}
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarImage src={profile?.avatar ?? undefined} />
                <AvatarFallback className="rounded-lg">
                  {profile?.name?.charAt(0)?.toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {profile?.name ?? "User"}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {profile?.email ?? ""}
                </span>
              </div>
              <ChevronUp className="ml-auto size-4" />
            </SidebarMenuButton>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              side="top"
              align="end"
              sideOffset={4}
            >
              <DropdownMenuItem>
                <Link
                  to="/profile"
                  className="flex w-full cursor-pointer items-center"
                >
                  <User className="mr-2 size-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer"
              >
                <LogOut className="mr-2 size-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

// ---------------------------------------------------------------------------
// Main layout export
// ---------------------------------------------------------------------------

export function AppShell07() {
  const navigate = useNavigate();
  const authenticated = useAtomValue(authenticatedAtom);

  const handleUnauthenticated = useCallback(() => {
    navigate({ to: "/sign-in", replace: true });
  }, [navigate]);

  return (
    <AuthGuard
      authenticated={authenticated}
      onUnauthenticated={handleUnauthenticated}
    >
      <div className="bg-muted flex min-h-dvh w-full">
        <SidebarProvider>
          <Sidebar
            collapsible="icon"
            className="[&_[data-slot=sidebar-inner]]:bg-muted !border-r-0"
          >
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
              <SidebarGroupedMenuItems data={menuItems} />
            </SidebarContent>

            <AppSidebarFooter />
          </Sidebar>

          <div className="flex flex-1 flex-col">
            <header className="bg-muted sticky top-0 z-50 flex items-center justify-between gap-6 px-4 py-2 sm:px-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="[&_svg]:!size-5" />
                <Separator
                  orientation="vertical"
                  className="hidden !h-4 sm:block"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <HeaderProfileDropdown />
              </div>
            </header>

            <main className="size-full flex-1 px-4 py-6 sm:px-6">
              <Outlet />
            </main>

            <footer className="flex items-center justify-between gap-3 px-4 py-3 max-lg:flex-col sm:px-6 lg:gap-6">
              <p className="text-muted-foreground text-sm text-balance max-lg:text-center">
                {`\u00A9${new Date().getFullYear()}`} Feature Atlas
              </p>
              <div className="text-muted-foreground *:hover:text-primary flex items-center gap-3 text-sm whitespace-nowrap max-[450px]:flex-col min-[450px]:gap-4">
                <a href="#">Documentation</a>
                <a href="#">Support</a>
              </div>
            </footer>
          </div>
        </SidebarProvider>
      </div>
    </AuthGuard>
  );
}
