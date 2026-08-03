import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Check, Link2, Minus, Play, Plus, RotateCcw, Shuffle } from 'lucide-react'
import type { Phase } from '../lib/types'
import { Button, IconButton, Panel } from './ui'
import { cn } from '../lib/utils'

interface ControlsProps {
  phase: Phase
  peopleCount: number
  winCount: number
  shareUrl: string
  onWinCountChange: (value: number) => void
  onRoll: () => void
  onPlay: () => void
  onReset: () => void
}

function ControlsImpl({
  phase,
  peopleCount,
  winCount,
  shareUrl,
  onWinCountChange,
  onRoll,
  onPlay,
  onReset,
}: ControlsProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(0)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const share = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // 클립보드 권한이 없거나 비보안 컨텍스트인 경우의 최후 수단
      const field = document.createElement('textarea')
      field.value = shareUrl
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      document.execCommand('copy')
      document.body.removeChild(field)
    }
    setCopied(true)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setCopied(false), 1800)
  }, [shareUrl])

  const busy = phase === 'running'
  const canBuild = peopleCount >= 2 && !busy

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-100">
            당첨 인원
          </span>
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            나머지 {Math.max(peopleCount - winCount, 0)}명은 꽝
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            variant="outline"
            onClick={() => onWinCountChange(winCount - 1)}
            disabled={busy || winCount <= 0}
            aria-label="당첨 인원 줄이기"
          >
            <Minus className="size-4" aria-hidden />
          </IconButton>
          <span className="w-9 text-center text-lg font-bold tabular-nums">{winCount}</span>
          <IconButton
            variant="outline"
            onClick={() => onWinCountChange(winCount + 1)}
            disabled={busy || winCount >= peopleCount}
            aria-label="당첨 인원 늘리기"
          >
            <Plus className="size-4" aria-hidden />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          variant={phase === 'edit' ? 'primary' : 'outline'}
          onClick={onRoll}
          disabled={!canBuild}
          className="h-12 w-full text-sm font-bold"
        >
          <Shuffle className="size-4" aria-hidden />
          {phase === 'edit' ? '랜덤 사다리 만들기' : '사다리 다시 만들기'}
        </Button>

        {phase !== 'edit' && (
          <Button
            variant="primary"
            onClick={onPlay}
            disabled={busy}
            className="h-14 w-full text-base font-bold"
          >
            <Play className="size-5" aria-hidden />
            {busy ? '내려가는 중...' : phase === 'done' ? '다시 타기' : '사다리 타기'}
          </Button>
        )}
      </div>

      {phase === 'done' && (
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => void share()}
            className={cn('w-full py-2.5', copied && 'border-amber-500 text-amber-600')}
          >
            {copied ? (
              <>
                <Check className="size-4" aria-hidden />
                결과 링크가 복사되었습니다
              </>
            ) : (
              <>
                <Link2 className="size-4" aria-hidden />
                결과 공유 링크 복사
              </>
            )}
          </Button>
          <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            링크를 받은 사람은 똑같은 사다리와 결과를 그대로 보게 됩니다.
          </p>
        </div>
      )}

      {peopleCount < 2 && (
        <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
          사다리를 만들려면 2명 이상이 필요합니다.
        </p>
      )}

      {phase !== 'edit' && (
        <Button variant="ghost" onClick={onReset} disabled={busy} className="w-full text-xs">
          <RotateCcw className="size-3.5" aria-hidden />
          사다리 치우기
        </Button>
      )}
    </Panel>
  )
}

export const Controls = memo(ControlsImpl)
