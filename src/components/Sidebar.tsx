import type { ReactNode } from 'react'
import { ChevronDown, Volume2, VolumeX } from 'lucide-react'
import { IconButton } from './ui'
import { cn } from '../lib/utils'

interface SidebarProps {
  muted: boolean
  /** 모바일 바텀시트가 열려 있는지. 데스크톱에서는 의미가 없다. */
  open: boolean
  onToggleMuted: () => void
  onClose: () => void
  children: ReactNode
}

/**
 * 설정 영역.
 *
 * 한 벌의 내용을 화면 크기에 따라 다르게 보여 준다.
 *   - 데스크톱: 좌측에 붙박이로 선 고정 폭 칼럼
 *   - 모바일:   3D 위로 올라오는 바텀시트
 *
 * 모바일에서 사이드바를 위아래로 쌓으면 주인공인 3D가 아래 칸으로 밀린다.
 * 3D를 화면 전체로 깔고 설정이 그 위를 덮는 편이 낫다. 지도 앱들이 쓰는 방식이다.
 */
export function Sidebar({ muted, open, onToggleMuted, onClose, children }: SidebarProps) {
  return (
    <>
      {/* 시트가 열렸을 때 뒤를 덮는 막. 데스크톱에는 없다. */}
      <button
        type="button"
        aria-label="설정 닫기"
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-20 cursor-default bg-neutral-950/60 backdrop-blur-sm transition-opacity duration-300',
          'min-[900px]:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        className={cn(
          // 모바일: 아래에서 올라오는 시트
          'fixed inset-x-0 bottom-0 z-30 flex max-h-[86svh] flex-col',
          'rounded-t-3xl border-t border-neutral-800 bg-neutral-950/95 backdrop-blur',
          'transition-transform duration-300 ease-out',
          open ? 'translate-y-0' : 'translate-y-full',
          // 데스크톱: 왼쪽에 붙박이 칼럼
          'min-[900px]:static min-[900px]:h-svh min-[900px]:max-h-none min-[900px]:w-[368px]',
          'min-[900px]:shrink-0 min-[900px]:translate-y-0 min-[900px]:rounded-none',
          'min-[900px]:border-t-0 min-[900px]:border-r min-[900px]:border-neutral-800',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-neutral-800 px-5 py-4">
          <div className="min-w-0">
            <h1 className="text-base font-extrabold tracking-tight">
              전능 회식 메뉴 3D 원기둥형 스레드
            </h1>
            <p className="mt-0.5 text-xs text-neutral-400">
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
              onClick={onClose}
              aria-label="설정 닫기"
              className="min-[900px]:hidden"
            >
              <ChevronDown className="size-4" />
            </IconButton>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </aside>
    </>
  )
}
