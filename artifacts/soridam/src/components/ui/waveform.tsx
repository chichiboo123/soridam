import * as React from 'react';
import { cn } from '@/lib/utils';
import { getPeaks } from '@/lib/waveform';

/**
 * 소리의 실제 파형 막대.
 * `progress`(0~1)를 주면 재생된 부분이 진하게 채워집니다.
 */
export function Waveform({
  peaks,
  progress = 0,
  className,
  barClassName,
  activeBarClassName,
}: {
  peaks: number[];
  progress?: number;
  className?: string;
  barClassName?: string;
  activeBarClassName?: string;
}) {
  return (
    <div
      className={cn('flex h-full w-full items-center gap-[2px]', className)}
      aria-hidden="true"
    >
      {peaks.map((value, index) => {
        const played = peaks.length > 0 && index / peaks.length < progress;
        return (
          <div
            key={index}
            className={cn(
              'min-h-[2px] flex-1 rounded-full transition-colors',
              played
                ? (activeBarClassName ?? 'bg-primary')
                : (barClassName ?? 'bg-primary/25'),
            )}
            style={{ height: `${Math.round(value * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

/** 소리 id로 파형을 비동기 로드해 캐시에서 재사용합니다. */
export function usePeaks(
  cacheKey: string | null | undefined,
  blob: Blob | null | undefined,
  bucketCount = 64,
) {
  const [peaks, setPeaks] = React.useState<number[] | null>(null);

  React.useEffect(() => {
    if (!cacheKey || !blob) {
      setPeaks(null);
      return;
    }
    let cancelled = false;
    getPeaks(cacheKey, blob, bucketCount).then((result) => {
      if (!cancelled) setPeaks(result);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, blob, bucketCount]);

  return peaks;
}
