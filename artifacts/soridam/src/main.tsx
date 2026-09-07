import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppErrorFallback } from '@/components/error-fallback';

import './index.css';

const ICON_FONT = '24px "Material Symbols Rounded"';

/**
 * 아이콘 폰트가 실제로 준비됐을 때만 글리프를 보여 줍니다.
 * 폰트 CDN이 막힌 환경에서 'mic', 'library_music' 같은 리거처 원문이
 * 화면에 찍히며 레이아웃이 무너지는 것을 막습니다.
 */
async function markIconsReady() {
  const root = document.documentElement;
  const ready = () => root.classList.add('icons-ready');

  if (!document.fonts?.check) {
    ready();
    return;
  }

  try {
    await document.fonts.ready;
    await document.fonts.load(ICON_FONT);
    if (document.fonts.check(ICON_FONT)) {
      ready();
      return;
    }
  } catch {
    // 아래 재확인으로 넘어갑니다.
  }

  window.setTimeout(() => {
    if (document.fonts.check(ICON_FONT)) ready();
  }, 3000);
}

void markIconsReady();

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary FallbackComponent={AppErrorFallback}>
    <App />
  </ErrorBoundary>,
);
