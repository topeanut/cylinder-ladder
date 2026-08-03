/** 사다리 한 줄의 주인. `name`은 명단 안에서 유일하다. */
export interface Person {
  id: string
  name: string
}

/**
 * 원기둥 사다리의 구조.
 *
 * 세로줄(rail)이 원통 둘레에 count개 서 있고, 이웃한 두 세로줄 사이의 틈(gap)에
 * 가로선(rung)이 놓인다. gap g는 rail g와 rail g+1을 잇는다. 원통이므로 마지막
 * gap은 마지막 rail과 첫 rail을 잇는다 — 평면 사다리에는 없는 순환 구조다.
 */
export interface Ladder {
  count: number
  rows: number
  /** rungs[row] = 그 행에 놓인 gap 번호들. 같은 행에서 서로 이웃하지 않는다. */
  rungs: number[][]
}

/** 사다리를 타고 내려간 경로를 화면에 그리기 위한 조각. */
export type PathSegment =
  | { kind: 'rail'; rail: number; fromRow: number; toRow: number }
  | { kind: 'rung'; row: number; gap: number; direction: 1 | -1 }

export interface Trace {
  start: number
  end: number
  segments: PathSegment[]
}

export type Phase = 'edit' | 'ready' | 'running' | 'done'

export interface AppState {
  people: Person[]
  /** 당첨 인원 수. 나머지는 전부 '꽝'이 된다. */
  winCount: number
  /** 사다리를 결정하는 난수 시드. null이면 아직 사다리가 없다. */
  seed: number | null
  /** 결과가 공개된 상태인지. 공유 링크는 이 값을 true로 담는다. */
  revealed: boolean
}

export type Theme = 'light' | 'dark'
