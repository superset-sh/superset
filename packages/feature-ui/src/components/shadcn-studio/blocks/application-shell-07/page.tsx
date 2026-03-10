import type { ComponentType } from 'react'

import {
  ActivityIcon,
  AwardIcon,
  BellIcon,
  ChartColumnStackedIcon,
  ChevronRightIcon,
  FileQuestionIcon as CircleQuestionMarkIcon,
  ClipboardListIcon,
  Clock8Icon,
  FolderIcon,
  LanguagesIcon,
  PencilIcon,
  SearchIcon,
  SettingsIcon,
  Share2Icon,
  StarIcon,
  TrendingUpIcon,
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
  SidebarTrigger
} from '@superbuilder/feature-ui/shadcn/sidebar'

import LogoSvg from '@superbuilder/feature-ui/assets/svg/logo'
import SearchDialog from '@superbuilder/feature-ui/components/shadcn-studio/blocks/dialog-search'
import ShareDropdown from '@superbuilder/feature-ui/components/shadcn-studio/blocks/dropdown-share'
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
    icon: ChartColumnStackedIcon,
    label: 'Dashboard',
    href: '#',
    badge: '3'
  }
]

const pagesItems: MenuItem[] = [
  {
    icon: UserIcon,
    label: 'Student Profile',
    href: '#'
  },
  {
    icon: TrendingUpIcon,
    label: 'Progress',
    href: '#'
  },
  {
    icon: PencilIcon,
    label: 'Assignments',
    href: '#',
    badge: '2'
  },
  {
    icon: Clock8Icon,
    label: 'Schedule',
    href: '#'
  },
  {
    icon: FolderIcon,
    label: 'Resources',
    items: [
      { label: 'Course Materials', href: '#' },
      { label: 'Lecture Notes', href: '#' },
      { label: 'Additional Readings', href: '#', badge: '5' }
    ]
  },
  {
    icon: ClipboardListIcon,
    label: 'Reports',
    href: '#'
  },
  {
    icon: AwardIcon,
    label: 'Certificates',
    href: '#'
  }
]

const miscItems: MenuItem[] = [
  {
    icon: StarIcon,
    label: 'Reviews',
    href: '#'
  },
  {
    icon: CircleQuestionMarkIcon,
    label: 'FAQ',
    href: '#'
  },
  {
    icon: SettingsIcon,
    label: 'Settings',
    items: [
      { label: 'Profile Settings', href: '#' },
      { label: 'General Preferences', href: '#' }
    ]
  }
]

const shareData = [
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png',
    name: 'John Garrett',
    email: 'john@example.com',
    role: 'admin'
  },
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png',
    name: 'Laura Perez',
    email: 'laura@example.com',
    role: 'can-view'
  },
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png',
    name: 'Shane Adkins',
    email: 'shane@example.com',
    role: 'admin'
  },
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-6.png',
    name: 'Clara Brady',
    email: 'clara@example.com',
    role: 'can-edit'
  }
]

const morePeople = [
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-8.png',
    name: 'Daisy Mitchell'
  },
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-9.png',
    name: 'Stephen Adams'
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
    <div className='bg-muted flex min-h-dvh w-full'>
      <SidebarProvider>
        <Sidebar collapsible='icon' className='[&_[data-slot=sidebar-inner]]:bg-muted !border-r-0'>
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size='lg' className='gap-2.5 !bg-transparent [&>svg]:size-8'>
                  <a href='#'>
                    <LogoSvg className='[&_rect]:fill-muted [&_rect:first-child]:fill-primary' />
                    <span className='text-xl font-semibold'>Academy</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroupedMenuItems data={menuItems} />
            <SidebarGroupedMenuItems data={pagesItems} groupLabel='Pages' />
            <SidebarGroupedMenuItems data={miscItems} groupLabel='Misc' />
          </SidebarContent>
          <SidebarFooter className='p-3 [[data-state=collapsed]_&]:hidden'>
            <div className='bg-background flex flex-col items-start gap-4 rounded-md p-4 pb-0'>
              <p className='text-xl font-semibold'>Mobile app is available</p>
              <p className='text-sm'>The personal account allows user management subscription</p>
              <Button>Get App</Button>
              <img
                src='https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dashboard-sidebar/image-1.png'
                alt='Mobile app'
                className='self-center'
              />
            </div>
          </SidebarFooter>
        </Sidebar>
        <div className='flex flex-1 flex-col'>
          <header className='bg-muted sticky top-0 z-50 flex items-center justify-between gap-6 px-4 py-2 sm:px-6'>
            <div className='flex items-center gap-4'>
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
              <ShareDropdown
                data={shareData}
                morePeople={morePeople}
                trigger={
                  <Button variant='ghost' size='icon'>
                    <Share2Icon />
                  </Button>
                }
              />
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
          </header>
          <main className='size-full flex-1 px-4 py-6 sm:px-6'>
            <Card className='h-250'>
              <CardContent className='h-full'>
                <div className='h-full rounded-md border bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_1px,var(--card)_2px,var(--card)_15px)]' />
              </CardContent>
            </Card>
          </main>
          <footer className='flex items-center justify-between gap-3 px-4 py-3 max-lg:flex-col sm:px-6 lg:gap-6'>
            <p className='text-muted-foreground text-sm text-balance max-lg:text-center'>
              {`©${new Date().getFullYear()}`}{' '}
              <a href='#' className='text-primary'>
                shadcn/studio
              </a>
              , Made for better web design
            </p>
            <div className='text-muted-foreground *:hover:text-primary flex items-center gap-3 text-sm whitespace-nowrap max-[450px]:flex-col min-[450px]:gap-4'>
              <a href='#'>License</a>
              <a href='#'>More Themes</a>
              <a href='#'>Documentation</a>
              <a href='#'>Support</a>
            </div>
          </footer>
        </div>
      </SidebarProvider>
    </div>
  )
}

export default ApplicationShell
