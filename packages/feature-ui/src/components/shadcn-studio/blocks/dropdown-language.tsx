'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from 'src/_shadcn/dropdown-menu'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  align?: 'start' | 'center' | 'end'
}

const LanguageDropdown = ({ defaultOpen, align, trigger }: Props) => {
  const [language, setLanguage] = useState('english')

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className='w-50' align={align || 'end'}>
        <DropdownMenuRadioGroup value={language} onValueChange={setLanguage}>
          <DropdownMenuRadioItem
            value='english'
            className='data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground pl-2 text-base [&>span]:hidden'
          >
            English
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value='german'
            className='data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground pl-2 text-base [&>span]:hidden'
          >
            Deutsch
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value='spanish'
            className='data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground pl-2 text-base [&>span]:hidden'
          >
            Española
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value='portuguese'
            className='data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground pl-2 text-base [&>span]:hidden'
          >
            Português
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value='korean'
            className='data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground pl-2 text-base [&>span]:hidden'
          >
            한국인
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default LanguageDropdown
