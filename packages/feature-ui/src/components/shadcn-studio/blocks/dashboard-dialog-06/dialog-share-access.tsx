'use client'

import { useState, type ReactNode } from 'react'

import { CodeXmlIcon, CopyIcon, LinkIcon, SearchIcon } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@superbuilder/feature-ui/shadcn/avatar'
import { Button } from '@superbuilder/feature-ui/shadcn/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@superbuilder/feature-ui/shadcn/dialog'
import { Input } from '@superbuilder/feature-ui/shadcn/input'
import { Label } from '@superbuilder/feature-ui/shadcn/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@superbuilder/feature-ui/shadcn/select'
import { Separator } from '@superbuilder/feature-ui/shadcn/separator'

import { cn } from 'src/lib/utils'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  className?: string
  data: {
    img: string
    name: string
    email: string
    role: string
  }[]
}

const ShareAccessDialog = ({ defaultOpen = false, trigger, data, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger onClick={() => setOpen(true)}>
        {trigger}
      </DialogTrigger>
      <DialogContent className={cn('sm:max-w-155 [&>[data-slot=dialog-close]>svg]:size-5', className)}>
        <DialogHeader className='items-center gap-3'>
          <Avatar className='size-12 rounded-sm border bg-transparent p-2'>
            <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/logo/logo-square.png' className='rounded-full' />
            <AvatarFallback>SS</AvatarFallback>
          </Avatar>
          <div className='space-y-1 text-center'>
            <DialogTitle className='leading-7'>Share shadcn/studio Design</DialogTitle>
            <DialogDescription>Invite your team to review collaborate on this project.</DialogDescription>
          </div>
        </DialogHeader>

        <div className='mt-2 space-y-6'>
          <div className='flex flex-wrap items-center gap-4 rounded-md border p-2'>
            <Avatar className='rounded-sm'>
              <AvatarFallback className='bg-muted text-foreground rounded-sm'>
                <LinkIcon className='size-5' />
              </AvatarFallback>
            </Avatar>
            <div className='flex flex-1 flex-col gap-4 sm:flex-row sm:items-center'>
              <div className='flex flex-1 flex-col items-start'>
                <p className='font-medium'>Anyone with the link</p>
                <p className='text-muted-foreground text-sm'>shadcnstudio.com/component/button</p>
              </div>
              <Select defaultValue='can-view'>
                <SelectTrigger className='border-0 px-2 shadow-none'>
                  <SelectValue placeholder='Select a role' />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value='can-view'>Can view</SelectItem>
                    <SelectItem value='can-edit'>Can edit</SelectItem>
                    <SelectItem value='can-comment'>Can comment</SelectItem>
                    <SelectItem value='no-access'>No access</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className='space-y-4'>
            <div className='w-full space-y-2'>
              <Label htmlFor='search-user' className='text-base font-normal'>
                People with access
              </Label>
              <div className='relative'>
                <div className='text-muted-foreground pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3.5 peer-disabled:opacity-50'>
                  <SearchIcon className='size-4' />
                  <span className='sr-only'>User</span>
                </div>
                <Input id='search-user' type='text' placeholder='Search team members' className='peer h-10 pl-9.5' />
              </div>
            </div>

            {data.map(item => (
              <div key={item.email} className='flex flex-wrap items-center gap-3 py-1'>
                <Avatar className='size-9.5'>
                  <AvatarImage src={item.img} />
                  <AvatarFallback>
                    {item.name.split(/\s/).reduce((response, word) => (response += word.slice(0, 1)), '')}
                  </AvatarFallback>
                </Avatar>
                <div className='flex flex-1 gap-4 sm:items-center'>
                  <div className='flex flex-1 flex-col items-start'>
                    <p className='font-medium'>{item.name}</p>
                    <p className='text-muted-foreground text-sm'>{item.email}</p>
                  </div>
                  <Select defaultValue={item.role}>
                    <SelectTrigger size='sm' className='border-0 px-2 shadow-none'>
                      <SelectValue placeholder='Select a role' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value='owner'>Owner</SelectItem>
                        <SelectItem value='admin'>Admin</SelectItem>
                        <SelectItem value='editor'>Editor</SelectItem>
                        <SelectItem value='reader'>Reader</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <DialogFooter className='gap-4 max-sm:flex-col sm:justify-between'>
          <div className='flex justify-between gap-4'>
            <Button className='bg-primary/10 text-primary hover:bg-primary/20'>
              <CopyIcon />
              Copy Link
            </Button>
            <Button variant='outline'>
              <CodeXmlIcon />
              Embed
            </Button>
          </div>
          <DialogClose render={<Button />}>Save</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ShareAccessDialog
