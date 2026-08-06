/**
 * 재생 시계.
 *
 * 트레일·카메라·종료 판정이 각자 프레임 델타를 쌓으면, 배속을 넣을 때 세 군데를
 * 따로 고쳐야 하고 타임라인을 되돌리면 셋이 어긋난다. 시계 하나를 두고 모두가
 * 읽게 하면 배속은 곱하기 한 번, 되감기는 대입 한 번으로 끝난다.
 *
 * React state가 아니라 ref로 들고 다닌다. 매 프레임 바뀌는 값이라 state로 두면
 * 초당 60번 리렌더가 일어난다.
 */
export interface PlayClock {
  /** 재생 시작부터 흐른 시간(ms). 배속이 반영된 값이다. */
  elapsed: number
  /** 이번 재생의 총 길이(ms). */
  total: number
  /** 배속. 1이 기본. */
  speed: number
  /** 사용자가 타임라인을 잡고 있는 동안은 시계가 저절로 흐르지 않는다. */
  scrubbing: boolean
}

export function createPlayClock(): PlayClock {
  return { elapsed: 0, total: 0, speed: 1, scrubbing: false }
}

/** 고를 수 있는 배속. */
export const SPEEDS = [0.5, 1, 2] as const

export type Speed = (typeof SPEEDS)[number]
