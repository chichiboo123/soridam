import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const WIDTHS = {
  narrow: 'max-w-2xl',
  default: 'max-w-3xl',
  wide: 'max-w-5xl',
} as const;

/**
 * 모든 페이지가 같은 좌우 여백과 최대 너비를 쓰도록 하는 컨테이너.
 * 하단 여백은 앱 셸이 독 높이만큼 이미 확보하므로 여기서는 콘텐츠 숨 쉴
 * 공간만 더합니다.
 */
export function PageShell({
  children,
  className,
  width = 'default',
}: {
  children: ReactNode;
  className?: string;
  width?: keyof typeof WIDTHS;
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-1 flex-col px-4 pb-8 pt-5 sm:px-6 md:px-10 md:pt-9',
        WIDTHS[width],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'mb-5 flex items-start justify-between gap-3 md:mb-7',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm font-semibold text-muted-foreground md:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/** 목록이 비었을 때 쓰는 공통 안내 블록 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border-strong bg-muted/40 px-6 py-12 text-center',
        className,
      )}
    >
      <span
        className="material-symbols-rounded text-[3rem] text-muted-foreground/45"
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="text-lg font-extrabold text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm font-semibold leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
