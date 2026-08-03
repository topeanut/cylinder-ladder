import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Controls } from './components/Controls'
import { PeopleEditor } from './components/PeopleEditor'
import { ResultBoard } from './components/ResultBoard'
import { Sidebar } from './components/Sidebar'
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
   * 공유 링크로 막 들어온 경우에는 애니메이션 없이 최종 상태를 보여 준다.
   * 한 번이라도 직접 재생하면(playToken > 0) 그 뒤로는 애니메이션을 쓴다.
   */
  const arrivedRevealed = useRef(app.revealed)

  const phase: Phase = running
    ? 'running'
    : app.seed === null
      ? 'edit'
      : app.revealed
        ? 'done'
        : 'ready'

  const instant = arrivedRevealed.current && playToken === 0

  /* ── 재생 시간 ────────────────────────────────────────────── */

  // 3D 씬과 같은 계산을 써야 소리·색종이가 그림과 어긋나지 않는다.
  const playDurationMs = useMemo(() => {
    if (!app.plan) return 0
    const geo = computeGeometry(app.people.length, app.plan.ladder.rows)
    const lanes = buildLanes(app.plan, geo)
    return totalPlayMs(
      activeIndex === null ? lanes : lanes.filter((l) => l.personIndex === activeIndex),
    )
  }, [activeIndex, app.people.length, app.plan])

  /* ── 가로선이 꽂히는 소리 ─────────────────────────────────── */

  useEffect(() => {
    if (!app.plan || instant) return

    const timers = app.plan.ladder.rungs.flatMap((gaps, row) =>
      gaps.map((_, orderInRow) =>
        window.setTimeout(
          () => playClack((((row * 7 + orderInRow * 3) % 10) / 10)),
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
    // 개별 재생일 때는 이미 공개된 상태이므로 축하 연출을 반복하지 않는다.
    if (activeIndex !== null) return
    app.reveal()
    playWin()
    fireConfetti()
  }, [activeIndex, app, fireConfetti, playWin])

  const handleReset = useCallback(() => {
    setActiveIndex(null)
    setPlayToken(0)
    arrivedRevealed.current = false
    app.resetLadder()
  }, [app])

  /** 결과가 공개된 뒤 한 사람의 경로만 다시 타 본다. */
  const handleSelectPerson = useCallback(
    (index: number) => {
      if (!app.revealed || running) return
      const next = activeIndex === index ? null : index
      setActiveIndex(next)
      setPlayToken((token) => token + 1)
      arrivedRevealed.current = false
      if (next !== null) setRunning(true)
    },
    [activeIndex, app.revealed, running],
  )

  const shareUrl = useMemo(
    () =>
      buildShareUrl({
        people: app.people,
        winCount: app.winCount,
        seed: app.seed,
        revealed: true,
      }),
    [app.people, app.winCount, app.seed],
  )

  return (
    <div className="flex min-h-svh flex-col bg-neutral-100 text-neutral-900 min-[900px]:h-svh min-[900px]:flex-row min-[900px]:overflow-hidden dark:bg-neutral-950 dark:text-neutral-50">
      <Sidebar muted={muted} onToggleMuted={toggleMuted}>
        <Controls
          phase={phase}
          peopleCount={app.people.length}
          winCount={app.winCount}
          shareUrl={shareUrl}
          onWinCountChange={app.setWinCount}
          onRoll={handleRoll}
          onPlay={handlePlay}
          onReset={handleReset}
        />

        {app.revealed && (
          <ResultBoard
            people={app.people}
            plan={app.plan}
            activeIndex={activeIndex}
            onSelect={handleSelectPerson}
          />
        )}

        <PeopleEditor
          people={app.people}
          winnerIds={app.revealed ? app.winnerIds : new Set<string>()}
          disabled={running}
          onAdd={app.addPeople}
          onRename={app.renamePerson}
          onRemove={app.removePerson}
          onReorder={app.reorderPeople}
          onClear={app.clearPeople}
        />
      </Sidebar>

      <main className="relative min-h-[60svh] flex-1 min-[900px]:h-svh">
        {app.people.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            왼쪽에서 이름을 2명 이상 추가하면
            <br />
            원기둥 사다리가 세워집니다.
          </p>
        ) : (
          <LadderScene
            running={running}
            playDurationMs={playDurationMs}
            onPlayEnd={handlePlayEnd}
            people={app.people}
            plan={app.plan}
            revealed={app.revealed}
            buildToken={app.seed ?? 0}
            playToken={playToken}
            activeIndex={activeIndex}
            instant={instant}
            onSelectPerson={handleSelectPerson}
          />
        )}

        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
          {phase === 'edit'
            ? '왼쪽에서 사다리를 만들어 보세요'
            : '끌어서 돌리고, 휠로 확대·축소할 수 있습니다'}
        </p>
      </main>
    </div>
  )
}
