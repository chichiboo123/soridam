# 소리담

주변 소리를 녹음·편집·저장하고 여러 소리를 배치해 소리 이야기를 만드는 모바일 우선 웹앱입니다.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- 소리담은 브라우저 IndexedDB만 사용하며 서버 환경 변수는 필요하지 않음

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite, MediaRecorder, Web Audio API, IndexedDB

## Where things live

- `artifacts/soridam/` — 배포 가능한 소리담 웹앱
- `artifacts/soridam/src/features/` — 녹음, 저장, 오디오 편집 및 이야기 기능
- `README.md` — 실행, 빌드, 배포 및 브라우저 지원 안내

## Architecture decisions

- 로그인과 서버 저장 없이 모든 사용자 오디오를 IndexedDB에 로컬 저장
- 원본 소리를 유지하고 자르기 정보를 별도로 관리해 원본 복원 지원
- 편집 및 이야기 결과는 Web Audio API를 통해 WAV로 렌더링

## Product

- 소리 녹음, 재생, 실제 파형을 보며 앞뒤 자르기, 저장 및 WAV 다운로드
- 저장된 소리 검색·정렬·이름 변경·삭제
- 여러 소리를 배치하고 겹쳐 재생하는 소리 이야기 편집
- 타임라인 확대/축소, 블록 스냅, 키보드 단축키

## User preferences

- 기본 폰트는 Pretendard GOV
- Google Material Symbols Rounded 아이콘과 한국어 텍스트 라벨을 함께 사용
- 푸터 문구는 `Created by. 교육뮤지컬 꿈꾸는 치수쌤`, 링크는 `https://litt.ly/chichiboo`
- 완성된 소스는 GitHub 업로드를 고려해 유지

## Gotchas

- 마이크는 localhost 또는 HTTPS 보안 컨텍스트에서만 동작
- 모바일 Safari 오디오는 반드시 사용자 동작 안에서 시작
- 대용량 오디오를 localStorage나 서버 DB에 넣지 않음
- 하단 독 높이는 ResizeObserver로 측정해 `--sd-dock-h`에 넣고 본문 여백에 사용.
  네비/푸터 구조를 바꿀 때 이 변수를 함께 확인할 것
- 아이콘 폰트를 못 받으면 리거처 원문이 노출되므로, `icons-ready` 클래스가
  붙기 전까지 아이콘을 1em 상자 안에 숨김 (`main.tsx`)
- 밝은 브랜드 오렌지(`--brand`)는 장식 전용. 글자를 얹는 곳에는 대비를
  통과하는 `--primary`를 사용할 것

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
