import { Sigma } from 'lucide-react'
import { Panel } from './ui'
import type { ReactNode } from 'react'

/**
 * 이 앱이 쓰는 수학을 설명하는 접이식 패널.
 *
 * 사다리타기는 "그냥 랜덤"처럼 보이지만 실제로는 순열, 전단사, 시드 난수,
 * 비복원 가중추출이 맞물려 있다. 특히 확률을 조작했다는 오해를 사기 쉬운 기능이
 * 들어 있으므로, 무엇을 어떻게 하는지 숨기지 않고 적어 둔다.
 */

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-neutral-800 pt-3 first:border-0 first:pt-0">
      <h3 className="mb-1 text-xs font-bold text-neutral-200">{title}</h3>
      <p className="text-xs leading-relaxed text-neutral-400">{children}</p>
    </section>
  )
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-neutral-800/80 px-1 py-0.5 text-[11px] text-amber-300">
      {children}
    </code>
  )
}

export function MathNotes() {
  return (
    <Panel>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-neutral-100 marker:content-['']">
          <Sigma className="size-4 text-amber-500" aria-hidden />
          이 사다리의 수학
          <span className="ml-auto text-xs font-normal text-neutral-500 group-open:hidden">
            펼치기
          </span>
          <span className="ml-auto hidden text-xs font-normal text-neutral-500 group-open:inline">
            접기
          </span>
        </summary>

        <div className="mt-3 flex flex-col gap-3">
          <Note title="왜 아무도 겹치지 않는가">
            한 행에 놓인 가로선들은 서로 다른 세로줄만 건드립니다. 그래서 각 행은 서로소인
            자리바꿈들의 곱이 되고, 이런 자리바꿈을 아무리 쌓아도 결과는 항상{' '}
            <strong className="text-neutral-300">순열</strong>입니다. 두 사람이 같은 칸에
            도착하거나 아무도 안 가는 칸이 생기는 일은 구조적으로 불가능합니다.
          </Note>

          <Note title="원기둥이라서 달라지는 것">
            평면 사다리에서는 양 끝 사람이 한쪽으로만 움직일 수 있습니다. 원기둥에서는 마지막
            줄과 첫 줄도 이웃이라 모두가 양방향으로 움직입니다. 여기에 원통 속을 가로지르는{' '}
            <strong className="text-neutral-300">관통 가로선</strong>까지 더해집니다. 자리바꿈의
            종류가 늘어난 것뿐이라 순열이라는 성질은 그대로입니다.
          </Note>

          <Note title="거꾸로도 탈 수 있는 이유">
            결과가 순열이라는 말은 <strong className="text-neutral-300">역함수가 존재한다</strong>는
            뜻이기도 합니다. 그래서 어느 결과 칸이든 거기 도착하는 사람이 정확히 한 명이고, 아래
            결과 칸을 누르면 그 사람의 경로를 거슬러 올라가 주인을 찾아냅니다. 새로 계산하는 게
            아니라 같은 경로를 뒤에서부터 그리는 것뿐입니다.
          </Note>

          <Note title="난이도가 바꾸는 것">
            <Formula>쉬움</Formula>은 관통 가로선이 아예 없어 평면 사다리처럼 읽힙니다.{' '}
            <Formula>지옥</Formula>은 한 행에 관통선이 둘까지 놓이고 행 수도 늘어납니다. 8명
            기준으로 쉬움은 가로선 20개에 관통 0개, 지옥은 47개에 관통 28개까지 갑니다. 규칙은
            그대로라 결과는 여전히 순열입니다 — 눈으로 따라갈 수 있는지만 달라집니다.
          </Note>

          <Note title="링크 하나에 사다리가 통째로 들어가는 법">
            사다리 구조를 URL에 담지 않습니다. 대신 32비트 시드 하나만 담고, 그 시드로{' '}
            <Formula>mulberry32</Formula> 난수 생성기를 돌립니다. 같은 시드 → 같은 난수열 →
            가로선 배치와 당첨 배정까지 완전히 동일. 가로선을 고르는 순서는{' '}
            <Formula>Fisher–Yates</Formula> 셔플로 섞습니다.
          </Note>

          <Note title="확률을 조절해도 경로는 진짜입니다">
            사다리 자체를 편향시키면 경로가 거짓말이 됩니다. 눈으로 따라간 사람이 &ldquo;저기로
            갔는데?&rdquo; 하게 되죠. 그래서 순서를 이렇게 둡니다 — ① 사다리를 정직하게 랜덤으로
            짠다 ② 각자 도착할 칸을 계산한다 ③{' '}
            <strong className="text-neutral-300">사람 단위로 가중추첨</strong>해 당첨자를 정한다 ④
            그 사람이 도착하는 칸에 &lsquo;당첨&rsquo;을 놓는다. 모든 경로는 실제 경로이고, 확률만
            정확히 제어됩니다.
          </Note>

          <Note title="★ 하나에 가중치가 얼마나 떨어지나">
            당첨 횟수 <Formula>n</Formula>인 사람의 가중치는 <Formula>0.45ⁿ</Formula>입니다. 한 번
            당첨되면 45%, 두 번이면 20%로 줄어듭니다. 뽑을 때는 남은 사람들의 가중치에 비례해
            고르고, 뽑힌 사람을 빼고 다시 고르는 <strong className="text-neutral-300">비복원
            가중추출</strong>입니다.
          </Note>

          <Note title="화면의 확률은 어떻게 구했나">
            당첨자가 한 명이면 <Formula>wᵢ / Σw</Formula>로 끝입니다. 하지만 두 명 이상을 비복원으로
            뽑으면 닫힌 식이 없습니다. 먼저 뽑힌 사람이 빠지면서 남은 사람들의 확률이 매번 달라지고,
            정확히 계산하려면 사람 수에 지수적으로 비례하는 경우의 수를 훑어야 하기 때문입니다.
            그래서 <strong className="text-neutral-300">실제 추첨 함수를 고정 시드로 2만 번</strong>{' '}
            돌려 뽑힌 비율을 셉니다. 표시된 확률의 합은 언제나 당첨 인원 수 × 100%가 됩니다.
          </Note>

          <Note title="원기둥의 치수">
            세로줄이 <Formula>N</Formula>개면 사이 각도는 <Formula>2π/N</Formula>이고, 이웃한 두
            줄을 잇는 가로선의 길이는 <Formula>2R·sin(π/N)</Formula>, 그 중점까지의 거리는{' '}
            <Formula>R·cos(π/N)</Formula>입니다. 반지름 <Formula>R</Formula>은 사람이 몇 명이든
            줄 간격이 일정해 보이도록 역산합니다.
          </Note>

          <Note title="경로가 그려지며 내려가는 원리">
            튜브 지오메트리의 <Formula>uv.x</Formula>는 튜브 길이를 따라 0에서 1로 흐릅니다. 셰이더가
            이 값을 진행률과 비교해 아직 지나지 않은 구간을 버리고, 머리 쪽만 희게 태웁니다. 매
            프레임 도형을 다시 만들지 않으므로 사람이 많아도 부드럽습니다.
          </Note>
        </div>
      </details>
    </Panel>
  )
}
