# 소리담

주변의 소리를 녹음하고 다듬은 뒤, 블록처럼 배치해 하나의 소리 이야기로 만드는 어린이 친화적인 모바일 우선 웹앱입니다. 로그인이나 서버 없이 모든 녹음과 편집 정보가 사용 중인 브라우저에 저장됩니다.

## 주요 기능

- 소리 녹음, 일시정지, 재개 및 즉시 재생 (한 번에 최대 10분)
- 녹음한 소리의 **실제 파형**을 보며 앞뒤 구간을 비파괴 방식으로 편집
- 파형을 눌러 원하는 지점부터 감상, 키보드 화살표로도 자르기 지점 조절
- 개별 소리와 완성한 이야기를 모두 WAV로 저장 (잘라낸 구간만 반영)
- 저장된 소리 검색, 정렬(최신순·이름순·긴 소리순), 이름 변경 및 삭제
- 한 개 트랙부터 시작해 필요한 만큼(최대 6줄) 트랙을 추가하는 이야기 편집
- 소리 블록의 가로·세로 드래그 배치와 자석처럼 붙는 정렬 보조
- 타임라인 확대·축소, 재생 위치 자동 따라가기
- 블록별 트랙, 음량, 페이드 인·아웃 조정 (미리 듣기와 저장 결과가 동일)
- 소리 추가 전 미리 듣기

### 키보드 단축키 (이야기 편집기)

| 키 | 동작 |
| --- | --- |
| `Space` | 재생 / 멈춤 |
| `←` `→` | 선택한 블록을 0.1초씩 이동 (`Shift`와 함께 1초) |
| `↑` `↓` | 선택한 블록을 위·아래 줄로 이동 |
| `Delete` / `Backspace` | 선택한 블록 삭제 |

## 반응형 · 접근성

- 모바일은 하단 고정 독(메뉴 + 푸터), 데스크톱은 좌측 레일 구조입니다.
  독의 실제 높이를 측정해 본문 하단 여백에 반영하므로 버튼이 가려지지 않습니다.
- 노치와 홈 인디케이터 영역은 `env(safe-area-inset-*)`으로 처리합니다.
- 모든 색상은 흰색 또는 본문 색 대비 WCAG AA(4.5:1) 이상입니다.
- 터치 대상은 최소 44px, 키보드 포커스는 항상 눈에 보입니다.
- 화면 확대(핀치 줌)를 막지 않습니다.

## 기술 스택

- React, TypeScript, Vite
- MediaRecorder API
- Web Audio API 및 OfflineAudioContext
- IndexedDB
- Tailwind CSS

## 로컬 실행 방법

이 저장소는 pnpm workspace로 구성되어 있습니다.

```bash
pnpm install
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/soridam run dev
```

브라우저에서 `http://localhost:5173`에 접속합니다. 마이크 기능은 localhost 또는 HTTPS 환경에서만 사용할 수 있습니다.

## 빌드 방법

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/soridam run build
```

빌드 결과는 `artifacts/soridam/dist/public`에 생성됩니다.

## 배포 방법

`main` 브랜치에 변경 사항이 올라가면 GitHub Actions가 타입 검사와 빌드를 실행하고, 성공한 결과를 `github-pages` 배포 환경을 통해 `https://soridam.chichiboo.link`에 자동 배포합니다. 저장소의 **Settings → Pages → Build and deployment → Source**는 **GitHub Actions**로, **Custom domain**은 `soridam.chichiboo.link`로 설정하세요. DNS에는 `soridam`을 해당 GitHub Pages 호스트로 연결하는 `CNAME` 레코드가 필요합니다. Actions 탭의 **Deploy Soridam to GitHub Pages** 워크플로에서 수동 배포도 실행할 수 있습니다.

다른 정적 호스팅 서비스를 사용한다면 다음 설정을 사용합니다.

- 빌드 명령: `pnpm install --frozen-lockfile && PORT=5173 BASE_PATH=/ pnpm --filter @workspace/soridam run build`
- 출력 디렉터리: `artifacts/soridam/dist/public`
- Node.js 24

마이크 접근을 위해 반드시 HTTPS로 배포해야 합니다.

## 데이터 저장 방식

오디오 Blob, 이름, 자르기 범위, 트랙 수, 소리 블록과 편집 정보는 서버가 아닌 현재 브라우저의 IndexedDB에 저장됩니다. 원본 오디오는 그대로 두고 시작·종료 지점만 별도로 저장합니다. 로그인이나 계정이 없으며, 다른 브라우저나 기기로 데이터가 자동 동기화되지 않습니다.

브라우저 데이터 삭제, 시크릿 모드 종료 또는 저장 공간 정리 시 저장한 자료가 사라질 수 있으므로 중요한 결과물은 WAV 파일로 내려받아 보관하세요.

## 브라우저 지원

- iPhone 및 iPad Safari 최신 버전
- Android Chrome 최신 버전
- Windows 및 Chromebook Chrome 최신 버전

브라우저마다 MediaRecorder 녹음 형식과 마이크 권한 화면이 다를 수 있습니다.

## 프로젝트 구조

```text
artifacts/soridam/
├── src/pages/       # 녹음, 소리함, 이야기 목록과 편집 화면
├── src/components/  # 앱 셸(layout), 페이지 공통 요소, UI 컴포넌트
└── src/lib/         # IndexedDB, 오디오 처리, 파형 계산
```

디자인 토큰(색상·타이포·모서리·입체 그림자·안전 영역)은 모두
`src/index.css` 한 곳에 정의되어 있습니다.

## GitHub에 올리기

저장소에는 빌드 결과물, 의존성, 로컬 환경 파일과 Replit 작업 파일이 올라가지 않도록 `.gitignore`가 준비되어 있습니다. GitHub Actions는 변경 사항을 올릴 때 타입 검사와 프로덕션 빌드를 자동으로 확인합니다.

새 GitHub 저장소를 만든 뒤 다음 명령으로 연결할 수 있습니다.

```bash
git add .
git commit -m "Initial release of Soridam"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

이미 `origin`이 등록되어 있다면 `git remote add` 대신 `git remote set-url origin ...`을 사용하세요. 비밀번호나 토큰은 파일에 저장하거나 커밋하지 마세요.

## 알려진 제한사항

- 녹음과 소리 재생은 브라우저 정책에 따라 사용자의 버튼 조작 이후에만 시작됩니다.
- 매우 긴 녹음이나 이야기를 WAV로 변환하면 기기 메모리를 많이 사용할 수 있습니다.
- 저장 데이터는 사용 중인 브라우저와 기기에만 존재합니다.
- 같은 기기에서도 브라우저 데이터가 삭제되면 저장한 녹음과 이야기는 복구할 수 없습니다.

## 라이선스

MIT License
