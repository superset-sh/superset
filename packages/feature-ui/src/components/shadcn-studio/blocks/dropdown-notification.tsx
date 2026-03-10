import type { ReactNode } from 'react'

import { SettingsIcon, XIcon, LinkIcon } from 'lucide-react'

import { Badge } from 'src/_shadcn/badge'
import { Button } from 'src/_shadcn/button'
import { Avatar, AvatarImage, AvatarFallback } from 'src/_shadcn/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'src/_shadcn/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuItem
} from 'src/_shadcn/dropdown-menu'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  align?: 'start' | 'center' | 'end'
}

const NotificationDropdown = ({ trigger, defaultOpen, align = 'end' }: Props) => {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className='max-w-xs sm:max-w-122' align={align || 'end'}>
        <Tabs defaultValue='inbox' className='gap-0'>
          <DropdownMenuLabel className='flex flex-col pb-0'>
            <div className='flex items-center justify-between gap-6 pb-2.5'>
              <span className='text-muted-foreground text-base font-normal uppercase'>Notifications</span>
              <Badge variant='secondary' className='bg-primary/10 text-primary font-normal'>
                8 New
              </Badge>
            </div>
            <div className='-mb-0.5 flex items-center justify-between gap-4'>
              <TabsList className='relative h-fit rounded-none bg-transparent p-0'>
                <TabsTrigger
                  value='inbox'
                  className='data-[state=active]:!border-b-primary rounded-none border-b-2 border-b-transparent font-normal data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent'
                >
                  Inbox
                </TabsTrigger>
                <TabsTrigger
                  value='general'
                  className='data-[state=active]:!border-b-primary rounded-none border-b-2 border-b-transparent font-normal data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent'
                >
                  General
                </TabsTrigger>
              </TabsList>
              <SettingsIcon className='size-5' />
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator className='mt-0 h-0.5' />

          <TabsContent value='inbox'>
            <DropdownMenuItem className='gap-3 px-2 py-3 text-base'>
              <Avatar className='size-9.5'>
                <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-19.png' />
                <AvatarFallback>MB</AvatarFallback>
              </Avatar>
              <div className='flex w-full flex-col items-start'>
                <span className='text-base font-medium'>Mark Bush</span>
                <div className='flex items-center gap-2.5'>
                  <span className='text-muted-foreground text-sm'>12 Minutes ago</span>
                  <div className='bg-muted size-1.5 rounded-full' />
                  <span className='text-muted-foreground text-sm'>New post</span>
                </div>
              </div>
              <div className='flex flex-col items-center gap-3'>
                <XIcon className='text-foreground size-3.5' />
                <div className='bg-primary size-1.5 rounded-full' />
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className='gap-3 px-2 py-3 text-base'>
              <Avatar className='size-9.5'>
                <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png' />
                <AvatarFallback>AB</AvatarFallback>
              </Avatar>
              <div className='flex w-full flex-col items-start'>
                <span className='text-base font-medium'>Aaron Black</span>
                <div className='flex items-center gap-2.5'>
                  <span className='text-muted-foreground text-sm'>27 Minutes ago</span>
                  <div className='bg-muted size-1.5 rounded-full' />
                  <span className='text-muted-foreground text-sm'>New comment</span>
                </div>
              </div>
              <div className='flex flex-col items-center gap-3'>
                <XIcon className='text-foreground size-3.5' />
                <div className='bg-primary size-1.5 rounded-full' />
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className='items-start gap-3 px-2 py-3 text-base'>
              <Avatar className='size-9.5'>
                <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png' />
                <AvatarFallback>A</AvatarFallback>
              </Avatar>
              <div className='flex w-full flex-col items-start'>
                <span className='text-base font-medium'>Anna has applied to create an ad for your campaign</span>
                <div className='flex items-center gap-2.5'>
                  <span className='text-muted-foreground text-sm'>2 hours ago</span>
                  <div className='bg-muted size-1.5 rounded-full' />
                  <span className='text-muted-foreground text-sm'>New request for campaign</span>
                </div>
                <div className='mt-3 flex items-center gap-4'>
                  <Button variant='secondary' size='sm'>
                    Decline
                  </Button>
                  <Button size='sm'>Accept</Button>
                </div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className='items-start gap-3 px-2 py-3 text-base'>
              <Avatar className='size-9.5'>
                <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png' />
                <AvatarFallback>J</AvatarFallback>
              </Avatar>
              <div className='flex w-full flex-col items-start'>
                <span className='text-base font-medium'>Jason attached the file</span>
                <div className='flex items-center gap-2.5'>
                  <span className='text-muted-foreground text-sm'>6 hours ago</span>
                  <div className='bg-muted size-1.5 rounded-full' />
                  <span className='text-muted-foreground text-sm'>Attached files</span>
                </div>
                <div className='mt-3 flex items-center gap-1.5'>
                  <LinkIcon className='text-foreground' />
                  <span className='text-sm'>Work examples.com</span>
                </div>
              </div>
            </DropdownMenuItem>
          </TabsContent>

          <TabsContent value='general'>
            <DropdownMenuItem className='gap-3 px-2 py-3 text-base'>
              <Avatar className='size-9.5'>
                <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-7.png' />
                <AvatarFallback>FC</AvatarFallback>
              </Avatar>
              <div className='flex w-full flex-col items-start'>
                <span className='text-base font-medium'>Fred Campbell</span>
                <div className='flex items-center gap-2.5'>
                  <span className='text-muted-foreground text-sm'>39 Minutes ago</span>
                  <div className='bg-muted size-1.5 rounded-full' />
                  <span className='text-muted-foreground text-sm'>New comment</span>
                </div>
              </div>
              <div className='flex flex-col items-center gap-3'>
                <XIcon className='text-foreground size-3.5' />
                <div className='bg-primary size-1.5 rounded-full' />
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className='items-start gap-3 px-2 py-3 text-base'>
              <Avatar className='size-9.5'>
                <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-15.png' />
                <AvatarFallback>S</AvatarFallback>
              </Avatar>
              <div className='flex w-full flex-col items-start'>
                <span className='text-base font-medium'>Scott attached the file</span>
                <div className='flex items-center gap-2.5'>
                  <span className='text-muted-foreground text-sm'>3 hours ago</span>
                  <div className='bg-muted size-1.5 rounded-full' />
                  <span className='text-muted-foreground text-sm'>Attached files</span>
                </div>
                <div className='mt-3 flex items-center gap-1.5'>
                  <LinkIcon className='text-foreground' />
                  <span className='text-sm'>Work examples.com</span>
                </div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className='gap-3 px-2 py-3 text-base'>
              <Avatar className='size-9.5'>
                <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-11.png' />
                <AvatarFallback>HL</AvatarFallback>
              </Avatar>
              <div className='flex w-full flex-col items-start'>
                <span className='text-base font-medium'>Harold Larson</span>
                <div className='flex items-center gap-2.5'>
                  <span className='text-muted-foreground text-sm'>5 hours ago</span>
                  <div className='bg-muted size-1.5 rounded-full' />
                  <span className='text-muted-foreground text-sm'>New post</span>
                </div>
              </div>
              <div className='flex flex-col items-center gap-3'>
                <XIcon className='text-foreground size-3.5' />
                <div className='bg-primary size-1.5 rounded-full' />
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className='items-start gap-3 px-2 py-3 text-base'>
              <Avatar className='size-9.5'>
                <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-6.png' />
                <AvatarFallback>R</AvatarFallback>
              </Avatar>
              <div className='flex w-full flex-col items-start'>
                <span className='text-base font-medium'>Rosie has applied to create an ad for your campaign</span>
                <div className='flex items-center gap-2.5'>
                  <span className='text-muted-foreground text-sm'>8 hours ago</span>
                  <div className='bg-muted size-1.5 rounded-full' />
                  <span className='text-muted-foreground text-sm'>New request for campaign</span>
                </div>
                <div className='mt-3 flex items-center gap-4'>
                  <Button variant='secondary' size='sm'>
                    Decline
                  </Button>
                  <Button size='sm'>Accept</Button>
                </div>
              </div>
            </DropdownMenuItem>
          </TabsContent>
        </Tabs>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default NotificationDropdown
