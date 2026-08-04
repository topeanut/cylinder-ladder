import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Controls } from './components/Controls'
import { MathNotes } from './components/MathNotes'
import { MobileBar } from './components/MobileBar'
import { PeopleEditor } from './components/PeopleEditor'
import { ResultBoard } from './components/ResultBoard'
import { Sidebar } from './components/Sidebar'
import { WinnerBanner } from './components/WinnerBanner'
import { useAppState } from './hooks/useAppState'
import { useConfetti } from './hooks/useConfetti'
import { useSound } from './hooks/useSound'
import { computeGeometry, rungDelayMs } from './lib/geometry'
import { buildShareUrl } from './lib/query'
import { buildLanes, totalPlayMs } from './lib/trail'
import type { Phase } from './lib/types'
import { LadderScene } from './three/LadderScene'

export default function App() {
  const app = useAppState()
  const { muted, toggleMuted, playClack, playWin, startBgm, stopBgm } = useSound()
  const fireConfetti = useConfetti()

  const [running, setRunning] = useState(false)
  const [playToken, setPlayToken] = useState(0)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  /**
   * 이번 화면에서 결과가 공개된 사람들(명단 순번).
   *
   * URL에 담지 않는다. 봉인 링크를 받은 사람이 "내가 어디까지 열어 봤는지"는
   * 각자의 화면 사정이지, 공유해야 할 상태가 아니기 때문이다.
   */
  const [revealedPeople, setRevealedPeople] = useState<Set<number>>(new Set())
  /** 모바일 바텀시트. 데스크톱에서는 늘 보이므로 이 값을 쓰지 않는다. */
  const [sheetOpen, setSheetOpen] = useState(false)
  /** 첫 프레임을 그릴 준비가 됐는지. 그 전까지는 로딩 표시를 덮어 둔다. */
  const [sceneReady, setSceneReady] = useState(false)
  /** 당첨 배너를 다시 띄우는 토큰. */
  const [bannerToken, setBannerToken] = useState(0)

  /**
   * 공유 링크로 막 들어온 경우에는 애니메이션 없이 최종 상태를 보여 준다.
   * 한 번이라도 직접 재생하면(playToken > 0) 그 뒤로는 애니메이션을 쓴다.
   */
  const arrivedRevealed = useRef(app.revealed)
  const instant = arrivedRevealed.current && playToken === 0

  const phase: Phase = running
    ? 'running'
    : app.seed === null
      ? 'edit'
      : app.revealed
        ? 'done'
        : 'ready'

  /* ── 3D에 넘길 계산 ───────────────────────────────────────── */

  const geo = useMemo(
    () => computeGeometry(app.people.length, app.plan?.ladder.rows ?? 0),
    [app.people.length, app.plan],
  )

  const lanes = useMemo(() => (app.plan ? buildLanes(app.plan, geo) : []), [app.plan, geo])

  const playDurationMs = useMemo(
    () =>
      totalPlayMs(
        activeIndex === null ? lanes : lanes.filter((l) => l.personIndex === activeIndex),
      ),
    [activeIndex, lanes],
  )

  /** 결과가 공개된 사람들. 전체 공개 상태면 전원이다. */
  const revealedAll = useMemo(
    () =>
      app.revealed
        ? new Set(app.people.map((_, index) => index))
        : revealedPeople,
    [app.revealed, app.people, revealedPeople],
  )

  // WebGL을 못 쓰는 기기에서는 onCreated가 끝내 오지 않는다. 그런 화면을 영원히
  // 스피너로 덮어 두면 안 되므로, 일정 시간이 지나면 그냥 걷어낸다.
  useEffect(() => {
    if (sceneReady) return
    const timer = window.setTimeout(() => setSceneReady(true), 4000)
    return () => window.clearTimeout(timer)
  }, [sceneReady])

  /* ── 가로선이 꽂히는 소리 ─────────────────────────────────── */

  useEffect(() => {
    if (!app.plan || instant) return

    const timers = app.plan.ladder.rungs.flatMap((rungs, row) =>
      rungs.map((_, orderInRow) =>
        window.setTimeout(
          () => playClack(((row * 7 + orderInRow * 3) % 10) / 10),
          rungDelayMs(row, orderInRow) + 60,
        ),
      ),
    )
    return () => timers.forEach(window.clearTimeout)
    // 사다리가 새로 짜일 때(=시드가 바뀔 때)만 다시 울린다.
  }, [app.seed, app.plan, instant, playClack])

  /* ── 내려가는 동안의 BGM ──────────────────────────────────── */

  useEffect(() => {
    if (!running) return
    startBgm()
    return () => stopBgm()
  }, [running, startBgm, stopBgm])

  /* ── 동작 ─────────────────────────────────────────────────── */

  const handleRoll = useCallback(() => {
    arrivedRevealed.current = false
    setActiveIndex(null)
    setPlayToken(0)
    setRevealedPeople(new Set())
    app.rollLadder()
  }, [app])

  const handlePlay = useCallback(() => {
    if (running || !app.plan) return
    arrivedRevealed.current = false
    setActiveIndex(null)
    setPlayToken((token) => token + 1)
    setRunning(true)
  }, [app.plan, running])

  const handlePlayEnd = useCallback(() => {
    setRunning(false)
    if (!app.plan) return

    // 한 사람만 탄 경우: 그 사람의 결과만 열고, 당첨일 때만 축하한다.
    if (activeIndex !== null) {
      setRevealedPeople((prev) => new Set(prev).add(activeIndex))
      if (app.plan.prizeSlots[app.plan.traces[activeIndex].end]) {
        playWin()
        fireConfetti()
      }
      return
    }

    app.reveal()
    // 이번 판의 당첨자를 이력에 남긴다. 다음 판부터 그만큼 덜 뽑힌다.
    app.recordWins(app.plan.winners.map((index) => app.people[index]?.name).filter(Boolean))
    setBannerToken((token) => token + 1)
    playWin()
    fireConfetti()
  }, [activeIndex, app, fireConfetti, playWin])

  const handleReset = useCallback(() => {
    setActiveIndex(null)
    setPlayToken(0)
    setRevealedPeople(new Set())
    arrivedRevealed.current = false
    app.resetLadder()
  }, [app])

  /** 한 사람의 경로만 타 본다. 봉인 상태라면 이때 그 사람의 결과가 열린다. */
  const handleSelectPerson = useCallback(
    (index: number) => {
      if (app.seed === null || running) return

      const next = activeIndex === index ? null : index
      setActiveIndex(next)
      setPlayToken((token) => token + 1)
      arrivedRevealed.current = false
      if (next !== null) setRunning(true)
    },
    [activeIndex, app.seed, running],
  )

  // 공유에 실릴 값만 추려 둔다. app 객체 전체를 의존성에 걸면 매 렌더 새로 만들어진다.
  const shareable = useMemo(
    () => ({
      people: app.people,
      winCount: app.winCount,
      seed: app.seed,
      wins: app.wins,
      revealed: false,
    }),
    [app.people, app.winCount, app.seed, app.wins],
  )

  const shareUrl = useMemo(() => buildShareUrl(shareable, true), [shareable])
  const sealedUrl = useMemo(() => buildShareUrl(shareable, false), [shareable])

  /** 배너에 띄울 이름들. 결과가 공개된 뒤에만 의미가 있다. */
  const winnerNames = useMemo(
    () =>
      app.plan && app.revealed
        ? app.plan.winners.map((index) => app.people[index]?.name).filter(Boolean)
        : [],
    [app.plan, app.revealed, app.people],
  )

  return (
    // 모바일에서는 3D가 화면 전체를 차지하고 설정 시트가 그 위를 덮는다.
    // 데스크톱에서는 좌측 칼럼 + 오른쪽 3D의 두 칸 배치가 된다.
    <div className="relative h-svh overflow-hidden bg-neutral-950 text-neutral-50 min-[900px]:flex">
      <Sidebar
        muted={muted}
        open={sheetOpen}
        onToggleMuted={toggleMuted}
        onClose={() => setSheetOpen(false)}
      >
        <Controls
          phase={phase}
          peopleCount={app.people.length}
          winCount={app.winCount}
          shareUrl={shareUrl}
          sealedUrl={sealedUrl}
          onWinCountChange={app.setWinCount}
          onRoll={handleRoll}
          onPlay={handlePlay}
          onReset={handleReset}
        />

        <ResultBoard
          people={app.people}
          plan={app.plan}
          revealedPeople={revealedAll}
          probabilities={app.probabilities}
          wins={app.wins}
          activeIndex={activeIndex}
          disabled={running}
          onSelect={handleSelectPerson}
          onClearWins={app.clearWins}
        />

        <PeopleEditor
          people={app.people}
          winnerIds={app.revealed ? app.winnerIds : new Set<string>()}
          probabilities={app.probabilities}
          wins={app.wins}
          disabled={running}
          onAdd={app.addPeople}
          onRename={app.renamePerson}
          onRemove={app.removePerson}
          onReorder={app.reorderPeople}
          onClear={app.clearPeople}
          onWinsChange={app.setWinsFor}
        />

        <MathNotes />
      </Sidebar>

      <main className="absolute inset-0 min-[900px]:relative min-[900px]:h-svh min-[900px]:flex-1">
        <LadderScene
          running={running}
          playDurationMs={playDurationMs}
          onPlayEnd={handlePlayEnd}
          onReady={() => setSceneReady(true)}
          people={app.people}
          plan={app.plan}
          geo={geo}
          lanes={lanes}
          buildToken={app.seed ?? 0}
          playToken={playToken}
          activeIndex={activeIndex}
          instant={instant}
          onSelectPerson={handleSelectPerson}
        />

        {/* WebGL이 붙기 전의 검은 화면을 덮는다 */}
        {!sceneReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950">
            <span className="size-8 animate-spin rounded-full border-2 border-neutral-700 border-t-amber-500" />
          </div>
        )}

        <WinnerBanner winners={winnerNames} token={bannerToken} />

        {app.people.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-8 text-center text-sm leading-relaxed text-neutral-400">
            이름을 2명 이상 추가하면
            <br />
            여기에 원기둥 사다리가 세워집니다.
          </p>
        )}

        <p className="pointer-events-none absolute inset-x-0 bottom-24 text-center text-xs text-neutral-500 min-[900px]:bottom-3">
          {app.people.length === 0
            ? '아래 버튼으로 이름을 추가해 보세요'
            : '끌어서 돌리고, 휠·손가락 두 개로 확대·축소할 수 있습니다'}
        </p>
      </main>

      <MobileBar
        phase={phase}
        peopleCount={app.people.length}
        onRoll={handleRoll}
        onPlay={handlePlay}
        onOpenSettings={() => setSheetOpen(true)}
      />
    </div>
  )
}
