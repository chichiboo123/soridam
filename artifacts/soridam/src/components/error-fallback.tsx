import type { ErrorFallbackProps } from '@/components/error-boundary';

/**
 * 오류 화면.
 * VER1은 영어 안내에 하드코딩된 회색을 쓰고 있어, 아이들이 쓰는 화면에
 * 개발자용 문구가 그대로 노출됐습니다.
 */
export function AppErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background p-6">
      <div className="sd-card flex w-full max-w-md flex-col items-center gap-4 p-8 text-center">
        <span
          className="material-symbols-rounded text-[3rem] text-accent"
          aria-hidden="true"
        >
          sentiment_dissatisfied
        </span>
        <h1 className="text-foreground">앗, 문제가 생겼어요</h1>
        <p className="text-sm font-semibold leading-relaxed text-muted-foreground">
          이 화면을 그리는 중에 오류가 났어요.
          <br />
          담아둔 소리와 이야기는 그대로 남아 있으니 안심하세요.
        </p>

        {import.meta.env.DEV ? (
          <pre className="w-full overflow-x-auto rounded-xl bg-muted p-3 text-left text-xs text-foreground">
            {error.message || String(error)}
          </pre>
        ) : null}

        <button
          type="button"
          onClick={resetError}
          className="mt-1 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 font-bold text-primary-foreground sd-pop sd-press"
        >
          <span
            className="material-symbols-rounded text-xl"
            aria-hidden="true"
          >
            refresh
          </span>
          다시 시도하기
        </button>
      </div>
    </div>
  );
}
