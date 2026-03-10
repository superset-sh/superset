'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

import {
  UsersIcon,
  ShoppingCartIcon,
  MonitorSmartphoneIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  Undo2Icon,
  MoreVerticalIcon
} from 'lucide-react'

import { Badge } from 'src/_shadcn/badge'
import { Avatar, AvatarFallback, AvatarImage } from 'src/_shadcn/avatar'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from 'src/_shadcn/command'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  className?: string
}

const SearchDialog = ({ defaultOpen = false, trigger, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen)
  const [search, setSearch] = useState('')

  return (
    <div className={className}>
      <div onClick={() => setOpen(true)}>{trigger}</div>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder='Search here...'
          value={search}
          onValueChange={setSearch}
          className='text-base [svg:has(+&)]:size-5 [svg:has(+&)]:opacity-100'
        />

        <CommandList className='max-h-[65vh]'>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup
            heading='Suggestions'
            className='[&_[cmdk-group-heading]]:text-muted-foreground !px-4 !py-6 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-normal [&_[cmdk-group-heading]]:uppercase'
          >
            <CommandItem onSelect={() => setOpen(false)} className='!py-1.5 text-base'>
              <UsersIcon className='text-foreground !size-4.5' />
              <span>Marketing UI Page</span>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)} className='!py-1.5 text-base'>
              <ShoppingCartIcon className='text-foreground !size-4.5' />
              <span>e-commerce UI Page</span>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)} className='!py-1.5 text-base'>
              <MonitorSmartphoneIcon className='text-foreground !size-4.5' />
              <span>Dashboard UI Page</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup
            heading='Interactions'
            className='[&_[cmdk-group-heading]]:text-muted-foreground !px-4 !py-6 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-normal [&_[cmdk-group-heading]]:uppercase'
          >
            <CommandItem onSelect={() => setOpen(false)} className='gap-3 !py-1.5 text-base'>
              <Avatar className='size-9.5'>
                <AvatarFallback>
                  <img
                    src='https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dashboard-dialog/jira.png'
                    alt='Jira'
                    className='size-6'
                  />
                </AvatarFallback>
              </Avatar>
              <div className='flex w-full flex-col items-start'>
                <span className='font-medium'>Jira</span>
                <span className='text-muted-foreground text-sm'>Project management</span>
              </div>
              <div className='*:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:grayscale'>
                <Avatar>
                  <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png' alt='Aaron Larson' />
                  <AvatarFallback>AL</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarImage
                    src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png'
                    alt='Kathryn Cummings'
                  />
                  <AvatarFallback>KC</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png' alt='Vincent Boone' />
                  <AvatarFallback>VB</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback>+99</AvatarFallback>
                </Avatar>
              </div>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)} className='gap-3 !py-1.5 text-base'>
              <Avatar className='size-9.5'>
                <AvatarFallback>
                  <img
                    src='https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dashboard-dialog/inferno.png'
                    alt='Inferno'
                    className='size-6'
                  />
                </AvatarFallback>
              </Avatar>
              <div className='flex w-full flex-col items-start'>
                <span className='font-medium'>Inferno</span>
                <span className='text-muted-foreground text-sm'>Real-time photo sharing app</span>
              </div>
              <div className='*:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:grayscale'>
                <Avatar>
                  <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png' alt='Walter Newton' />
                  <AvatarFallback>WN</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png' alt='Ruby Stewart' />
                  <AvatarFallback>RS</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png' alt='Bernard Clarke' />
                  <AvatarFallback>BC</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-4.png' alt='Elva Baker' />
                  <AvatarFallback>EB</AvatarFallback>
                </Avatar>
              </div>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup
            heading='Users'
            className='[&_[cmdk-group-heading]]:text-muted-foreground !px-4 !py-6 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-normal [&_[cmdk-group-heading]]:uppercase'
          >
            <CommandItem onSelect={() => setOpen(false)} className='gap-3 !py-1.5 text-base'>
              <Avatar className='size-9.5'>
                <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png' alt='Barry Barnett' />
                <AvatarFallback>BB</AvatarFallback>
              </Avatar>
              <div className='flex w-full flex-col items-start'>
                <span className='font-medium'>Barry Barnett</span>
                <span className='text-muted-foreground text-sm font-light'>barry@hotmail.com</span>
              </div>
              <Badge className='bg-green-600/10 px-3 py-1 font-normal text-green-600 dark:bg-green-400/10 dark:text-green-400'>
                In office
              </Badge>
              <MoreVerticalIcon />
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)} className='gap-3 !py-1.5 text-base'>
              <Avatar className='size-9.5'>
                <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png' alt='Maria Donin' />
                <AvatarFallback>MD</AvatarFallback>
              </Avatar>
              <div className='flex w-full flex-col items-start'>
                <span className='font-medium'>Maria Donin</span>
                <span className='text-muted-foreground text-sm font-light'>maria@hotmail.com</span>
              </div>
              <Badge className='bg-red-600/10 px-3 py-1 font-normal text-red-600 dark:bg-red-400/10 dark:text-red-400'>
                On leave
              </Badge>
              <MoreVerticalIcon />
            </CommandItem>
          </CommandGroup>
        </CommandList>

        <CommandSeparator />

        <div className='text-muted-foreground flex flex-wrap items-center gap-4 p-6'>
          <div className='flex flex-1 items-center gap-2'>
            <kbd className='rounded border px-1 text-sm'>esc</kbd>
            <span>To close</span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='flex size-5 items-center justify-center rounded border'>
              <Undo2Icon className='size-4' />
            </div>
            <span>To Select</span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='flex size-5 items-center justify-center rounded border'>
              <ArrowUpIcon className='size-4' />
            </div>
            <div className='flex size-5 items-center justify-center rounded border'>
              <ArrowDownIcon className='size-4' />
            </div>
            <span>To Navigate</span>
          </div>
        </div>
      </CommandDialog>
    </div>
  )
}

export default SearchDialog
