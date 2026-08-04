import { describe, expect, it } from 'vitest'
import { appendPeople, clamp, mod, moveItem, normalizeName, parseNames } from './utils'

/**
 * 이름은 URL에서 사람을 식별하는 열쇠다. 중복이 생기거나 쉼표가 섞여 들어가면
 * 공유 링크의 복원이 어긋난다.
 */

describe('이름 정규화', () => {
  it('쉼표를 제거한다 — URL의 구분자이기 때문이다', () => {
    expect(normalizeName('김,철수')).toBe('김 철수')
  })

  it('앞뒤 공백을 없애고 사이 공백은 하나로 접는다', () => {
    expect(normalizeName('  김   철수  ')).toBe('김 철수')
  })

  it('빈 문자열과 공백만 있는 값은 빈 이름이 된다', () => {
    expect(normalizeName('   ')).toBe('')
  })
})

describe('여러 줄 붙여넣기', () => {
  it('줄바꿈마다 한 명씩 끊는다', () => {
    expect(parseNames('철수\n영희\r\n민수')).toEqual(['철수', '영희', '민수'])
  })

  it('빈 줄은 건너뛴다', () => {
    expect(parseNames('철수\n\n\n영희\n')).toEqual(['철수', '영희'])
  })
})

describe('명단에 추가', () => {
  it('중복 이름은 조용히 걸러진다', () => {
    const people = appendPeople([], ['철수', '영희', '철수'])
    expect(people.map((p) => p.name)).toEqual(['철수', '영희'])
  })

  it('이미 있는 사람은 다시 들어가지 않는다', () => {
    const first = appendPeople([], ['철수'])
    const second = appendPeople(first, ['철수', '영희'])
    expect(second.map((p) => p.name)).toEqual(['철수', '영희'])
  })

  it('추가할 사람이 없으면 원래 배열을 그대로 준다 — 불필요한 리렌더를 막는다', () => {
    const people = appendPeople([], ['철수'])
    expect(appendPeople(people, ['철수'])).toBe(people)
    expect(appendPeople(people, ['  '])).toBe(people)
  })

  it('모두 서로 다른 id를 가진다', () => {
    const people = appendPeople([], ['A', 'B', 'C', 'D'])
    expect(new Set(people.map((p) => p.id)).size).toBe(4)
  })
})

describe('순서 바꾸기', () => {
  it('앞에서 뒤로, 뒤에서 앞으로 모두 옮긴다', () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4])
    expect(moveItem([1, 2, 3, 4], 3, 1)).toEqual([1, 4, 2, 3])
  })

  it('제자리거나 범위를 벗어나면 원래 배열을 그대로 준다', () => {
    const items = [1, 2, 3]
    expect(moveItem(items, 1, 1)).toBe(items)
    expect(moveItem(items, -1, 2)).toBe(items)
  })
})

describe('수 유틸', () => {
  it('clamp는 범위 안으로 접는다', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-5, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
  })

  it('mod는 음수에서도 양수를 준다 — 원기둥 순환의 핵심이다', () => {
    expect(mod(-1, 8)).toBe(7)
    expect(mod(9, 8)).toBe(1)
    expect(mod(-9, 8)).toBe(7)
  })
})
