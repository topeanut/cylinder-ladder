/** 사다리 한 줄의 주인. `name`은 명단 안에서 유일하다. */
export interface Person {
  id: string
  name: string
}

/**
 * 가로선 한 개.
 *
 * `edge`는 원통 겉면을 따라 이웃한 두 줄을 잇는다. gap g는 rail g와 rail g+1을
 * 잇고, 원통이므로 마지막 gap은 마지막 rail과 첫 rail을 잇는다.
 *
 * `through`는 원통 **속을 관통해** 마주보는 쪽 줄로 건너뛴다. 평면 사다리에는
 * 존재할 수 없는 선이고, 경로를 눈으로 추적하기 훨씬 어렵게 만든다.
 */
export type Rung =
  | { kind: 'edge'; gap: number }
  | { kind: 'through'; from: number; to: number }

export interface Ladder {
  count: number
  rows: number
  /** rungs[row] = 그 행에 놓인 가로선들. 한 행에서 같은 줄을 두 번 건드리지 않는다. */
  rungs: Rung[][]
}

/**
 * 사다리를 타고 내려간 경로를 화면에 그리기 위한 조각.
 *
 * 가로선이 이웃이든 관통이든 "어느 줄에서 어느 줄로 건너갔다"는 사실만 남기면
 * 그리는 쪽은 둘을 구분할 필요가 없다. 어차피 두 점을 잇는 직선이다.
 */
export type PathSegment =
  | { kind: 'rail'; rail: number; fromRow: number; toRow: number }
  | { kind: 'cross'; row: number; from: number; to: number }

export interface Trace {
  start: number
  end: number
  segments: PathSegment[]
}

export type Phase = 'edit' | 'ready' | 'running' | 'done'

/**
 * 난이도.
 *
 * 가로선 밀도와 관통선 빈도를 바꾸고, 씬의 세계관까지 함께 바꾼다.
 * 눈으로 경로를 따라갈 수 있는지가 실제로 달라진다.
 */
export type Difficulty = 'easy' | 'normal' | 'hell'

export interface AppState {
  people: Person[]
  /** 당첨 인원 수. 나머지는 전부 '꽝'이 된다. */
  winCount: number
  difficulty: Difficulty
  /** 사다리를 결정하는 난수 시드. null이면 아직 사다리가 없다. */
  seed: number | null
  /**
   * 지금까지의 당첨 횟수(이름 → 횟수).
   * 많이 당첨된 사람일수록 다음 판에서 뽑힐 가중치가 낮아진다.
   */
  wins: Record<string, number>
  /** 결과가 공개된 상태인지. 봉인 링크는 이 값을 false로 담는다. */
  revealed: boolean
}
