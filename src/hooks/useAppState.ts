import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppState } from '../lib/types'
import { buildQuery, parseQuery } from '../lib/query'
import { loadState, saveState } from '../lib/storage'
import { createSeed, planLadder } from '../lib/ladder'
import { appendPeople, clamp, moveItem, normalizeName, parseNames } from '../lib/utils'

const EMPTY: AppState = { people: [], winCount: 1, seed: null, revealed: false }

/**
 * 초기 상태의 출처 우선순위:
 *   1. URL QueryString — 공유 링크로 받은 상태가 항상 이긴다
 *   2. localStorage    — 내가 마지막으로 보던 상태
 *   3. 빈 상태
 */
function initState(): AppState {
  return parseQuery(window.location.search) ?? loadState() ?? EMPTY
}

export function useAppState() {
  const [state, setState] = useState<AppState>(initState)

  useEffect(() => {
    saveState(state)
    // pushState가 아니라 replaceState라서 뒤로가기 기록이 더럽혀지지 않는다.
    window.history.replaceState(null, '', `${window.location.pathname}${buildQuery(state)}`)
  }, [state])

  /**
   * 명단이나 당첨 수가 바뀌면 기존 사다리는 무효다.
   * (줄 개수가 달라지면 경로도 결과도 의미를 잃는다)
   */
  const invalidate = useCallback(
    (next: AppState): AppState => ({ ...next, seed: null, revealed: false }),
    [],
  )

  /* ── 명단 관리 ────────────────────────────────────────────── */

  const addPeople = useCallback(
    (raw: string) => {
      const names = parseNames(raw)
      if (names.length === 0) return
      setState((prev) => {
        const people = appendPeople(prev.people, names)
        if (people === prev.people) return prev
        return invalidate({ ...prev, people })
      })
    },
    [invalidate],
  )

  const renamePerson = useCallback((id: string, raw: string) => {
    const name = normalizeName(raw)
    setState((prev) => {
      // 빈 이름이거나 다른 사람이 이미 쓰는 이름이면 되돌린다.
      if (!name) return prev
      if (prev.people.some((p) => p.id !== id && p.name === name)) return prev
      // 이름만 바뀌는 것은 줄 개수를 건드리지 않으므로 사다리를 지우지 않는다.
      return {
        ...prev,
        people: prev.people.map((p) => (p.id === id ? { ...p, name } : p)),
      }
    })
  }, [])

  const removePerson = useCallback(
    (id: string) => {
      setState((prev) =>
        invalidate({ ...prev, people: prev.people.filter((p) => p.id !== id) }),
      )
    },
    [invalidate],
  )

  const reorderPeople = useCallback(
    (from: number, to: number) => {
      setState((prev) => invalidate({ ...prev, people: moveItem(prev.people, from, to) }))
    },
    [invalidate],
  )

  const clearPeople = useCallback(() => {
    setState((prev) => invalidate({ ...prev, people: [] }))
  }, [invalidate])

  /* ── 사다리 ───────────────────────────────────────────────── */

  const setWinCount = useCallback(
    (winCount: number) => {
      setState((prev) =>
        invalidate({ ...prev, winCount: clamp(winCount, 0, prev.people.length) }),
      )
    },
    [invalidate],
  )

  /** 새 시드를 뽑아 사다리를 다시 짠다. 결과는 아직 감춘 상태. */
  const rollLadder = useCallback(() => {
    setState((prev) => ({ ...prev, seed: createSeed(), revealed: false }))
  }, [])

  const reveal = useCallback(() => {
    setState((prev) => (prev.seed === null ? prev : { ...prev, revealed: true }))
  }, [])

  const resetLadder = useCallback(() => {
    setState((prev) => ({ ...prev, seed: null, revealed: false }))
  }, [])

  /* ── 파생 값 ──────────────────────────────────────────────── */

  // 시드가 같으면 계산 결과도 같으므로 people 길이·당첨 수·시드에만 의존한다.
  const plan = useMemo(() => {
    if (state.seed === null || state.people.length === 0) return null
    return planLadder(state.people.length, state.winCount, state.seed)
  }, [state.people.length, state.winCount, state.seed])

  const winnerIds = useMemo(() => {
    if (!plan) return new Set<string>()
    const ids = state.people
      .filter((_, i) => plan.prizeSlots[plan.traces[i].end])
      .map((p) => p.id)
    return new Set(ids)
  }, [plan, state.people])

  return {
    ...state,
    plan,
    winnerIds,
    addPeople,
    renamePerson,
    removePerson,
    reorderPeople,
    clearPeople,
    setWinCount,
    rollLadder,
    reveal,
    resetLadder,
  }
}

export type UseAppState = ReturnType<typeof useAppState>
