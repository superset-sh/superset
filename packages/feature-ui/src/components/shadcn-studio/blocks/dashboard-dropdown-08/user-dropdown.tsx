'use client'

import { useState, type ReactNode } from 'react'

import {
  BookIcon,
  ChartPieIcon,
  InfoIcon,
  LaptopMinimalIcon,
  LayoutGridIcon,
  LogOutIcon,
  MoonIcon,
  SettingsIcon,
  SunMediumIcon,
  UserIcon
} from 'lucide-react'

import { Avatar, AvatarImage, AvatarFallback } from '@superbuilder/feature-ui/shadcn/avatar'
import { Button } from '@superbuilder/feature-ui/shadcn/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@superbuilder/feature-ui/shadcn/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@superbuilder/feature-ui/shadcn/motion-toggle-group'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  align?: 'start' | 'center' | 'end'
}

const UserDropdown = ({ trigger, defaultOpen, align = 'end' }: Props) => {
  const [mode, setMode] = useState<'light' | 'dark' | 'system'>('light')

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className='w-74.5 space-y-1' align={align || 'end'}>
        <DropdownMenuLabel className='flex items-center gap-4 px-4 py-2.5 font-normal'>
          <Avatar className='size-10'>
            <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png' alt='John Doe' />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <div className='flex flex-1 flex-col items-start gap-0.5'>
            <span className='text-foreground text-lg font-semibold'>John Doe</span>
            <span className='text-muted-foreground text-base'>john.doe@example.com</span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuGroup className='space-y-0.5'>
          <DropdownMenuItem className='px-4 py-2.5 text-base'>
            <UserIcon className='text-foreground size-5' />
            <span>My account</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-4 py-2.5 text-base'>
            <LayoutGridIcon className='text-foreground size-5' />
            <span>Feed</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-4 py-2.5 text-base'>
            <SettingsIcon className='text-foreground size-5' />
            <span>Account Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-4 py-2.5 text-base'>
            <ChartPieIcon className='text-foreground size-5' />
            <span>Analytics</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-4 py-2.5 text-base'>
            <BookIcon className='text-foreground size-5' />
            <span>Guide</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-4 py-2.5 text-base'>
            <InfoIcon className='text-foreground size-5' />
            <span>Help Center</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className='justify-between px-4 py-2.5 text-base'
            onSelect={event => event.preventDefault()}
          >
            <span>Theme</span>
            <ToggleGroup type='single' defaultValue={mode} className='bg-primary/10 overflow-hidden rounded-full p-0.5'>
              <ToggleGroupItem
                value='light'
                aria-label='Toggle light'
                className='h-7 min-w-7 px-1'
                buttonProps={{
                  className:
                    'aria-[checked=true]:[&_[data-slot=active-toggle-group-item]]:bg-background text-foreground [&_[data-slot=active-toggle-group-item]]:!rounded-full'
                }}
                onClick={() => setMode('light')}
              >
                <SunMediumIcon className='text-primary size-4' />
              </ToggleGroupItem>
              <ToggleGroupItem
                value='dark'
                aria-label='Toggle dark'
                className='h-7 min-w-7 px-1'
                buttonProps={{
                  className:
                    'aria-[checked=true]:[&_[data-slot=active-toggle-group-item]]:bg-background text-foreground [&_[data-slot=active-toggle-group-item]]:!rounded-full'
                }}
                onClick={() => setMode('dark')}
              >
                <MoonIcon className='text-primary size-4' />
              </ToggleGroupItem>
              <ToggleGroupItem
                value='system'
                aria-label='Toggle system'
                className='h-7 min-w-7 px-1'
                buttonProps={{
                  className:
                    'aria-[checked=true]:[&_[data-slot=active-toggle-group-item]]:bg-background text-foreground [&_[data-slot=active-toggle-group-item]]:!rounded-full'
                }}
                onClick={() => setMode('system')}
              >
                <LaptopMinimalIcon className='text-primary size-4' />
              </ToggleGroupItem>
            </ToggleGroup>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem className='justify-between gap-2 rounded-md px-4 py-2.5 text-base'>
            <div className='flex flex-col gap-0.5'>
              <span>Free Plan</span>
              <span className='text-muted-foreground'>13200 Views</span>
            </div>
            <Button size='sm' className='bg-primary/10 text-primary hover:bg-primary/20'>
              Upgrade
            </Button>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem variant='destructive' className='px-4 py-2.5 text-base'>
            <LogOutIcon className='size-5' />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default UserDropdown
