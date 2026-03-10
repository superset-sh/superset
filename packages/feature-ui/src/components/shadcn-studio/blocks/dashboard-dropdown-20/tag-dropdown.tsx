'use client'

import { useId, useState } from 'react'

import { ChevronsUpDownIcon, CircleIcon, PlusIcon, XIcon } from 'lucide-react'

import { Badge } from '@superbuilder/feature-ui/shadcn/badge'
import { Button } from '@superbuilder/feature-ui/shadcn/button'
import { Checkbox } from '@superbuilder/feature-ui/shadcn/checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@superbuilder/feature-ui/shadcn/command'
import { Label } from '@superbuilder/feature-ui/shadcn/label'
import { Popover, PopoverContent, PopoverTrigger } from '@superbuilder/feature-ui/shadcn/popover'

import { cn } from 'src/lib/utils'

const tags = [
  { value: 'bug', label: 'Bug', tagClasses: 'fill-primary stroke-primary' },
  {
    value: 'closed',
    label: 'Closed',
    tagClasses: 'fill-green-600 dark:fill-green-400 stroke-green-600 dark:stroke-green-400'
  },
  { value: 'reviews', label: 'Reviews', tagClasses: 'fill-primary/20 stroke-primary/20' },
  { value: 'feedback', label: 'Feedback', tagClasses: 'fill-destructive stroke-destructive' },
  { value: 'generic', label: 'Generic', tagClasses: 'fill-primary/10 stroke-primary/10' },
  {
    value: 'account',
    label: 'Account',
    tagClasses: 'fill-amber-600 dark:fill-amber-400 stroke-amber-600 dark:stroke-amber-400'
  },
  {
    value: 'faq',
    label: 'FAQ',
    tagClasses: 'fill-sky-600 dark:fill-sky-400 stroke-sky-600 dark:stroke-sky-400'
  }
]

const TagDropdown = ({ defaultOpen }: { defaultOpen?: boolean }) => {
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState(defaultOpen)
  const [selectedValues, setSelectedValues] = useState<string[]>(['bug', 'feedback'])

  const toggleSelection = (value: string) => {
    setSelectedValues(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]))
  }

  const removeSelection = (value: string) => {
    setSelectedValues(prev => prev.filter(v => v !== value))
  }

  // Define maxShownItems before using visibleItems
  const maxShownItems = 2
  const visibleItems = expanded ? selectedValues : selectedValues.slice(0, maxShownItems)
  const hiddenCount = selectedValues.length - visibleItems.length

  return (
    <div className='w-full max-w-xs space-y-2'>
      <Label htmlFor={id} className='sr-only'>
        Multiple combobox expandable
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button id={id} variant='outline' role='combobox' aria-expanded={open} className='h-auto min-h-8 w-full justify-between hover:bg-transparent' />}><div className='flex flex-wrap items-center gap-1 pr-2.5'>
                            {selectedValues.length > 0 ? (
                              <>
                                {visibleItems.map(val => {
                                  const tag = tags.find(c => c.value === val)

                                  return tag ? (
                                    <Badge key={val} variant='outline' className='rounded-sm'>
                                      <div className='flex items-center gap-0.75'>
                                        <CircleIcon className={cn('size-2.5', tag.tagClasses)} />
                                        {tag.label}
                                      </div>
                                      <Button
                                        variant='ghost'
                                        size='icon'
                                        onClick={e => {
                                          e.stopPropagation()
                                          removeSelection(val)
                                        }}
                                        asChild
                                      >
                                        <span>
                                          <XIcon className='size-3' />
                                        </span>
                                      </Button>
                                    </Badge>
                                  ) : null
                                })}
                                {hiddenCount > 0 || expanded ? (
                                  <Badge
                                    variant='outline'
                                    onClick={e => {
                                      e.stopPropagation()
                                      setExpanded(prev => !prev)
                                    }}
                                    className='rounded-sm'
                                  >
                                    {expanded ? 'Show Less' : `+${hiddenCount} more`}
                                  </Badge>
                                ) : null}
                              </>
                            ) : (
                              <span className='text-muted-foreground'>Select tags</span>
                            )}
                          </div><ChevronsUpDownIcon className='text-muted-foreground/80 shrink-0' aria-hidden='true' /></PopoverTrigger>

        <PopoverContent className='w-(--radix-popper-anchor-width) p-0'>
          <Command className='gap-1 py-2 [&_[data-slot=command-input-wrapper]]:mx-3 [&_[data-slot=command-input-wrapper]]:rounded-md [&_[data-slot=command-input-wrapper]]:border'>
            <div className='flex items-center justify-between border-b px-3 pb-2'>
              <span className='text-base font-semibold'>Tags</span>
              <PlusIcon className='size-5' />
            </div>

            <CommandInput placeholder='Search tag' />

            <CommandList>
              <CommandEmpty>No tag found.</CommandEmpty>

              <CommandGroup className='px-3'>
                {tags.map(tag => (
                  <CommandItem
                    key={tag.value}
                    value={tag.value}
                    onSelect={() => toggleSelection(tag.value)}
                    className='[&_svg:not([class*="text-"])]:!text-primary-foreground justify-between'
                  >
                    <div className='flex items-center gap-2'>
                      <CircleIcon className={cn('size-2.5', tag.tagClasses)} />
                      <span className='truncate text-base'>{tag.label}</span>
                    </div>

                    <Checkbox
                      id={tag.value}
                      className='size-5'
                      checked={selectedValues.includes(tag.value)}
                      onCheckedChange={checked => {
                        if (checked) {
                          setSelectedValues([...selectedValues, tag.value])
                        } else {
                          setSelectedValues(selectedValues.filter(id => id !== tag.value))
                        }
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default TagDropdown
