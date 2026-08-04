import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppState, Difficulty } from '../lib/types'
import { buildQuery, parseQuery } from '../lib/query'
import { loadState, saveState } from '../lib/storage'
import { createSeed, planLadder } from '../lib/ladder'
import { weightFor, winProbabilities } from '../lib/probability'
import { appendPeople, clamp, moveItem, normalizeName, parseNames } from '../lib/utils'

const EMPTY: AppState = {
  people: [],
  winCount: 1,
  difficulty: 'normal',
  seed: null,
  wins: {},
  revealed: false,
}

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
   * (줄 개수나 당첨 배정이 달라지면 경로도 결과도 의미를 잃는다)
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
      const target = prev.people.find((p) => p.id === id)
      if (!target || target.name === name) return prev
      if (prev.people.some((p) => p.id !== id && p.name === name)) return prev

      // 당첨 이력은 이름으로 매기므로 같이 옮겨 줘야 가중치가 유지된다.
      const wins = { ...prev.wins }
      if (wins[target.name] !== undefined) {
        wins[name] = (wins[name] ?? 0) + wins[target.name]
        delete wins[target.name]
      }

      return {
        ...prev,
        wins,
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

  /** 난이도를 바꾸면 가로선 밀도가 달라지므로 기존 사다리는 무효다. */
  const setDifficulty = useCallback(
    (difficulty: Difficulty) => {
      setState((prev) => (prev.difficulty === difficulty ? prev : invalidate({ ...prev, difficulty })))
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

  /** 이번 판의 당첨자를 이력에 남긴다. 다음 판부터 그만큼 덜 뽑힌다. */
  const recordWins = useCallback((names: string[]) => {
    if (names.length === 0) return
    setState((prev) => {
      const wins = { ...prev.wins }
      for (const name of names) wins[name] = (wins[name] ?? 0) + 1
      return { ...prev, wins }
    })
  }, [])

  /** 당첨 횟수를 손으로 고친다. 0이면 기록에서 아예 지운다. */
  const setWinsFor = useCallback((name: string, times: number) => {
    setState((prev) => {
      const next = clamp(Math.floor(times), 0, 99)
      if ((prev.wins[name] ?? 0) === next) return prev

      const wins = { ...prev.wins }
      if (next === 0) delete wins[name]
      else wins[name] = next

      // 가중치가 바뀌면 당첨 배정도 달라지므로 기존 사다리는 무효다.
      return invalidate({ ...prev, wins })
    })
  }, [invalidate])

  const clearWins = useCallback(() => {
    setState((prev) => invalidate({ ...prev, wins: {} }))
  }, [invalidate])

  /* ── 파생 값 ──────────────────────────────────────────────── */

  /** 당첨 이력이 많을수록 낮아지는 가중치. 명단 순서와 같은 배열이다. */
  const weights = useMemo(
    () => state.people.map((person) => weightFor(state.wins[person.name] ?? 0)),
    [state.people, state.wins],
  )

  /** 화면에 표시할 사람별 당첨 확률(0~1). */
  const probabilities = useMemo(
    () => winProbabilities(weights, state.winCount),
    [weights, state.winCount],
  )

  const plan = useMemo(() => {
    if (state.seed === null || state.people.length === 0) return null
    return planLadder(
      state.people.length,
      state.winCount,
      state.seed,
      weights,
      state.difficulty,
    )
  }, [state.people.length, state.winCount, state.seed, weights, state.difficulty])

  const winnerIds = useMemo(() => {
    if (!plan) return new Set<string>()
    return new Set(plan.winners.map((index) => state.people[index]?.id).filter(Boolean))
  }, [plan, state.people])

  return {
    ...state,
    plan,
    weights,
    probabilities,
    winnerIds,
    addPeople,
    renamePerson,
    removePerson,
    reorderPeople,
    clearPeople,
    setWinCount,
    setDifficulty,
    rollLadder,
    reveal,
    resetLadder,
    recordWins,
    setWinsFor,
    clearWins,
  }
}

export type UseAppState = ReturnType<typeof useAppState>
