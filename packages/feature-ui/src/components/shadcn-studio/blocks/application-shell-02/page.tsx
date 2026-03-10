import type { ComponentType } from 'react'

import {
  ActivityIcon,
  BellIcon,
  CalendarIcon,
  ChartLineIcon,
  ChartPieIcon,
  ChevronRightIcon,
  FileQuestionIcon as CircleQuestionMarkIcon,
  CircleUserIcon,
  CopyIcon,
  DollarSignIcon,
  FacebookIcon,
  FolderIcon,
  InstagramIcon,
  LanguagesIcon,
  LayoutGridIcon,
  LayoutListIcon,
  LinkedinIcon,
  LockKeyholeIcon,
  MailIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
  TwitterIcon,
  UserIcon
} from 'lucide-react'

import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Separator } from '@superbuilder/feature-ui/shadcn/separator'
import { Card, CardContent } from '@superbuilder/feature-ui/shadcn/card'
import { Avatar, AvatarFallback, AvatarImage } from '@superbuilder/feature-ui/shadcn/avatar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@superbuilder/feature-ui/shadcn/collapsible'
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
  SidebarTrigger
} from '@superbuilder/feature-ui/shadcn/sidebar'

import LogoSvg from '@superbuilder/feature-ui/assets/svg/logo'
import SearchDialog from '@superbuilder/feature-ui/components/shadcn-studio/blocks/dialog-search'
import LanguageDropdown from '@superbuilder/feature-ui/components/shadcn-studio/blocks/dropdown-language'
import ActivityDialog from '@superbuilder/feature-ui/components/shadcn-studio/blocks/dialog-activity'
import NotificationDropdown from '@superbuilder/feature-ui/components/shadcn-studio/blocks/dropdown-notification'
import ProfileDropdown from '@superbuilder/feature-ui/components/shadcn-studio/blocks/dropdown-profile'

type MenuSubItem = {
  label: string
  href: string
  badge?: string
}

type MenuItem = {
  icon: ComponentType
  label: string
} & (
  | {
      href: string
      badge?: string
      items?: never
    }
  | { href?: never; badge?: never; items: MenuSubItem[] }
)

const menuItems: MenuItem[] = [
  {
    icon: ChartPieIcon,
    label: 'Dashboard',
    href: '#'
  }
]

const pagesItems: MenuItem[] = [
  {
    icon: CircleUserIcon,
    label: 'User Profile',
    href: '#'
  },
  {
    icon: SettingsIcon,
    label: 'Account Settings',
    href: '#'
  },
  {
    icon: CircleQuestionMarkIcon,
    label: 'FAQ',
    href: '#'
  },
  {
    icon: DollarSignIcon,
    label: 'Pricing',
    href: '#',
    badge: '3'
  },
  {
    icon: LayoutGridIcon,
    label: 'Misc',
    items: [
      { label: 'Error', href: '#' },
      { label: 'Coming Soon', href: '#' },
      { label: 'Not Authorized', href: '#' },
      { label: 'Under Maintenance', href: '#' }
    ]
  },
  {
    icon: LockKeyholeIcon,
    label: 'Authentication',
    items: [
      { label: 'Login', href: '#' },
      { label: 'Register', href: '#' },
      { label: 'Verify Email', href: '#' },
      { label: 'Forget Password', href: '#' },
      { label: 'Reset Password', href: '#' },
      { label: 'Two Steps', href: '#' }
    ]
  },
  {
    icon: LayoutListIcon,
    label: 'Wizard Examples',
    items: [
      { label: 'Checkout', href: '#' },
      { label: 'Property Listing', href: '#' },
      { label: 'Create Deal', href: '#' }
    ]
  },
  {
    icon: CopyIcon,
    label: 'Modal Examples',
    href: '#'
  }
]

const chartMapsItems: MenuItem[] = [
  {
    icon: ChartLineIcon,
    label: 'Charts',
    href: '#'
  },
  {
    icon: MapPinIcon,
    label: 'Maps',
    href: '#'
  }
]

const applicationsItems: MenuItem[] = [
  {
    icon: MailIcon,
    label: 'Email',
    href: '#'
  },
  {
    icon: MessageSquareTextIcon,
    label: 'Chat',
    href: '#'
  },
  {
    icon: UserIcon,
    label: 'Users',
    items: [
      { label: 'List', href: '#' },
      { label: 'View', href: '#' }
    ]
  },
  {
    icon: ShieldCheckIcon,
    label: 'Roles & Permissions',
    items: [
      { label: 'Roles', href: '#', badge: '4' },
      { label: 'Permissions', href: '#' }
    ]
  },
  {
    icon: CalendarIcon,
    label: 'Calendar',
    href: '#'
  },
  {
    icon: FolderIcon,
    label: 'File Manager',
    href: '#'
  },
  {
    icon: LayoutGridIcon,
    label: 'Kanban',
    href: '#'
  },
  {
    icon: TrendingUpIcon,
    label: 'Point of Sale',
    items: [
      { label: 'New Order', href: '#' },
      { label: 'Order List', href: '#' },
      { label: 'Customers', href: '#' }
    ]
  }
]

const SidebarGroupedMenuItems = ({ data, groupLabel }: { data: MenuItem[]; groupLabel?: string }) => {
  return (
    <SidebarGroup>
      {groupLabel && <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {data.map(item =>
            item.items ? (
              <Collapsible className='group/collapsible' key={item.label}>
                <SidebarMenuItem>
                  <CollapsibleTrigger>
                    <SidebarMenuButton tooltip={item.label}>
                      <item.icon />
                      <span>{item.label}</span>
                      <ChevronRightIcon className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map(subItem => (
                        <SidebarMenuSubItem key={subItem.label}>
                          <SidebarMenuSubButton className='justify-between'>
                            <a href={subItem.href}>
                              {subItem.label}
                              {subItem.badge && (
                                <span className='bg-primary/10 flex h-5 min-w-5 items-center justify-center rounded-full text-xs'>
                                  {subItem.badge}
                                </span>
                              )}
                            </a>
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
                  <a href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </a>
                </SidebarMenuButton>
                {item.badge && <SidebarMenuBadge className='bg-primary/10 rounded-full'>{item.badge}</SidebarMenuBadge>}
              </SidebarMenuItem>
            )
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

const ApplicationShell = () => {
  return (
    <div className='flex min-h-dvh w-full'>
      <SidebarProvider>
        <Sidebar collapsible='icon'>
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size='lg' className='gap-2.5 !bg-transparent [&>svg]:size-8'>
                  <a href='#'>
                    <LogoSvg className='[&_rect]:fill-sidebar [&_rect:first-child]:fill-primary' />
                    <div className='flex flex-col items-start'>
                      <span className='text-lg font-semibold'>shadcn/studio</span>
                      <span className='text-xs font-light'>Dashboard Template</span>
                    </div>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroupedMenuItems data={menuItems} />
            <SidebarGroupedMenuItems data={pagesItems} groupLabel='Pages' />
            <SidebarGroupedMenuItems data={chartMapsItems} groupLabel='Charts & Maps' />
            <SidebarGroupedMenuItems data={applicationsItems} groupLabel='Applications' />
          </SidebarContent>
        </Sidebar>
        <div className='flex flex-1 flex-col'>
          <header className='before:bg-background/60 sticky top-0 z-50 before:absolute before:inset-0 before:mask-[linear-gradient(var(--card),var(--card)_18%,transparent_100%)] before:backdrop-blur-md'>
            <div className='bg-card relative z-51 mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-[calc(1280px-3rem)] items-center justify-between rounded-xl border px-6 py-2 sm:w-[calc(100%-3rem)]'>
              <div className='flex items-center gap-1.5 sm:gap-4'>
                <SidebarTrigger className='[&_svg]:!size-5' />
                <Separator orientation='vertical' className='hidden !h-4 sm:block' />
                <SearchDialog
                  trigger={
                    <>
                      <Button variant='ghost' className='hidden !bg-transparent px-1 py-0 font-normal sm:block'>
                        <div className='text-muted-foreground hidden items-center gap-1.5 text-sm sm:flex'>
                          <SearchIcon />
                          <span>Type to search...</span>
                        </div>
                      </Button>
                      <Button variant='ghost' size='icon' className='sm:hidden'>
                        <SearchIcon />
                        <span className='sr-only'>Search</span>
                      </Button>
                    </>
                  }
                />
              </div>
              <div className='flex items-center gap-1.5'>
                <LanguageDropdown
                  trigger={
                    <Button variant='ghost' size='icon'>
                      <LanguagesIcon />
                    </Button>
                  }
                />
                <ActivityDialog
                  trigger={
                    <Button variant='ghost' size='icon'>
                      <ActivityIcon />
                    </Button>
                  }
                />
                <NotificationDropdown
                  trigger={
                    <Button variant='ghost' size='icon' className='relative'>
                      <BellIcon />
                      <span className='bg-destructive absolute top-2 right-2.5 size-2 rounded-full' />
                    </Button>
                  }
                />
                <ProfileDropdown
                  trigger={
                    <Button variant='ghost' size='icon' className='size-9.5'>
                      <Avatar className='size-9.5 rounded-md'>
                        <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png' />
                        <AvatarFallback>JD</AvatarFallback>
                      </Avatar>
                    </Button>
                  }
                />
              </div>
            </div>
          </header>
          <main className='mx-auto size-full max-w-7xl flex-1 px-4 py-6 sm:px-6'>
            <Card className='h-250 shadow-none'>
              <CardContent className='h-full'>
                <div className='h-full rounded-md border bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_1px,var(--card)_2px,var(--card)_15px)]' />
              </CardContent>
            </Card>
          </main>
          <footer>
            <div className='text-muted-foreground mx-auto flex size-full max-w-7xl items-center justify-between gap-3 px-4 py-3 max-sm:flex-col sm:gap-6 sm:px-6'>
              <p className='text-sm text-balance max-sm:text-center'>
                {`©${new Date().getFullYear()}`}{' '}
                <a href='#' className='text-primary'>
                  shadcn/studio
                </a>
                , Made for better web design
              </p>
              <div className='flex items-center gap-5'>
                <a href='#'>
                  <FacebookIcon className='size-4' />
                </a>
                <a href='#'>
                  <InstagramIcon className='size-4' />
                </a>
                <a href='#'>
                  <LinkedinIcon className='size-4' />
                </a>
                <a href='#'>
                  <TwitterIcon className='size-4' />
                </a>
              </div>
            </div>
          </footer>
        </div>
      </SidebarProvider>
    </div>
  )
}

export default ApplicationShell
