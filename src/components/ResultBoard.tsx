import { memo } from 'react'
import { Trophy } from 'lucide-react'
import type { LadderPlan } from '../lib/ladder'
import type { Person } from '../lib/types'
import { personColor } from '../lib/geometry'
import { Panel } from './ui'
import { cn } from '../lib/utils'

interface ResultBoardProps {
  people: Person[]
  plan: LadderPlan | null
  activeIndex: number | null
  onSelect: (index: number) => void
}

/**
 * 전체 결과표.
 *
 * 한 줄을 누르면 그 사람의 경로만 원기둥에서 다시 재생된다. 표는 결과를 빠르게
 * 훑는 용도이고, 확인은 사다리에서 하도록 유도한다.
 */
function ResultBoardImpl({ people, plan, activeIndex, onSelect }: ResultBoardProps) {
  if (!plan) return null

  return (
    <Panel>
      <header className="mb-3 flex items-center gap-1.5">
        <Trophy className="size-4 text-amber-500" aria-hidden />
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          전체 결과
        </h2>
        <span className="text-xs text-neutral-400">이름을 누르면 그 줄만 다시 탑니다</span>
      </header>

      <ul className="flex flex-col gap-1">
        {people.map((person, index) => {
          const isWin = plan.prizeSlots[plan.traces[index].end]
          const isActive = activeIndex === index

          return (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl border px-2 py-2 text-left transition-colors',
                  isActive
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-transparent bg-neutral-100 hover:bg-neutral-200/70 dark:bg-neutral-800/60 dark:hover:bg-neutral-800',
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: personColor(index) }}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                  {person.name}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold',
                    isWin
                      ? 'bg-amber-500 text-neutral-950'
                      : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
                  )}
                >
                  {isWin ? '당첨' : '꽝'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

export const ResultBoard = memo(ResultBoardImpl)
