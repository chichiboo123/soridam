# 소리담

주변의 소리를 녹음하고 다듬은 뒤, 블록처럼 배치해 하나의 소리 이야기로 만드는 어린이 친화적인 모바일 우선 웹앱입니다. 로그인이나 서버 없이 모든 녹음과 편집 정보가 사용 중인 브라우저에 저장됩니다.

## 주요 기능

- 소리 녹음, 일시정지, 재개 및 즉시 재생
- 파형을 눌러 원하는 지점부터 감상
- 녹음한 소리의 앞뒤 구간을 비파괴 방식으로 편집
- 개별 소리 다운로드 및 완성한 이야기의 WAV 음원 저장
- 저장된 소리 검색, 정렬, 이름 변경 및 삭제
- 한 개 트랙부터 시작해 필요한 만큼 트랙을 추가하는 쉬운 이야기 편집
- 사각형 소리 블록의 가로·세로 드래그 배치
- 고정 편집 패널에서 트랙, 음량, 페이드 인·아웃 조정
- 여러 소리를 순서대로 또는 겹쳐 배치하고 결과를 미리 듣기

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

`main` 브랜치에 변경 사항이 올라가면 GitHub Actions가 타입 검사와 빌드를 실행하고, 성공한 결과를 `github-pages` 배포 환경을 통해 GitHub Pages에 자동 배포합니다. 저장소의 **Settings → Pages → Build and deployment → Source**는 **GitHub Actions**로 설정하세요. Actions 탭의 **Deploy Soridam to GitHub Pages** 워크플로에서 수동 배포도 실행할 수 있습니다.

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
├── src/components/  # 공통 레이아웃과 UI 컴포넌트
└── src/lib/         # IndexedDB 및 오디오 처리
```

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
