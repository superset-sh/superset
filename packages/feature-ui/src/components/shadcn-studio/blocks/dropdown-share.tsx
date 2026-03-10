'use client'

import type { ReactNode } from 'react'

import { InfoIcon, LinkIcon, MoreHorizontalIcon } from 'lucide-react'

import { Input } from '@superbuilder/feature-ui/shadcn/input'
import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Avatar, AvatarImage, AvatarFallback } from '@superbuilder/feature-ui/shadcn/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@superbuilder/feature-ui/shadcn/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@superbuilder/feature-ui/shadcn/select'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  align?: 'start' | 'center' | 'end'
  morePeople?: {
    img: string
    name: string
  }[]
  data: {
    img: string
    name: string
    email: string
    role: string
  }[]
}

const ShareDropdown = ({ defaultOpen, align, trigger, data, morePeople }: Props) => {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className='w-xs sm:w-116' align={align || 'end'}>
        <DropdownMenuLabel className='text-muted-foreground font-normal uppercase'>
          Share Read-only Link
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className='mt-4 flex flex-col gap-3 px-2'>
          <div className='flex items-center gap-2.5'>
            <Input type='email' placeholder='Enter email' className='h-8' />
            <Button size='sm'>Send</Button>
          </div>
          <p className='text-sm font-medium'>Team Members</p>
          <div className='flex flex-col gap-3'>
            {data.map(item => (
              <div key={item.email} className='flex flex-wrap items-center gap-4 px-3 py-1'>
                <Avatar className='size-9.5'>
                  <AvatarImage src={item.img} />
                  <AvatarFallback>
                    {item.name.split(/\s/).reduce((response, word) => (response += word.slice(0, 1)), '')}
                  </AvatarFallback>
                </Avatar>
                <div className='flex flex-1 flex-col gap-4 sm:flex-row sm:items-center'>
                  <div className='flex flex-1 flex-col items-start'>
                    <p className='font-medium'>{item.name}</p>
                    <p className='text-muted-foreground'>{item.email}</p>
                  </div>
                  <Select defaultValue={item.role}>
                    <SelectTrigger size='sm' className='border-0 px-2 shadow-none'>
                      <SelectValue placeholder='Select a role' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value='owner'>Owner</SelectItem>
                        <SelectItem value='admin'>Admin</SelectItem>
                        <SelectItem value='can-edit'>Can Edit</SelectItem>
                        <SelectItem value='can-view'>Can View</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
            {morePeople && (
              <div className='flex items-center gap-4 px-3 py-1'>
                <div className='*:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:grayscale'>
                  {morePeople.map(person => (
                    <Avatar key={person.name} className='size-7'>
                      <AvatarImage src={person.img} />
                      <AvatarFallback>
                        {person.name.split(/\s/).reduce((response, word) => (response += word.slice(0, 1)), '')}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                <p className='text-muted-foreground flex-1'>{`${morePeople.length} more people`}</p>
                <MoreHorizontalIcon className='size-4' />
              </div>
            )}
          </div>
        </div>
        <DropdownMenuSeparator />
        <div className='flex items-center gap-4 px-2 py-1'>
          <div className='text-muted-foreground flex flex-1 items-center gap-1.5'>
            <InfoIcon className='size-4' />
            <span className='text-sm'>Read more about sharing</span>
          </div>
          <Button variant='ghost' size='sm'>
            <LinkIcon />
            Copy Link
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ShareDropdown
