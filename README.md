# 소리담

주변의 소리를 녹음하고, 자르고, 기기에 저장한 뒤 여러 소리를 배치해 하나의 소리 이야기로 만드는 모바일 우선 웹앱입니다.

## 주요 기능

- 소리 녹음, 일시정지, 재개 및 즉시 재생
- 녹음한 소리의 앞뒤 구간 편집
- WAV 다운로드 및 브라우저 기기 저장
- 저장된 소리 검색, 정렬, 이름 변경 및 삭제
- 여러 소리를 시간 순서 또는 동시에 배치하는 소리 이야기
- 소리별 위치, 자르기 구간, 음량 및 페이드 조정
- 완성된 소리 이야기의 재생 및 WAV 렌더링

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

정적 호스팅 서비스에서 다음 설정을 사용합니다.

- 빌드 명령: `pnpm install --frozen-lockfile && PORT=5173 BASE_PATH=/ pnpm --filter @workspace/soridam run build`
- 출력 디렉터리: `artifacts/soridam/dist/public`
- Node.js 24

마이크 접근을 위해 반드시 HTTPS로 배포해야 합니다.

## 데이터 저장 방식

오디오 Blob, 이름, 편집 정보와 소리 이야기는 서버가 아닌 현재 브라우저의 IndexedDB에 저장됩니다. 로그인이나 계정이 없으며, 다른 브라우저나 기기로 데이터가 자동 동기화되지 않습니다.

브라우저 데이터 삭제, 시크릿 모드 종료 또는 저장 공간 정리 시 저장한 자료가 사라질 수 있으므로 중요한 결과물은 WAV 파일로 내려받아 보관하세요.

## 브라우저 지원

- iPhone 및 iPad Safari 최신 버전
- Android Chrome 최신 버전
- Windows 및 Chromebook Chrome 최신 버전

브라우저마다 MediaRecorder 녹음 형식과 마이크 권한 화면이 다를 수 있습니다.

## 알려진 제한사항

- 녹음과 소리 재생은 브라우저 정책에 따라 사용자의 버튼 조작 이후에만 시작됩니다.
- 매우 긴 녹음이나 이야기를 WAV로 변환하면 기기 메모리를 많이 사용할 수 있습니다.
- 저장 데이터는 사용 중인 브라우저와 기기에만 존재합니다.

## 라이선스

MIT License