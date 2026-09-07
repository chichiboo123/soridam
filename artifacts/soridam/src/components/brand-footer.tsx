import { cn } from '@/lib/utils';

const CREDIT_URL = 'https://litt.ly/chichiboo';
const CREDIT_TEXT = 'Created by. 교육뮤지컬 꿈꾸는 치수쌤';

/**
 * 치수쌤 크레딧 푸터.
 *
 * 이전 버전에서는 화면 위에 떠 있는 알약(absolute bottom-[96px])이라
 * 저장 버튼 같은 하단 요소를 가렸습니다. 이제는 항상 고정 독(모바일) 또는
 * 사이드 레일 하단(데스크톱)의 실제 자리를 차지하며, 그만큼 본문 하단
 * 여백이 자동으로 확보됩니다.
 */
export function BrandFooter({
  className,
  variant = 'bar',
}: {
  className?: string;
  variant?: 'bar' | 'rail';
}) {
  return (
    <footer
      className={cn(
        'flex w-full items-center justify-center bg-card',
        variant === 'bar' ? 'px-4 py-1.5' : 'px-2 py-3',
        className,
      )}
    >
      <a
        href={CREDIT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex items-center justify-center gap-1 rounded-md font-semibold text-muted-foreground transition-colors hover:text-primary',
          variant === 'bar'
            ? 'text-[11px]'
            : 'flex-col text-center text-[11px] leading-snug',
        )}
      >
        <span
          className="material-symbols-rounded text-[14px]"
          aria-hidden="true"
        >
          auto_stories
        </span>
        <span>{CREDIT_TEXT}</span>
      </a>
    </footer>
  );
}
