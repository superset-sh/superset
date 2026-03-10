'use client'

import { useState, type ReactNode } from 'react'

import {
  CopyIcon,
  GlobeIcon,
  HistoryIcon,
  MaximizeIcon,
  MicIcon,
  PrinterIcon,
  Redo2Icon,
  SparklesIcon,
  Trash2Icon
} from 'lucide-react'

import { Badge } from '@superbuilder/feature-ui/shadcn/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@superbuilder/feature-ui/shadcn/dropdown-menu'
import { Switch } from '@superbuilder/feature-ui/shadcn/switch'
import { ToggleGroup, ToggleGroupItem } from '@superbuilder/feature-ui/shadcn/toggle-group'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  align?: 'start' | 'center' | 'end'
}

const ThemeDropdown = ({ trigger, defaultOpen, align = 'end' }: Props) => {
  const [fullWidth, setFullWidth] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState(true)

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className='w-81.5 space-y-1 p-2' align={align || 'end'}>
        <ToggleGroup variant='outline' type='single' className='w-full' defaultValue='default'>
          <ToggleGroupItem
            value='default'
            aria-label='Toggle default'
            className='h-full flex-1 flex-col gap-0 px-3.5 py-2.25'
          >
            <span className='text-lg font-medium'>Ag</span>
            <span className='font-normal'>Default</span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value='serif'
            aria-label='Toggle serif'
            className='h-full flex-1 flex-col gap-0 px-3.5 py-2.25'
          >
            <span className='text-lg font-medium'>Ag</span>
            <span className='font-normal'>Serif</span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value='mono'
            aria-label='Toggle mono'
            className='h-full flex-1 flex-col gap-0 px-3.5 py-2.25'
          >
            <span className='text-lg font-medium'>Ag</span>
            <span className='font-normal'>Mono</span>
          </ToggleGroupItem>
        </ToggleGroup>

        <DropdownMenuGroup className='space-y-0.5'>
          <DropdownMenuItem
            className='justify-between px-3 py-2.5 text-base'
            onSelect={event => event.preventDefault()}
          >
            <div className='flex items-center gap-2'>
              <MaximizeIcon className='text-popover-foreground size-5' />
              <span>Full width</span>
            </div>
            <Switch checked={fullWidth} onCheckedChange={setFullWidth} />
          </DropdownMenuItem>
          <DropdownMenuItem
            className='justify-between px-3 py-2.5 text-base'
            onSelect={event => event.preventDefault()}
          >
            <div className='flex items-center gap-2'>
              <SparklesIcon className='text-popover-foreground size-5' />
              <span>AI suggestions</span>
              <Badge className='bg-primary/10 text-primary rounded-sm px-1.5 py-px'>Alpha</Badge>
            </div>
            <Switch checked={aiSuggestions} onCheckedChange={setAiSuggestions} />
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className='-mx-2' />

        <DropdownMenuGroup className='space-y-0.5'>
          <DropdownMenuItem className='px-3 py-2.5 text-base'>
            <MicIcon className='text-popover-foreground size-5' />
            <span>Dictate</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className='-mx-2' />

        <DropdownMenuGroup className='space-y-0.5'>
          <DropdownMenuItem className='px-3 py-2.5 text-base'>
            <CopyIcon className='text-popover-foreground size-5' />
            <span>Copy link</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-3 py-2.5 text-base'>
            <Redo2Icon className='text-popover-foreground size-5' />
            <span>Move to.....</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-3 py-2.5 text-base'>
            <Trash2Icon className='text-popover-foreground size-5' />
            <span>Move to trash</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className='-mx-2' />

        <DropdownMenuGroup className='space-y-0.5'>
          <DropdownMenuItem className='px-3 py-2.5 text-base'>
            <GlobeIcon className='text-popover-foreground size-5' />
            <span>Public</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-3 py-2.5 text-base'>
            <PrinterIcon className='text-popover-foreground size-5' />
            <span>Print</span>
          </DropdownMenuItem>
          <DropdownMenuItem className='px-3 py-2.5 text-base'>
            <HistoryIcon className='text-popover-foreground size-5' />
            <span>Version history</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ThemeDropdown
