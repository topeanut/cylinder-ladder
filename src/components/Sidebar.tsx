import type { ReactNode } from 'react'
import { Moon, Sun, Volume2, VolumeX } from 'lucide-react'
import { IconButton } from './ui'

interface SidebarProps {
  theme: 'light' | 'dark'
  muted: boolean
  onToggleTheme: () => void
  onToggleMuted: () => void
  children: ReactNode
}

/**
 * 좌측 내비게이션(LNB).
 *
 * 3D 씬이 화면의 주인공이 되도록 설정은 전부 이쪽으로 몰았다. PC에서는 고정 폭
 * 사이드바로 세로 스크롤되고, 좁은 화면에서는 3D 위에 쌓이는 한 칸이 된다.
 */
export function Sidebar({
  theme,
  muted,
  onToggleTheme,
  onToggleMuted,
  children,
}: SidebarProps) {
  return (
    <aside className="flex w-full shrink-0 flex-col border-neutral-200 bg-neutral-100/95 lg:h-svh lg:w-[368px] lg:border-r dark:border-neutral-800 dark:bg-neutral-950/95">
      <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <div className="min-w-0">
          <h1 className="text-base font-extrabold tracking-tight">
            전능 회식 메뉴 3D 원기둥형 스레드
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            원기둥을 감은 사다리를 타고 당첨자를 정하세요
          </p>
        </div>

        <div className="flex shrink-0 gap-1">
          <IconButton
            onClick={onToggleMuted}
            aria-label={muted ? '소리 켜기' : '소리 끄기'}
            title={muted ? '소리 켜기' : '소리 끄기'}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </IconButton>
          <IconButton
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? '라이트 모드로' : '다크 모드로'}
            title={theme === 'dark' ? '라이트 모드로' : '다크 모드로'}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </IconButton>
        </div>
      </header>

      <div className="flex flex-col gap-4 overflow-y-auto p-4 lg:min-h-0 lg:flex-1">
        {children}
      </div>
    </aside>
  )
}
