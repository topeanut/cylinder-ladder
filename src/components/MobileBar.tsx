import { memo } from 'react'
import { Play, Settings2, Shuffle } from 'lucide-react'
import type { Phase } from '../lib/types'
import { Button } from './ui'

interface MobileBarProps {
  phase: Phase
  peopleCount: number
  onRoll: () => void
  onPlay: () => void
  onOpenSettings: () => void
}

/**
 * 모바일 하단 액션 바.
 *
 * 시트를 열지 않고도 이번에 할 일 하나는 바로 누를 수 있어야 한다. 그래서 지금
 * 단계에서 가장 그럴듯한 동작 하나만 크게 두고, 나머지는 설정 버튼 뒤로 보낸다.
 * 데스크톱에는 좌측 칼럼이 늘 보이므로 이 바가 필요 없다.
 */
function MobileBarImpl({
  phase,
  peopleCount,
  onRoll,
  onPlay,
  onOpenSettings,
}: MobileBarProps) {
  const busy = phase === 'running'
  const canBuild = peopleCount >= 2 && !busy
  // 사다리가 없으면 만들기가, 있으면 타기가 다음 할 일이다.
  const primary = phase === 'edit' ? 'roll' : 'play'

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 flex gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] min-[900px]:hidden">
      <Button
        variant="primary"
        onClick={primary === 'roll' ? onRoll : onPlay}
        disabled={primary === 'roll' ? !canBuild : busy}
        className="h-14 flex-1 text-base font-bold shadow-xl"
      >
        {primary === 'roll' ? (
          <>
            <Shuffle className="size-5" aria-hidden />
            {peopleCount < 2 ? '이름을 2명 이상 추가하세요' : '랜덤 사다리 만들기'}
          </>
        ) : (
          <>
            <Play className="size-5" aria-hidden />
            {busy ? '내려가는 중...' : phase === 'done' ? '다시 타기' : '전원 사다리 타기'}
          </>
        )}
      </Button>

      <Button
        variant="outline"
        onClick={onOpenSettings}
        aria-label="설정 열기"
        className="h-14 w-14 shrink-0 bg-neutral-950/85 shadow-xl backdrop-blur"
      >
        <Settings2 className="size-5" aria-hidden />
      </Button>
    </div>
  )
}

export const MobileBar = memo(MobileBarImpl)
