'use client'

import { useState, type ReactNode } from 'react'

import { ChevronDownIcon } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@superbuilder/feature-ui/shadcn/avatar'
import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Calendar } from '@superbuilder/feature-ui/shadcn/calendar'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@superbuilder/feature-ui/shadcn/dialog'
import { Input } from '@superbuilder/feature-ui/shadcn/input'
import { Label } from '@superbuilder/feature-ui/shadcn/label'
import { Popover, PopoverContent, PopoverTrigger } from '@superbuilder/feature-ui/shadcn/popover'
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
}

const EmployeeDetailsDialog = ({ defaultOpen = false, trigger, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen)
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)
  const [date, setDate] = useState<Date | undefined>(new Date())

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger onClick={() => setOpen(true)}>
        {trigger}
      </DialogTrigger>
      <DialogContent
        className={cn(
          'flex flex-col gap-0 p-0 max-sm:max-h-[min(650px,80vh)] sm:max-w-145 [&>[data-slot=dialog-close]>svg]:size-5',
          className
        )}
      >
        <ScrollArea className='flex max-h-full flex-col overflow-hidden'>
          <div className='flex flex-col gap-4 p-6'>
            <DialogHeader>
              <DialogTitle className='leading-7'>Edit employee details</DialogTitle>
            </DialogHeader>

            <div className='flex items-center gap-6'>
              <Avatar className='size-25 shrink-0 rounded-lg'>
                <AvatarImage
                  src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png'
                  alt='john doe'
                  className='rounded-lg'
                />
                <AvatarFallback className='text-xs'>JD</AvatarFallback>
              </Avatar>

              <div className='grid flex-1 grid-cols-2 gap-4'>
                <Input type='text' placeholder='Employee name' defaultValue='John Doe' />
                <Input type='text' placeholder='Designation' defaultValue='Software Engineer' />
                <Input
                  type='email'
                  placeholder='employee@mail.com'
                  className='col-span-2'
                  defaultValue='employee@mail.com'
                />
              </div>
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div className='space-y-1'>
                <Label htmlFor='division'>Division</Label>
                <Input id='division' type='text' placeholder='e.g. Sales' defaultValue='IT' />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='gender'>Gender</Label>
                <Select defaultValue='male'>
                  <SelectTrigger id='gender' className='w-full'>
                    <SelectValue placeholder='Select a gender' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value='male'>Male</SelectItem>
                      <SelectItem value='female'>Female</SelectItem>
                      <SelectItem value='other'>Other</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1'>
                <Label htmlFor='age'>Age</Label>
                <Input id='age' type='number' placeholder='e.g. 30' defaultValue={30} />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='city'>City</Label>
                <Input id='city' type='text' placeholder='e.g. New York' defaultValue='New York' />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='emp-id'>Employee ID</Label>
                <Input
                  id='emp-id'
                  type='text'
                  placeholder='e.g. EMP-254875269-54214'
                  defaultValue='EMP-254875269-54214'
                />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='address'>Address</Label>
                <Input
                  id='address'
                  type='text'
                  placeholder='e.g. 123 Main St, City, Country'
                  defaultValue='123 Main St, City, Country'
                />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='phone'>Phone Number</Label>
                <Input id='phone' type='tel' maxLength={10} placeholder='e.g. 9868666480' defaultValue='9868666480' />
              </div>

              <div className='space-y-1'>
                <Label htmlFor='joining-date' className='px-1'>
                  Joining Date
                </Label>
                <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                  <PopoverTrigger render={<Button variant='outline' id='joining-date' className='w-full justify-between font-normal' />}>{date ? date.toLocaleDateString() : <span className='text-muted-foreground'>Joining date</span>}<ChevronDownIcon /></PopoverTrigger>
                  <PopoverContent className='w-auto overflow-hidden p-0' align='start'>
                    <Calendar
                      mode='single'
                      selected={date}
                      onSelect={date => {
                        setDate(date)
                        setDatePopoverOpen(false)
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <Separator />

            <DialogFooter className='flex-row !justify-between gap-4'>
              <DialogClose render={<Button size='lg' variant='outline' />}>Cancel
                                          </DialogClose>
              <Button size='lg'>Save details</Button>
            </DialogFooter>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default EmployeeDetailsDialog
