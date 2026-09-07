import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/page-header';

export default function NotFound() {
  return (
    <PageShell width="narrow" className="items-center justify-center">
      <div className="sd-card flex w-full flex-col items-center gap-4 p-8 text-center">
        <span
          className="material-symbols-rounded text-[3.5rem] text-accent"
          aria-hidden="true"
        >
          travel_explore
        </span>
        <h1 className="text-foreground">여기엔 아무것도 없어요</h1>
        <p className="text-sm font-semibold leading-relaxed text-muted-foreground">
          주소가 잘못되었거나 사라진 페이지예요.
          <br />
          아래 버튼으로 녹음 화면부터 다시 시작해 볼까요?
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/">
              <span
                className="material-symbols-rounded text-xl"
                aria-hidden="true"
              >
                mic
              </span>
              녹음하러 가기
            </Link>
          </Button>
          <Button asChild variant="soft" size="lg">
            <Link href="/sounds">소리함 열기</Link>
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
