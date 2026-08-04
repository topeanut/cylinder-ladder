import { useEffect, useState } from 'react'
import { PartyPopper, X } from 'lucide-react'
import { cn } from '../lib/utils'

interface WinnerBannerProps {
  /** 이번 판 당첨자 이름들. 비어 있으면 아무것도 뜨지 않는다. */
  winners: string[]
  /** 값이 바뀔 때마다 배너를 다시 띄운다. */
  token: number
}

/** 저절로 사라지기까지의 시간(ms). 사진 찍을 여유는 주되 화면을 오래 막지 않는다. */
const AUTO_HIDE_MS = 6000

/**
 * 재생이 끝난 직후 당첨자를 크게 알리는 배너.
 *
 * 결과표만 갱신하면 "다 내려갔다"는 사실은 알아도 "누가 걸렸다"는 순간이 없다.
 * 회식 자리에서 화면을 돌려 보여줄 대상이 필요하다.
 */
export function WinnerBanner({ winners, token }: WinnerBannerProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (token === 0 || winners.length === 0) return

    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS)
    return () => window.clearTimeout(timer)
  }, [token, winners.length])

  if (!visible || winners.length === 0) return null

  return (
    <div
      role="status"
      className={cn(
        'animate-pop-in pointer-events-none absolute inset-x-4 top-6 z-10 flex justify-center',
        'min-[900px]:top-10',
      )}
    >
      <div className="pointer-events-auto relative max-w-[min(30rem,100%)] rounded-2xl bg-amber-400 px-6 py-4 text-center shadow-[0_10px_60px_rgba(251,191,36,0.45)]">
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="닫기"
          className="absolute top-2 right-2 rounded-lg p-1 text-amber-950/60 transition-colors hover:bg-amber-950/10 hover:text-amber-950"
        >
          <X className="size-4" aria-hidden />
        </button>

        <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-amber-950/70">
          <PartyPopper className="size-3.5" aria-hidden />
          당첨 {winners.length}명
        </p>

        <p className="mt-1 text-2xl leading-tight font-black break-keep text-neutral-950 sm:text-3xl">
          {winners.join(' · ')}
        </p>
      </div>
    </div>
  )
}
