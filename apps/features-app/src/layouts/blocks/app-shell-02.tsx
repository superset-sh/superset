import type { ComponentType } from "react";
import { useCallback } from "react";
import {
  AuthGuard,
  authenticatedAtom,
  getSupabaseAtom,
  profileAtom,
} from "@superbuilder/features-client/core/auth";
import { useAtomValue } from "jotai";
import { Outlet, Link, useNavigate } from "@tanstack/react-router";

import {
  ChartPieIcon,
  ChevronRightIcon,
  LogOutIcon,
  UserIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@superbuilder/feature-ui/shadcn/avatar";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
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
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import {
  Sidebar,
  SidebarContent,
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

type MenuSubItem = {
  label: string;
  href: string;
  badge?: string;
};

type MenuItem = {
  icon: ComponentType;
  label: string;
} & (
  | {
      href: string;
      badge?: string;
      items?: never;
    }
  | { href?: never; badge?: never; items: MenuSubItem[] }
);

const menuItems: MenuItem[] = [
  {
    icon: ChartPieIcon,
    label: "Dashboard",
    href: "/",
  },
];

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
                            <Link to={subItem.href}>
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
                  <Link to={item.href}>
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

export function AppShell02() {
  const navigate = useNavigate();
  const authenticated = useAtomValue(authenticatedAtom);
  const profile = useAtomValue(profileAtom);
  const supabase = useAtomValue(getSupabaseAtom);

  const handleUnauthenticated = useCallback(() => {
    navigate({ to: "/sign-in", replace: true });
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/sign-in", replace: true });
  };

  return (
    <AuthGuard
      authenticated={authenticated}
      onUnauthenticated={handleUnauthenticated}
    >
      <div className="flex min-h-dvh w-full">
        <SidebarProvider>
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
              <SidebarGroupedMenuItems data={menuItems} />
            </SidebarContent>
          </Sidebar>
          <div className="flex flex-1 flex-col">
            <header className="before:bg-background/60 sticky top-0 z-50 before:absolute before:inset-0 before:mask-[linear-gradient(var(--card),var(--card)_18%,transparent_100%)] before:backdrop-blur-md">
              <div className="bg-card relative z-51 mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-[calc(1280px-3rem)] items-center justify-between rounded-xl border px-6 py-2 sm:w-[calc(100%-3rem)]">
                <div className="flex items-center gap-1.5 sm:gap-4">
                  <SidebarTrigger className="[&_svg]:!size-5" />
                  <Separator
                    orientation="vertical"
                    className="hidden !h-4 sm:block"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger>
                      <Button variant="ghost" size="icon" className="size-9.5">
                        <Avatar className="size-9.5 rounded-md">
                          <AvatarImage
                            src={profile?.avatar ?? undefined}
                          />
                          <AvatarFallback>
                            {profile?.name?.charAt(0)?.toUpperCase() ?? "U"}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-56 rounded-lg"
                      side="bottom"
                      align="end"
                      sideOffset={4}
                    >
                      <div className="flex items-center gap-2 px-2 py-1.5">
                        <Avatar className="size-8 rounded-lg">
                          <AvatarImage
                            src={profile?.avatar ?? undefined}
                          />
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
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <Link
                          to="/profile"
                          className="flex w-full cursor-pointer items-center"
                        >
                          <UserIcon className="mr-2 size-4" />
                          Profile
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleSignOut}
                        className="cursor-pointer"
                      >
                        <LogOutIcon className="mr-2 size-4" />
                        Sign Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </header>
            <main className="mx-auto size-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
              <Outlet />
            </main>
            <footer>
              <div className="text-muted-foreground mx-auto flex size-full max-w-7xl items-center justify-center px-4 py-3 sm:px-6">
                <p className="text-sm">
                  {`\u00A9${new Date().getFullYear()} Feature Atlas`}
                </p>
              </div>
            </footer>
          </div>
        </SidebarProvider>
      </div>
    </AuthGuard>
  );
}
