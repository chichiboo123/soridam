import * as React from 'react';
import { cn, formatTime } from '@/lib/utils';

interface TrimSliderProps {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime?: number;
  /** 실제 오디오 파형 (0~1). 없으면 로딩 자리표시자를 보여줍니다. */
  peaks?: number[] | null;
  onChange: (start: number, end: number) => void;
  onSeek?: (time: number) => void;
  className?: string;
}

const MIN_SPAN = 0.1;
const STEP = 0.1;
const BIG_STEP = 1;

/**
 * 자르기 슬라이더 (VER2).
 *
 * 바뀐 점
 * - 가짜 난수 파형 대신 실제 오디오 파형을 그립니다.
 * - 손잡이가 키보드로 조작됩니다(role="slider", 화살표/Home/End).
 * - 손잡이 히트 영역을 44px로 넓혀 손가락으로도 잡힙니다.
 * - 드래그 중에는 `touch-action: none`으로 페이지가 같이 스크롤되지 않습니다.
 */
export function TrimSlider({
  duration,
  trimStart,
  trimEnd,
  currentTime = trimStart,
  peaks,
  onChange,
  onSeek,
  className,
}: TrimSliderProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState<'start' | 'end' | null>(null);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

  const placeholderPeaks = React.useMemo(
    () => new Array(64).fill(0.12) as number[],
    [],
  );
  const bars = peaks && peaks.length > 0 ? peaks : placeholderPeaks;
  const isLoading = !peaks || peaks.length === 0;

  const timeFromClientX = React.useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el || safeDuration === 0) return null;
      const rect = el.getBoundingClientRect();
      if (!Number.isFinite(rect.width) || rect.width <= 0) return null;
      const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return percent * safeDuration;
    },
    [safeDuration],
  );

  const commit = React.useCallback(
    (handle: 'start' | 'end', value: number) => {
      if (handle === 'start') {
        onChange(
          Math.min(Math.max(0, value), trimEnd - MIN_SPAN),
          trimEnd,
        );
      } else {
        onChange(
          trimStart,
          Math.max(Math.min(safeDuration, value), trimStart + MIN_SPAN),
        );
      }
    },
    [onChange, safeDuration, trimEnd, trimStart],
  );

  React.useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: PointerEvent) => {
      const next = timeFromClientX(event.clientX);
      if (next === null) return;
      event.preventDefault();
      commit(dragging, next);
    };
    const stop = () => setDragging(null);

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging, commit, timeFromClientX]);

  const handleTrackPointerDown = (event: React.PointerEvent) => {
    if (dragging || !onSeek) return;
    const next = timeFromClientX(event.clientX);
    if (next !== null) onSeek(next);
  };

  const handleKeyDown =
    (handle: 'start' | 'end') => (event: React.KeyboardEvent) => {
      const current = handle === 'start' ? trimStart : trimEnd;
      let next: number | null = null;

      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          next = current - (event.shiftKey ? BIG_STEP : STEP);
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          next = current + (event.shiftKey ? BIG_STEP : STEP);
          break;
        case 'PageDown':
          next = current - BIG_STEP;
          break;
        case 'PageUp':
          next = current + BIG_STEP;
          break;
        case 'Home':
          next = handle === 'start' ? 0 : trimStart + MIN_SPAN;
          break;
        case 'End':
          next = handle === 'start' ? trimEnd - MIN_SPAN : safeDuration;
          break;
        default:
          return;
      }

      event.preventDefault();
      commit(handle, next);
    };

  const toPercent = (value: number, fallback: number) => {
    if (safeDuration === 0 || !Number.isFinite(value)) return fallback;
    return Math.min(100, Math.max(0, (value / safeDuration) * 100));
  };

  const startPercent = toPercent(trimStart, 0);
  const endPercent = toPercent(trimEnd, 100);
  const playheadPercent = toPercent(currentTime, 0);

  return (
    <div className={cn('w-full select-none', className)}>
      <div className="mb-2 flex justify-between px-1 font-mono text-xs font-bold text-muted-foreground">
        <span>0:00</span>
        <span>{formatTime(safeDuration)}</span>
      </div>

      {/*
        바깥 상자는 자르지 않습니다. 손잡이를 0%/100%에 두면 안쪽 상자의
        overflow-hidden 때문에 절반이 잘려 잡기 어려웠습니다.
        파형·음영처럼 둥근 모서리로 잘려야 하는 것만 안쪽에 둡니다.
      */}
      <div className="relative h-28 md:h-32">
        <div
          ref={containerRef}
          className="relative h-full touch-none overflow-hidden rounded-2xl border-2 border-border bg-muted/40"
          onPointerDown={handleTrackPointerDown}
          role={onSeek ? 'button' : undefined}
          tabIndex={-1}
          aria-label={onSeek ? '파형을 눌러 그 지점부터 듣기' : undefined}
        >
          {/* 파형 */}
          <div className="absolute inset-0 flex items-center gap-[2px] px-3">
            {bars.map((value, index) => {
              const percent = ((index + 0.5) / bars.length) * 100;
              const inRange = percent >= startPercent && percent <= endPercent;
              return (
                <div
                  key={index}
                  className={cn(
                    'min-h-[3px] flex-1 rounded-full transition-colors',
                    isLoading
                      ? 'animate-pulse bg-muted-foreground/25'
                      : inRange
                        ? 'bg-primary'
                        : 'bg-muted-foreground/25',
                  )}
                  style={{ height: `${Math.round(value * 72)}%` }}
                />
              );
            })}
          </div>

          {/* 잘려나갈 구간 흐리게 */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 bg-background/70"
            style={{ width: `${startPercent}%` }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 bg-background/70"
            style={{ width: `${100 - endPercent}%` }}
          />

          {/* 남길 구간 테두리 */}
          <div
            className="pointer-events-none absolute inset-y-1 rounded-xl border-2 border-primary/60"
            style={{
              left: `${startPercent}%`,
              width: `${Math.max(0, endPercent - startPercent)}%`,
            }}
          />

          {/* 재생 위치 */}
          <div
            className="pointer-events-none absolute inset-y-0 z-20 w-[3px] -translate-x-1/2 rounded-full bg-foreground"
            style={{ left: `${playheadPercent}%` }}
          >
            <div className="absolute -top-0.5 left-1/2 size-3 -translate-x-1/2 rounded-full border-2 border-background bg-foreground" />
          </div>
        </div>

        {(['start', 'end'] as const).map((handle) => {
          const percent = handle === 'start' ? startPercent : endPercent;
          const value = handle === 'start' ? trimStart : trimEnd;
          return (
            <div
              key={handle}
              role="slider"
              tabIndex={0}
              aria-label={handle === 'start' ? '자르기 시작 지점' : '자르기 끝 지점'}
              aria-valuemin={0}
              aria-valuemax={safeDuration}
              aria-valuenow={Number(value.toFixed(2))}
              aria-valuetext={`${formatTime(value)}초`}
              aria-orientation="horizontal"
              className="absolute inset-y-0 z-30 flex w-11 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-lg focus-visible:outline-offset-0"
              style={{ left: `${percent}%` }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragging(handle);
              }}
              onKeyDown={handleKeyDown(handle)}
            >
              <div
                className={cn(
                  'flex h-16 w-4 flex-col items-center justify-center gap-1 rounded-full border-2 border-white/50 bg-primary transition-transform md:h-20',
                  dragging === handle && 'scale-110',
                )}
              >
                <span className="h-2 w-1 rounded-full bg-white/85" />
                <span className="h-2 w-1 rounded-full bg-white/85" />
                <span className="h-2 w-1 rounded-full bg-white/85" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="시작" value={formatTime(trimStart)} />
        <Stat label="남길 길이" value={formatTime(trimEnd - trimStart)} strong />
        <Stat label="끝" value={formatTime(trimEnd)} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1 rounded-xl px-2 py-2',
        strong ? 'bg-primary text-primary-foreground' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'text-[11px] font-bold',
          strong ? 'text-primary-foreground/80' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      <span className="font-mono text-sm font-extrabold tabular-nums md:text-base">
        {value}
      </span>
    </div>
  );
}
