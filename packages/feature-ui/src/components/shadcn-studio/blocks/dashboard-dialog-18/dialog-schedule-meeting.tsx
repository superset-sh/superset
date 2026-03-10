'use client'

import { useState, type ReactNode } from 'react'

import {
  AlertCircleIcon,
  CalendarIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  Clock8Icon,
  Trash2Icon,
  UploadIcon
} from 'lucide-react'

import type { DateRange } from 'react-day-picker'

import { Badge } from '@superbuilder/feature-ui/shadcn/badge'
import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Calendar } from '@superbuilder/feature-ui/shadcn/calendar'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@superbuilder/feature-ui/shadcn/dropdown-menu'
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
import { Textarea } from '@superbuilder/feature-ui/shadcn/textarea'
import { ToggleGroup, ToggleGroupItem } from '@superbuilder/feature-ui/shadcn/toggle-group'

import { formatBytes, useFileUpload } from 'src/hooks/use-file-upload'

import { cn } from 'src/lib/utils'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  className?: string
}

const ScheduleMeetingDialog = ({ defaultOpen = false, trigger, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen)
  const [repeat, setRepeat] = useState<'weekly' | 'biweekly'>('weekly')
  const [range, setRange] = useState<DateRange | undefined>(undefined)

  const maxSizeMB = 5
  const maxSize = maxSizeMB * 1024 * 1024
  const maxFiles = 6

  const [
    { files, isDragging, errors },
    { handleDragEnter, handleDragLeave, handleDragOver, handleDrop, openFileDialog, removeFile, getInputProps }
  ] = useFileUpload({
    maxSize,
    multiple: true,
    maxFiles
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger onClick={() => setOpen(true)}>
        {trigger}
      </DialogTrigger>
      <DialogContent
        className={cn(
          'flex max-h-[min(915px,95vh)] flex-col gap-0 p-0 max-sm:max-h-[min(650px,80vh)] md:max-w-188 lg:max-w-197.5 [&>[data-slot=dialog-close]>svg]:size-5',
          className
        )}
      >
        <ScrollArea className='flex max-h-full flex-col overflow-hidden'>
          <div className='flex flex-col gap-6 p-6'>
            <DialogHeader>
              <DialogTitle className='leading-7'>Create New Schedule</DialogTitle>
              <DialogDescription>You can create meeting, event and task</DialogDescription>
            </DialogHeader>

            <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
              <div className='col-span-2 space-y-1.5 md:col-span-4'>
                <Label htmlFor='title' className='text-base'>
                  Title
                </Label>
                <Input id='title' type='text' placeholder='Add a title' className='h-10' />
              </div>

              <div className='col-span-2 space-y-1.5 md:col-span-3'>
                <span className='font-medium'>Days</span>
                <ToggleGroup
                  type='multiple'
                  defaultValue={['saturday']}
                  className='[&>[data-slot=toggle-group-item]]:bg-muted [&>[data-state=on]]:bg-primary [&>[data-state=on]]:text-primary-foreground gap-2 [&>[data-slot=toggle-group-item]]:size-8 [&>[data-slot=toggle-group-item]]:rounded-full!'
                >
                  <ToggleGroupItem value='monday'>M</ToggleGroupItem>
                  <ToggleGroupItem value='tuesday'>T</ToggleGroupItem>
                  <ToggleGroupItem value='wednesday'>W</ToggleGroupItem>
                  <ToggleGroupItem value='thursday'>T</ToggleGroupItem>
                  <ToggleGroupItem value='friday'>F</ToggleGroupItem>
                  <ToggleGroupItem value='saturday'>S</ToggleGroupItem>
                  <ToggleGroupItem value='sunday'>S</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className='flex flex-col gap-1.5 max-md:col-span-2 md:items-end'>
                <span className='font-medium'>Repeat</span>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button size='lg' className='bg-primary/10 text-primary hover:bg-primary/20 capitalize md:w-max' />}>{repeat}<ChevronDownIcon /></DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => setRepeat('weekly')}>Weekly</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setRepeat('biweekly')}>Biweekly</DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className='col-span-2 space-y-1.5'>
                <Label htmlFor='dates' className='text-base'>
                  Date
                </Label>
                <Popover>
                  <PopoverTrigger render={<Button variant='outline' id='dates' className='w-full justify-start font-normal' />}><CalendarIcon />{range?.from && range?.to
                                                          ? `${range.from.toLocaleDateString()} - ${range.to.toLocaleDateString()}`
                                                          : 'Pick a date'}</PopoverTrigger>
                  <PopoverContent className='w-auto overflow-hidden p-0' align='start'>
                    <Calendar
                      mode='range'
                      selected={range}
                      onSelect={range => {
                        setRange(range)
                      }}
                      disabled={{ before: new Date() }}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className='col-span-2 space-y-1.5'>
                <Label htmlFor='timepicker' className='text-base'>
                  Time
                </Label>
                <div className='relative'>
                  <div className='pointer-events-none absolute inset-y-0 right-0 flex items-center justify-center pr-3 peer-disabled:opacity-50'>
                    <Clock8Icon className='size-4' />
                    <span className='sr-only'>User</span>
                  </div>
                  <Input
                    type='time'
                    id='time-picker'
                    step='1'
                    defaultValue='08:30:00'
                    className='peer bg-background appearance-none pr-3 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none'
                  />
                </div>
              </div>

              <div className='col-span-2 space-y-1.5 md:col-span-4'>
                <Label htmlFor='description' className='text-base'>
                  Description
                </Label>
                <Textarea placeholder='Type here' id='description' />
              </div>

              <div className='col-span-2 space-y-1.5'>
                <Label htmlFor='members'>Members</Label>
                <Select defaultValue='10'>
                  <SelectTrigger id='members' className='w-full'>
                    <SelectValue placeholder='Select a member' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value='5'>5 members</SelectItem>
                      <SelectItem value='10'>10 members</SelectItem>
                      <SelectItem value='15'>15 members</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className='col-span-2 space-y-1.5'>
                <Label htmlFor='platform'>Platform</Label>
                <Select defaultValue='zoom'>
                  <SelectTrigger id='platform' className='w-full'>
                    <SelectValue placeholder='Select a platform' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value='zoom'>Zoom meeting</SelectItem>
                      <SelectItem value='google-meet'>Google Meet</SelectItem>
                      <SelectItem value='microsoft-teams'>Microsoft Teams</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className='flex flex-col gap-6'>
              <div
                role='button'
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                data-dragging={isDragging || undefined}
                data-files={files.length > 0 || undefined}
                className='bg-muted data-[dragging=true]:bg-accent/50 has-[input:focus]:ring-ring/50 flex min-h-24 flex-col justify-center gap-4 overflow-hidden rounded-xl p-4 has-[input:focus]:ring-[3px]'
              >
                <input {...getInputProps()} className='sr-only' aria-label='Upload file' />
                <Button className='bg-primary/10 text-primary hover:bg-primary/20' size='lg' onClick={openFileDialog}>
                  Select Files
                  <UploadIcon />
                </Button>

                {files.length > 0 && (
                  <div className='flex w-full flex-col gap-4'>
                    <Separator />
                    {files.map(file => {
                      return (
                        <div
                          key={file.id}
                          className='flex items-center justify-between gap-2 transition-opacity duration-300'
                        >
                          <div className='flex items-center gap-2'>
                            <CircleCheckIcon className='size-4 shrink-0' />
                            <p className='truncate text-sm font-semibold max-sm:max-w-35'>
                              {file.file instanceof File ? file.file.name : file.file.name}
                            </p>
                            <Badge className='bg-primary/10 focus-visible:ring-primary/20 text-primary border-none focus-visible:outline-none'>
                              {formatBytes(file.file instanceof File ? file.file.size : file.file.size)}
                            </Badge>
                          </div>

                          <Button
                            onClick={() => removeFile(file.id)}
                            variant='ghost'
                            aria-label='remove file'
                            className='size-6'
                          >
                            <Trash2Icon className='text-muted-foreground size-5' />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {errors.length > 0 && (
                <div className='text-destructive flex items-center gap-1 text-xs' role='alert'>
                  <AlertCircleIcon className='size-3 shrink-0' />
                  <span>{errors[0]}</span>
                </div>
              )}
            </div>

            <DialogFooter className='flex-row gap-4'>
              <DialogClose render={<Button variant='outline' size='lg' />}>Cancel
                                          </DialogClose>
              <Button size='lg'>Create Event</Button>
            </DialogFooter>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default ScheduleMeetingDialog
