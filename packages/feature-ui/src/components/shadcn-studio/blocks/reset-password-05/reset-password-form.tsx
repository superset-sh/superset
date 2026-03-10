'use client'

import { useState } from 'react'

import { EyeIcon, EyeOffIcon } from 'lucide-react'

import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Input } from '@superbuilder/feature-ui/shadcn/input'
import { Label } from '@superbuilder/feature-ui/shadcn/label'

const ResetPasswordForm = () => {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false)

  return (
    <form className='space-y-4' onSubmit={e => e.preventDefault()}>
      {/* Password */}
      <div className='w-full space-y-1'>
        <Label className='leading-5' htmlFor='password'>
          New Password*
        </Label>
        <div className='relative'>
          <Input
            id='password'
            type={isPasswordVisible ? 'text' : 'password'}
            placeholder='••••••••••••••••'
            className='pr-9'
          />
          <Button
            variant='ghost'
            size='icon'
            onClick={() => setIsPasswordVisible(prevState => !prevState)}
            className='text-muted-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent'
          >
            {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
            <span className='sr-only'>{isPasswordVisible ? 'Hide password' : 'Show password'}</span>
          </Button>
        </div>
      </div>

      {/* Confirm Password */}
      <div className='w-full space-y-1'>
        <Label className='leading-5' htmlFor='confirmPassword'>
          Confirm New Password*
        </Label>
        <div className='relative'>
          <Input
            id='confirmPassword'
            type={isConfirmPasswordVisible ? 'text' : 'password'}
            placeholder='••••••••••••••••'
            className='pr-9'
          />
          <Button
            variant='ghost'
            size='icon'
            onClick={() => setIsConfirmPasswordVisible(prevState => !prevState)}
            className='text-muted-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent'
          >
            {isConfirmPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
            <span className='sr-only'>{isConfirmPasswordVisible ? 'Hide password' : 'Show password'}</span>
          </Button>
        </div>
      </div>

      <Button className='w-full' type='submit'>
        Sign in to Shadcn Studio
      </Button>
    </form>
  )
}

export default ResetPasswordForm
