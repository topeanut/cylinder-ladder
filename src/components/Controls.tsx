import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Check, EyeOff, Link2, Minus, Play, Plus, RotateCcw, Shuffle } from 'lucide-react'
import type { Difficulty, Phase } from '../lib/types'
import { Button, IconButton, Panel } from './ui'
import { cn } from '../lib/utils'

interface ControlsProps {
  phase: Phase
  peopleCount: number
  winCount: number
  difficulty: Difficulty
  onDifficultyChange: (value: Difficulty) => void
  /** 결과가 보이는 링크. */
  shareUrl: string
  /** 결과가 가려진 링크. 받은 사람이 직접 타야 공개된다. */
  sealedUrl: string
  onWinCountChange: (value: number) => void
  onRoll: () => void
  onPlay: () => void
  onReset: () => void
}

type Copied = 'none' | 'share' | 'sealed'

/**
 * 난이도는 가로선 밀도만 바꾸는 게 아니라 씬의 세계관까지 바꾼다.
 * 고르는 순간 배경이 통째로 달라지므로 설명도 그 점을 짚어 준다.
 */
const DIFFICULTIES: Array<{
  value: Difficulty
  label: string
  hint: string
  active: string
}> = [
  {
    value: 'easy',
    label: '쉬움',
    hint: '풀밭. 관통 가로선이 없어 눈으로 경로를 따라갈 수 있습니다.',
    active: 'bg-emerald-500 text-neutral-950',
  },
  {
    value: 'normal',
    label: '보통',
    hint: '관통 가로선이 가끔 섞입니다. 따라가려면 집중해야 합니다.',
    active: 'bg-amber-500 text-neutral-950',
  },
  {
    value: 'hell',
    label: '지옥',
    hint: '용암. 관통선이 행마다 깔려 원기둥 속이 거미줄이 됩니다.',
    active: 'bg-red-600 text-neutral-50',
  },
]

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 클립보드 권한이 없거나 비보안 컨텍스트인 경우의 최후 수단
    const field = document.createElement('textarea')
    field.value = text
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    document.execCommand('copy')
    document.body.removeChild(field)
  }
}

function ControlsImpl({
  phase,
  peopleCount,
  winCount,
  difficulty,
  onDifficultyChange,
  shareUrl,
  sealedUrl,
  onWinCountChange,
  onRoll,
  onPlay,
  onReset,
}: ControlsProps) {
  const [copied, setCopied] = useState<Copied>('none')
  const timerRef = useRef(0)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const handleCopy = useCallback(async (kind: Exclude<Copied, 'none'>, url: string) => {
    await copy(url)
    setCopied(kind)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setCopied('none'), 1800)
  }, [])

  const busy = phase === 'running'
  const canBuild = peopleCount >= 2 && !busy

  return (
    <Panel className="flex flex-col gap-4">
      <div>
        <span className="mb-1.5 block text-sm font-medium text-neutral-100">난이도</span>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-900/70 p-1">
          {DIFFICULTIES.map((level) => (
            <button
              key={level.value}
              type="button"
              onClick={() => onDifficultyChange(level.value)}
              disabled={busy}
              className={cn(
                'rounded-lg px-2 py-1.5 text-xs font-bold transition-colors disabled:opacity-50',
                difficulty === level.value
                  ? level.active
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
              )}
            >
              {level.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
          {DIFFICULTIES.find((level) => level.value === difficulty)?.hint}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-sm font-medium text-neutral-100">당첨 인원</span>
          <span className="block text-xs text-neutral-400">
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
            {busy ? '내려가는 중...' : phase === 'done' ? '다시 타기' : '전원 사다리 타기'}
          </Button>
        )}
      </div>

      {phase !== 'edit' && (
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => void handleCopy('sealed', sealedUrl)}
            className={cn(
              'w-full py-2.5',
              copied === 'sealed' && 'border-amber-500 text-amber-500',
            )}
          >
            {copied === 'sealed' ? (
              <>
                <Check className="size-4" aria-hidden />
                봉인 링크가 복사되었습니다
              </>
            ) : (
              <>
                <EyeOff className="size-4" aria-hidden />
                결과 봉인 링크 복사
              </>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={() => void handleCopy('share', shareUrl)}
            className={cn(
              'w-full py-2.5',
              copied === 'share' && 'border-amber-500 text-amber-500',
            )}
          >
            {copied === 'share' ? (
              <>
                <Check className="size-4" aria-hidden />
                결과 링크가 복사되었습니다
              </>
            ) : (
              <>
                <Link2 className="size-4" aria-hidden />
                결과 공개 링크 복사
              </>
            )}
          </Button>

          <p className="text-center text-xs leading-relaxed text-neutral-400">
            <strong className="text-neutral-300">봉인 링크</strong>는 결과가 가려진 채로
            열립니다. 받은 사람이 자기 이름을 눌러 직접 타야 자기 결과만 공개됩니다.
          </p>
        </div>
      )}

      {peopleCount < 2 && (
        <p className="text-center text-xs text-neutral-400">
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
