'use client'

import { useState } from 'react'

import { EyeIcon, EyeOffIcon } from 'lucide-react'

import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Checkbox } from '@superbuilder/feature-ui/shadcn/checkbox'
import { Input } from '@superbuilder/feature-ui/shadcn/input'
import { Label } from '@superbuilder/feature-ui/shadcn/label'

const RegisterForm = () => {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <form className='space-y-4' onSubmit={e => e.preventDefault()}>
      {/* Name */}
      <Input type='text' placeholder='Enter your name' />

      {/* Email */}
      <Input type='email' placeholder='Enter your email address' />

      {/* Password */}
      <div className='relative'>
        <Input id='password' type={isVisible ? 'text' : 'password'} placeholder='••••••••••••••••' className='pr-9' />
        <Button
          variant='ghost'
          size='icon'
          onClick={() => setIsVisible(prevState => !prevState)}
          className='text-muted-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent'
        >
          {isVisible ? <EyeOffIcon /> : <EyeIcon />}
          <span className='sr-only'>{isVisible ? 'Hide password' : 'Show password'}</span>
        </Button>
      </div>

      {/* Privacy policy */}
      <div className='flex items-center gap-3'>
        <Checkbox id='rememberMe' className='size-6' />
        <Label htmlFor='rememberMe' className='text-muted-foreground'>
          {' '}
          I agree to all Term, privacy Policy and Fees
        </Label>
      </div>

      <Button className='w-full' type='submit'>
        Sign up to Shadcn Studio
      </Button>
    </form>
  )
}

export default RegisterForm
