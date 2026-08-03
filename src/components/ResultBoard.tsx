import { memo } from 'react'
import { History, Trophy } from 'lucide-react'
import type { LadderPlan } from '../lib/ladder'
import type { Person } from '../lib/types'
import { personColor } from '../lib/geometry'
import { formatPercent } from '../lib/probability'
import { Button, Panel } from './ui'
import { cn } from '../lib/utils'

interface ResultBoardProps {
  people: Person[]
  plan: LadderPlan | null
  /** 결과가 공개된 사람들(명단 순번). 봉인 링크에서는 하나씩 열린다. */
  revealedPeople: Set<number>
  probabilities: number[]
  wins: Record<string, number>
  activeIndex: number | null
  disabled: boolean
  onSelect: (index: number) => void
  onClearWins: () => void
}

/**
 * 전체 결과표.
 *
 * 한 줄을 누르면 그 사람의 경로만 원기둥에서 다시 재생된다. 아직 공개되지 않은
 * 사람은 결과 대신 '?'가 뜨고, 눌러서 직접 타야 열린다.
 */
function ResultBoardImpl({
  people,
  plan,
  revealedPeople,
  probabilities,
  wins,
  activeIndex,
  disabled,
  onSelect,
  onClearWins,
}: ResultBoardProps) {
  if (!plan) return null

  const hasHistory = Object.values(wins).some((times) => times > 0)

  return (
    <Panel>
      <header className="mb-3 flex items-center gap-1.5">
        <Trophy className="size-4 text-amber-500" aria-hidden />
        <h2 className="text-sm font-semibold text-neutral-100">결과</h2>
        <span className="text-xs text-neutral-400">이름을 누르면 그 줄만 탑니다</span>
      </header>

      <ul className="flex flex-col gap-1">
        {people.map((person, index) => {
          const isWin = plan.prizeSlots[plan.traces[index].end]
          const open = revealedPeople.has(index)
          const isActive = activeIndex === index
          const times = wins[person.name] ?? 0

          return (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                disabled={disabled}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl border px-2 py-2 text-left transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  isActive
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-transparent bg-neutral-800/60 hover:bg-neutral-800',
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: personColor(index) }}
                />

                <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100">
                  {person.name}
                  {times > 0 && (
                    <span
                      className="ml-1.5 text-xs text-amber-500/80"
                      title={`지금까지 ${times}번 당첨`}
                    >
                      ★{times}
                    </span>
                  )}
                </span>

                <span
                  className="shrink-0 text-xs text-neutral-400 tabular-nums"
                  title="이번 판에서 당첨될 확률"
                >
                  {formatPercent(probabilities[index] ?? 0)}
                </span>

                <span
                  className={cn(
                    'w-11 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-bold',
                    !open && 'bg-neutral-700 text-neutral-400',
                    open && isWin && 'bg-amber-500 text-neutral-950',
                    open && !isWin && 'bg-neutral-700 text-neutral-400',
                  )}
                >
                  {open ? (isWin ? '당첨' : '꽝') : '?'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {hasHistory && (
        <div className="mt-3 border-t border-neutral-800 pt-3">
          <p className="mb-2 text-xs leading-relaxed text-neutral-400">
            ★는 지금까지의 당첨 횟수입니다. 당첨될수록 다음 판에서 뽑힐 확률이 낮아지고,
            이 기록은 공유 링크에 함께 담깁니다.
          </p>
          <Button variant="ghost" onClick={onClearWins} className="w-full text-xs">
            <History className="size-3.5" aria-hidden />
            당첨 기록 초기화
          </Button>
        </div>
      )}
    </Panel>
  )
}

export const ResultBoard = memo(ResultBoardImpl)
