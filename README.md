# 전능 회식 메뉴 3D 원기둥형 스레드

원기둥을 감은 3D 사다리타기. 이름을 넣고 사다리를 만들면 가로선이 사방에서 날아와 꽂히고,
사다리를 타면 각자의 경로가 원기둥 표면을 따라 흘러내립니다. 결과는 링크 하나로 그대로 공유됩니다.

서버가 없습니다. 모든 상태는 URL과 localStorage에만 존재합니다.

```bash
npm install
npm run dev
```

## 무엇이 다른가

평면 사다리와 달리 세로줄이 원통 둘레에 배치되므로 **마지막 줄과 첫 줄도 이웃**입니다.
평면에서는 양 끝 사람이 한쪽으로만 이동할 수 있지만, 원기둥에서는 모두가 양쪽으로 움직일 수 있습니다.
그래도 결과는 여전히 완전한 1:1 대응(순열)이라 게임으로서 성립합니다.

## 상태 공유

URL이 곧 저장소입니다.

```
?people=철수,영희,민수&win=2&seed=1522677205&done=1
```

| 파라미터 | 뜻 |
| --- | --- |
| `people` | 명단. 쉼표로 구분하며 이름은 유일해야 합니다 |
| `win` | 당첨 인원 수. 나머지는 모두 꽝 |
| `seed` | 사다리를 결정하는 난수 시드 |
| `done` | `1`이면 결과가 공개된 상태로 열립니다 |

사다리 구조는 URL에 담기지 않습니다. **시드가 같으면 난수열이 같고, 난수열이 같으면
가로선 배치와 당첨 위치까지 완전히 같기 때문**입니다. 덕분에 인원이 몇 명이든 링크가 짧습니다.

URL에 파라미터가 있으면 URL이 이깁니다. 없으면 localStorage에서 마지막 상태를 복원합니다.

## 구조

```
src/
  lib/
    ladder.ts      시드 난수 · 사다리 생성 · 경로 추적
    geometry.ts    원기둥 치수 계산 (반지름, 현의 길이와 깊이)
    query.ts       QueryString ↔ 상태
    storage.ts     localStorage 접근
    utils.ts       이름 정규화, 배열 조작
  hooks/
    useAppState.ts 명단 · 당첨 수 · 시드, URL/localStorage 동기화
    useCylinder.ts 원기둥 회전 (드래그 · 관성 · 빌보딩)
    useSound.ts    Web Audio로 합성하는 효과음
    useConfetti.ts 당첨 연출
    useTheme.ts    다크 모드
  components/
    LadderCylinder.tsx  3D 사다리 본체
    PeopleEditor.tsx    명단 편집 · 드래그 정렬
    ResultBoard.tsx     전체 결과표
    Controls.tsx        당첨 인원 · 사다리 만들기 · 타기 · 공유
    ui.tsx              Button · Toggle · Panel
```

### 성능

회전각을 React state에 두면 초당 60번 리렌더가 일어납니다. 인원이 늘수록 세로줄·가로선·경로가
함께 늘어나 곧바로 버벅입니다. 그래서 회전각은 `useRef`에만 두고 `requestAnimationFrame` 안에서
DOM의 `transform`을 직접 씁니다. 회전 중 리렌더는 **0회**입니다.

이름표는 원기둥에 붙어 돌면 원근에 눌려 글자가 뭉개지므로, 위치만 원기둥에 두고 방향은 카메라
쪽으로 되돌립니다(빌보딩). 이 계산도 같은 rAF 루프에서 처리합니다.

### 효과음

오디오 파일이 없습니다. Web Audio API로 그때그때 합성합니다. 저장소가 가볍고 오프라인에서도
동작하며, 가로선이 꽂히는 타이밍에 맞춰 음정을 흩뜨리는 것 같은 조작도 가능합니다.

## 접근성

`prefers-reduced-motion`을 켠 사용자에게는 날아드는 연출과 색종이를 생략하고 결과만 보여 줍니다.

## 배포

Vercel 기준으로 설정되어 있습니다 (`base: '/'`, SPA 리라이트는 `vercel.json`).

```bash
npm run build   # dist/
```

## 명령

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사 후 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | oxlint |
