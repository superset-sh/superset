'use client'

import { useState, type ReactNode } from 'react'

import { CopyIcon, UserIcon } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@superbuilder/feature-ui/shadcn/avatar'
import { Button } from '@superbuilder/feature-ui/shadcn/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@superbuilder/feature-ui/shadcn/dialog'
import { Input } from '@superbuilder/feature-ui/shadcn/input'
import { Label } from '@superbuilder/feature-ui/shadcn/label'
import { ScrollArea } from '@superbuilder/feature-ui/shadcn/scroll-area'
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
    access: string
  }[]
}

const ShareProjectDialog = ({ defaultOpen = false, trigger, data, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger onClick={() => setOpen(true)}>
        {trigger}
      </DialogTrigger>
      <DialogContent
        className={cn(
          'flex flex-col gap-0 p-0 max-sm:max-h-[min(650px,80vh)] sm:max-w-162.5 [&>[data-slot=dialog-close]>svg]:size-5',
          className
        )}
      >
        <ScrollArea className='flex max-h-full flex-col overflow-hidden'>
          <div className='flex flex-col gap-4 p-6'>
            <DialogHeader className='items-center'>
              <DialogTitle className='leading-7'>Share Project</DialogTitle>
              <DialogDescription>Share project with a team member</DialogDescription>
            </DialogHeader>
            <div className='mt-2 space-y-6'>
              <div className='space-y-2'>
                <Label htmlFor='add-members' className='text-base font-normal'>
                  Add Members
                </Label>
                <Input id='add-members' type='text' placeholder='User name' className='h-10' />
              </div>
              <div className='space-y-4'>
                <p className='font-medium'>{data.length} Members</p>
                {data.map(item => (
                  <div key={item.email} className='flex items-center justify-between gap-3 py-1'>
                    <div className='flex items-center gap-3'>
                      <Avatar className='size-9.5'>
                        <AvatarImage src={item.img} />
                        <AvatarFallback>
                          {item.name.split(/\s/).reduce((response, word) => (response += word.slice(0, 1)), '')}
                        </AvatarFallback>
                      </Avatar>
                      <div className='flex flex-col items-start truncate max-sm:max-w-30'>
                        <p className='font-medium'>{item.name}</p>
                        <p className='text-muted-foreground text-sm'>{item.email}</p>
                      </div>
                    </div>
                    <Select defaultValue={item.access}>
                      <SelectTrigger className='border-0 px-2 shadow-none'>
                        <SelectValue placeholder='Select a access' />
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
                ))}
              </div>
            </div>
            <Separator />
            <DialogFooter className='gap-4 max-sm:flex-col sm:justify-between'>
              <div className='flex items-center gap-2'>
                <UserIcon className='size-4' />
                <span>Public to ShadcnStudio - ThemeSelection</span>
              </div>
              <Button size='lg'>
                <CopyIcon />
                Copy Project Link
              </Button>
            </DialogFooter>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default ShareProjectDialog
