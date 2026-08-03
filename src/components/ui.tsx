import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * shadcn/ui 대신 이 앱에 필요한 최소한의 프리미티브만 직접 둔다.
 * 종류가 셋뿐이라 CLI와 Radix 의존성을 들일 이유가 없었다.
 */

// React 19에서는 ref가 함수 컴포넌트의 일반 prop이라 forwardRef 없이 그대로 흘려보낸다.
type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'ghost' | 'outline'
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-xl font-medium ' +
  'transition-colors duration-150 select-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ' +
  'disabled:cursor-not-allowed disabled:opacity-40'

const BUTTON_VARIANTS = {
  primary:
    'bg-amber-500 text-neutral-950 hover:bg-amber-400 active:bg-amber-600 shadow-sm',
  ghost:
    'text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900 ' +
    'dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100',
  outline:
    'border border-neutral-300 text-neutral-700 hover:bg-neutral-100 ' +
    'dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800',
} as const

export function Button({ variant = 'outline', className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], 'px-3 py-2 text-sm', className)}
      {...props}
    />
  )
}

export function IconButton({ variant = 'ghost', className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], 'size-9 shrink-0', className)}
      {...props}
    />
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  id: string
}

/** 스위치 + 설명이 한 줄에 붙은 형태. 라벨 전체가 클릭 영역이다. */
export function Toggle({ checked, onChange, label, description, id }: ToggleProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
        <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-100">
          {label}
        </span>
        {description && (
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            {description}
          </span>
        )}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500',
          checked ? 'bg-amber-500' : 'bg-neutral-300 dark:bg-neutral-700',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  )
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-neutral-200 bg-white/80 p-4 backdrop-blur',
        'dark:border-neutral-800 dark:bg-neutral-900/70',
        className,
      )}
    >
      {children}
    </section>
  )
}
