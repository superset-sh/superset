import type { ReactNode } from 'react'

import { ImageIcon } from 'lucide-react'

import { Badge } from 'src/_shadcn/badge'
import { Input } from 'src/_shadcn/input'
import { Separator } from 'src/_shadcn/separator'
import { Avatar, AvatarFallback, AvatarImage } from 'src/_shadcn/avatar'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from 'src/_shadcn/sheet'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
}

const ActivityDialog = ({ defaultOpen = false, trigger }: Props) => {
  return (
    <Sheet defaultOpen={defaultOpen}>
      <SheetTrigger>{trigger}</SheetTrigger>
      <SheetContent className='gap-0 sm:max-w-112 [&>button]:top-2.75 [&>button>svg]:size-5'>
        <SheetHeader className='border-b py-2.25'>
          <SheetTitle className='text-lg leading-6'>Activity</SheetTitle>
          <SheetDescription hidden />
        </SheetHeader>

        <div className='overflow-y-auto'>
          <div className='flex gap-4 px-4 py-3'>
            <Avatar>
              <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png' />
              <AvatarFallback>JL</AvatarFallback>
            </Avatar>
            <div className='flex w-full flex-col items-start gap-2.5'>
              <div className='text-muted-foreground flex flex-col items-start text-sm'>
                <p>
                  <span className='text-foreground font-semibold'>Joe Lincoln</span> mentioned you in last trends topic
                </p>
                <p>18 mins ago</p>
              </div>
              <div className='bg-muted flex flex-col gap-4 rounded-md border px-4 py-2.5'>
                <p className='text-sm font-medium'>
                  @ShadcnStudio For an expert opinion, check out what Mike has to say on this topic!
                </p>
                <div className='relative'>
                  <Input placeholder='Reply' className='peer bg-card pr-9' />
                  <div className='text-muted-foreground pointer-events-none absolute inset-y-0 right-0 flex items-center justify-center pr-3 peer-disabled:opacity-50'>
                    <ImageIcon className='size-4' />
                    <span className='sr-only'>Email</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div className='flex gap-4 px-4 py-3'>
            <Avatar>
              <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png' />
              <AvatarFallback>JP</AvatarFallback>
            </Avatar>
            <div className='flex w-full flex-col items-start gap-2.5'>
              <div className='text-muted-foreground flex flex-col items-start text-sm'>
                <p>
                  <span className='text-foreground font-semibold'>Jane Perez</span> invites you to review a file
                </p>
                <p>39 mins ago</p>
              </div>
              <div className='bg-muted flex items-center gap-1 rounded-md px-1.5 py-1'>
                <img
                  src='https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dashboard-dialog/image-14.png'
                  className='h-5'
                />
                <span className='text-sm font-medium'>invoices.pdf</span>
              </div>
            </div>
          </div>

          <Separator />

          <div className='flex gap-4 px-4 py-3'>
            <Avatar>
              <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png' />
              <AvatarFallback>TH</AvatarFallback>
            </Avatar>
            <div className='flex w-full flex-col items-start gap-2.5'>
              <div className='text-muted-foreground flex flex-col items-start text-sm'>
                <p>
                  <span className='text-foreground font-semibold'>Tyler Hero</span> wants to view your design project
                </p>
                <p>1 hour ago</p>
              </div>
              <div className='bg-muted flex w-full items-center gap-4 rounded-md border px-4 py-2.5'>
                <img
                  src='https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dashboard-dialog/image-13.png'
                  className='size-8 rounded-sm'
                />
                <span className='text-sm font-medium'>Launcher-Uikit.fig</span>
              </div>
            </div>
          </div>

          <Separator />

          <div className='flex gap-4 px-4 py-3'>
            <Avatar>
              <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png' />
              <AvatarFallback>D</AvatarFallback>
            </Avatar>
            <div className='text-muted-foreground flex flex-col items-start text-sm'>
              <p>
                <span className='text-foreground font-semibold'>Denial</span> invites you to review the new design
              </p>
              <p>3 hours ago</p>
            </div>
          </div>

          <Separator />

          <div className='flex gap-4 px-4 py-3'>
            <Avatar>
              <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-6.png' />
              <AvatarFallback>LA</AvatarFallback>
            </Avatar>
            <div className='flex w-full flex-col items-start gap-2.5'>
              <div className='text-muted-foreground flex flex-col items-start text-sm'>
                <p>
                  <span className='text-foreground font-semibold'>Leslie Alexander</span> new tags to Web Redesign
                </p>
                <p>8 hours ago</p>
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge className='bg-primary/10 text-primary rounded-sm font-normal'>Client-Request</Badge>
                <Badge className='rounded-sm bg-sky-600/10 font-normal text-sky-600 dark:bg-sky-400/10 dark:text-sky-400'>
                  Figma
                </Badge>
                <Badge className='rounded-sm bg-amber-600/10 font-normal text-amber-600 dark:bg-amber-400/10 dark:text-amber-400'>
                  Redesign
                </Badge>
              </div>
            </div>
          </div>

          <Separator />

          <div className='flex gap-4 px-4 py-3'>
            <Avatar>
              <AvatarImage src='https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-8.png' />
              <AvatarFallback>M</AvatarFallback>
            </Avatar>
            <div className='text-muted-foreground flex flex-col items-start text-sm'>
              <p>
                <span className='text-foreground font-semibold'>Miya</span> invites you to review a file
              </p>
              <p>10 hours ago</p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default ActivityDialog
