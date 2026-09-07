import { ReactNode, useLayoutEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { BrandFooter } from '@/components/brand-footer';

const NAV_ITEMS = [
  { path: '/', label: '녹음', icon: 'mic', hint: '새로운 소리를 녹음해요' },
  {
    path: '/sounds',
    label: '소리함',
    icon: 'library_music',
    hint: '저장한 소리를 관리해요',
  },
  {
    path: '/stories',
    label: '이야기',
    icon: 'auto_awesome',
    hint: '소리를 배치해 이야기를 만들어요',
  },
];

function isActivePath(location: string, path: string) {
  return path === '/' ? location === '/' : location.startsWith(path);
}

/**
 * 앱 셸.
 *
 * VER2에서 바뀐 점
 * - 문서 스크롤을 사용합니다. 이전의 `h-[100dvh] + overflow-hidden` 조합은
 *   모바일 브라우저 주소창이 접히고 펴질 때 높이가 튀면서 하단 콘텐츠가
 *   잘리는 원인이었습니다.
 * - 하단 독(네비 + 푸터)의 실제 높이를 ResizeObserver로 재서
 *   `--sd-dock-h`에 넣고, 본문 하단 여백에 그대로 사용합니다.
 *   글자 크기나 노치 크기가 달라져도 버튼이 가려지지 않습니다.
 * - 노치/홈 인디케이터 영역은 safe-area-inset으로 처리합니다.
 */
export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const shellRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const dock = dockRef.current;
    if (!shell || !dock) return;

    const sync = () => {
      // 데스크톱에서는 독이 display:none 이라 0px → 하단 여백도 0
      shell.style.setProperty('--sd-dock-h', `${dock.offsetHeight}px`);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(dock);
    window.addEventListener('orientationchange', sync);
    window.addEventListener('resize', sync);

    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  return (
    <div
      ref={shellRef}
      className="relative flex min-h-[100dvh] w-full flex-col bg-background"
    >
      <a
        href="#sd-main"
        className="sr-only-focusable absolute left-4 top-4 z-[100] rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground"
      >
        본문 바로가기
      </a>

      {/* ── 데스크톱: 좌측 레일 (브랜드 · 메뉴 · 크레딧) ───────────────── */}
      <div className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sd-rail-width)] flex-col border-r-2 border-border bg-card md:flex">
        <Link
          href="/"
          className="mx-auto mt-7 flex size-14 items-center justify-center rounded-2xl bg-brand text-white sd-pop sd-pop-lg sd-press"
          aria-label="소리담 홈"
        >
          <span
            className="material-symbols-rounded text-[30px]"
            aria-hidden="true"
          >
            graphic_eq
          </span>
        </Link>

        <nav
          aria-label="주요 메뉴"
          className="mt-8 flex flex-1 flex-col gap-3 px-3"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(location, item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={active ? 'page' : undefined}
                title={item.hint}
                className={cn(
                  'group flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 transition-colors',
                  active
                    ? 'bg-primary-tint'
                    : 'hover:bg-muted focus-visible:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'flex h-11 w-14 items-center justify-center rounded-xl transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground sd-pop sd-pop-sm'
                      : 'text-muted-foreground group-hover:text-foreground',
                  )}
                >
                  <span
                    className="material-symbols-rounded text-[26px]"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                </span>
                <span
                  className={cn(
                    'text-[13px] font-bold',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

      </div>

      {/* ── 본문 ─────────────────────────────────────────────────────── */}
      <main
        id="sd-main"
        className="flex w-full flex-1 flex-col md:pl-[var(--sd-rail-width)]"
        style={{ paddingBottom: 'var(--sd-dock-h, 0px)' }}
      >
        {children}
        {/*
          데스크톱 크레딧. mt-auto 덕분에 내용이 짧으면 화면 맨 아래,
          길면 내용 끝에 붙습니다(고전적인 sticky footer).
        */}
        <BrandFooter
          variant="bar"
          className="mt-auto hidden border-t-2 border-border py-2.5 md:flex"
        />
      </main>

      {/* ── 모바일: 하단 고정 독 (메뉴 + 크레딧) ───────────────────────
          fixed + safe-area. 본문은 이 독의 실측 높이만큼 여백을 갖습니다. */}
      <div
        ref={dockRef}
        className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-border bg-card shadow-[0_-6px_24px_rgba(15,23,42,0.06)] md:hidden"
        style={{ paddingBottom: 'var(--sd-safe-bottom)' }}
      >
        <nav
          aria-label="주요 메뉴"
          className="flex items-stretch justify-around px-2 pt-1.5"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(location, item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={active ? 'page' : undefined}
                className="group flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-0.5"
              >
                <span
                  className={cn(
                    'flex h-9 w-[3.25rem] items-center justify-center rounded-xl transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  <span
                    className="material-symbols-rounded text-[24px]"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                </span>
                <span
                  className={cn(
                    'text-[11px] font-bold',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <BrandFooter variant="bar" />
      </div>
    </div>
  );
}
