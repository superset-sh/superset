'use client'

import { useState, type ReactNode } from 'react'

import {
  LogOutIcon,
  StoreIcon,
  BookIcon,
  ReplaceIcon,
  SettingsIcon,
  SunMediumIcon,
  MoonIcon,
  LaptopMinimalIcon
} from 'lucide-react'

import { Avatar, AvatarImage, AvatarFallback } from '@superbuilder/feature-ui/shadcn/avatar'
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

const SimpleProfileDropdown = ({ trigger, defaultOpen, align = 'end' }: Props) => {
  const [mode, setMode] = useState<'light' | 'dark' | 'system'>('light')

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className='w-80' align={align || 'end'}>
        <DropdownMenuLabel className='flex items-center gap-4 px-4 py-2.5 font-normal'>
          <Avatar className='size-10'>
            <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png' alt='John Doe' />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <div className='flex flex-1 flex-col items-start'>
            <span className='text-base font-semibold'>John Doe</span>
            <span className='text-muted-foreground text-base'>john.doe@example.com</span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className='my-2' />

        <ToggleGroup type='single' defaultValue={mode} className='bg-primary/10 justify-between rounded-lg p-0.5'>
          <ToggleGroupItem
            value='light'
            aria-label='Toggle light'
            className='h-7 min-w-7 px-1'
            buttonProps={{
              className:
                'aria-[checked=true]:[&_[data-slot=active-toggle-group-item]]:bg-background [&>span]:w-full text-foreground flex-1 rounded-lg'
            }}
            onClick={() => setMode('light')}
          >
            <SunMediumIcon />
          </ToggleGroupItem>
          <ToggleGroupItem
            value='dark'
            aria-label='Toggle dark'
            className='h-7 min-w-7 px-1'
            buttonProps={{
              className:
                'aria-[checked=true]:[&_[data-slot=active-toggle-group-item]]:bg-background [&>span]:w-full text-foreground flex-1 rounded-lg'
            }}
            onClick={() => setMode('dark')}
          >
            <MoonIcon />
          </ToggleGroupItem>
          <ToggleGroupItem
            value='system'
            aria-label='Toggle system'
            className='h-7 min-w-7 px-1'
            buttonProps={{
              className:
                'aria-[checked=true]:[&_[data-slot=active-toggle-group-item]]:bg-background [&>span]:w-full text-foreground flex-1 rounded-lg'
            }}
            onClick={() => setMode('system')}
          >
            <LaptopMinimalIcon />
          </ToggleGroupItem>
        </ToggleGroup>

        <DropdownMenuSeparator className='my-2' />

        <DropdownMenuGroup className='space-y-0.5'>
          <DropdownMenuItem className='px-4 py-2.5 text-base'>
            <StoreIcon className='text-popover-foreground size-5' />
            <span>Your Shop</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-4 py-2.5 text-base'>
            <BookIcon className='text-popover-foreground size-5' />
            <span>Documentation</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-4 py-2.5 text-base'>
            <ReplaceIcon className='text-popover-foreground size-5' />
            <span>Affiliate</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-4 py-2.5 text-base'>
            <SettingsIcon className='text-popover-foreground size-5' />
            <span>Settings</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant='destructive' className='px-4 py-2.5 text-base'>
          <LogOutIcon className='size-5' />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default SimpleProfileDropdown
