import type { ReactNode } from 'react'

import {
  ChartNoAxesColumnIcon,
  CopyIcon,
  FoldersIcon,
  GalleryHorizontalEndIcon,
  InfoIcon,
  SettingsIcon,
  Trash2Icon,
  Undo2Icon,
  UnlinkIcon,
  UploadIcon
} from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@superbuilder/feature-ui/shadcn/dropdown-menu'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  align?: 'start' | 'center' | 'end'
}

const MoreOptionsDropdown = ({ defaultOpen, align, trigger }: Props) => {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className='w-60 p-2' align={align || 'end'}>
        <DropdownMenuItem className='px-3 py-2.5 text-base'>
          <SettingsIcon className='text-foreground size-5' />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem className='px-3 py-2.5 text-base'>
          <UnlinkIcon className='text-foreground size-5' />
          Copy Link
        </DropdownMenuItem>
        <DropdownMenuItem className='px-3 py-2.5 text-base'>
          <FoldersIcon className='text-foreground size-5' />
          Move to a Folder
        </DropdownMenuItem>
        <DropdownMenuItem className='px-3 py-2.5 text-base'>
          <CopyIcon className='text-foreground size-5' />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem className='px-3 py-2.5 text-base'>
          <Trash2Icon className='text-foreground size-5' />
          Move to Trash
        </DropdownMenuItem>
        <DropdownMenuItem className='px-3 py-2.5 text-base'>
          <Undo2Icon className='text-foreground size-5' />
          Undo
        </DropdownMenuItem>
        <DropdownMenuItem className='px-3 py-2.5 text-base'>
          <UploadIcon className='text-foreground size-5' />
          Export
        </DropdownMenuItem>
        <DropdownMenuItem className='px-3 py-2.5 text-base'>
          <ChartNoAxesColumnIcon className='text-foreground size-5' />
          Updates & Analytics
        </DropdownMenuItem>
        <DropdownMenuItem className='px-3 py-2.5 text-base'>
          <GalleryHorizontalEndIcon className='text-foreground size-5' />
          Version History
        </DropdownMenuItem>
        <DropdownMenuItem className='px-3 py-2.5 text-base'>
          <InfoIcon className='text-foreground size-5' />
          Report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default MoreOptionsDropdown
