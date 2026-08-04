import { useEffect, useRef } from 'react'
import { PartyPopper, Frown } from 'lucide-react'
import { personColor } from '../lib/geometry'
import { Button } from './ui'
import { cn } from '../lib/utils'

interface PersonResultDialogProps {
  /** null이면 닫힌 상태. */
  result: { name: string; index: number; isWin: boolean } | null
  onClose: () => void
}

/**
 * 한 사람의 결과를 알리는 모달.
 *
 * 결과 칸에서 거꾸로 거슬러 올라가 주인을 찾아낸 순간에 뜬다. 원기둥 위에서
 * 경로가 끝난 걸 봐도 "그래서 누구였지?"가 남는데, 이름을 크게 못박아 준다.
 */
export function PersonResultDialog({ result, onClose }: PersonResultDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!result) return

    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [result, onClose])

  if (!result) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="person-result-title"
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-neutral-950/70 backdrop-blur-sm"
      />

      <div
        className={cn(
          'animate-pop-in relative w-full max-w-xs rounded-2xl border p-6 text-center shadow-2xl',
          result.isWin
            ? 'border-amber-400 bg-amber-400 shadow-[0_10px_60px_rgba(251,191,36,0.5)]'
            : 'border-neutral-800 bg-neutral-900',
        )}
      >
        {result.isWin ? (
          <PartyPopper className="mx-auto size-9 text-amber-950" aria-hidden />
        ) : (
          <Frown className="mx-auto size-9 text-neutral-500" aria-hidden />
        )}

        <p
          className={cn(
            'mt-3 text-xs font-bold',
            result.isWin ? 'text-amber-950/70' : 'text-neutral-500',
          )}
        >
          이 칸의 주인은
        </p>

        <p
          id="person-result-title"
          className={cn(
            'mt-1 text-3xl font-black break-keep',
            result.isWin ? 'text-neutral-950' : 'text-neutral-100',
          )}
          style={result.isWin ? undefined : { color: personColor(result.index) }}
        >
          {result.name}
        </p>

        <p
          className={cn(
            'mt-1 text-sm font-bold',
            result.isWin ? 'text-amber-950' : 'text-neutral-400',
          )}
        >
          {result.isWin ? '당첨입니다' : '꽝입니다'}
        </p>

        <Button
          ref={closeRef}
          variant={result.isWin ? 'outline' : 'primary'}
          onClick={onClose}
          className={cn(
            'mt-5 w-full py-2.5',
            result.isWin && 'border-amber-950/30 text-amber-950 hover:bg-amber-950/10',
          )}
        >
          확인
        </Button>
      </div>
    </div>
  )
}
