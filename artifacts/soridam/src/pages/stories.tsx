import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { db, type SoundStory } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { PageShell, PageHeader, EmptyState } from '@/components/page-header';
import { generateId, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function Stories() {
  const [stories, setStories] = useState<SoundStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();
  const [deleteTarget, setDeleteTarget] = useState<SoundStory | null>(null);
  const { toast } = useToast();

  const loadStories = useCallback(async () => {
    try {
      const data = await db.getStories();
      setStories(data.sort((a, b) => b.updatedAt - a.updatedAt));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  const createNewStory = async () => {
    const id = generateId();
    const newStory: SoundStory = {
      id,
      title: `새 이야기 ${stories.length + 1}`,
      clips: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      trackCount: 1,
    };
    await db.saveStory(newStory);
    setLocation(`/stories/${id}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await db.deleteStory(deleteTarget.id);
    setDeleteTarget(null);
    loadStories();
    toast({ title: '이야기를 지웠어요' });
  };

  return (
    <PageShell width="wide">
      <PageHeader
        title="소리 이야기"
        description="담아둔 소리를 블록처럼 배치해 이야기를 만들어요"
        action={
          <Button variant="accent" size="lg" onClick={createNewStory}>
            <span
              className="material-symbols-rounded text-2xl"
              aria-hidden="true"
            >
              add_circle
            </span>
            새 이야기
          </Button>
        }
      />

      {loading ? (
        <p className="py-10 text-center font-bold text-muted-foreground">
          불러오는 중…
        </p>
      ) : stories.length === 0 ? (
        <EmptyState
          icon="auto_awesome"
          title="아직 만든 이야기가 없어요"
          description="‘새 이야기’를 눌러 소리 블록을 놓아 보세요. 소리함에 담아둔 소리를 그대로 쓸 수 있어요."
          action={
            <Button variant="accent" size="lg" onClick={createNewStory}>
              <span
                className="material-symbols-rounded text-2xl"
                aria-hidden="true"
              >
                add_circle
              </span>
              첫 이야기 만들기
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {stories.map((story) => (
            <li key={story.id}>
              {/*
                VER1은 <Link> 안에 <button>(삭제)을 넣어 마크업이 어긋났고
                스크린리더·키보드에서 동작이 불안정했습니다.
                이제 제목 링크를 카드 전체로 늘리고(after:inset-0),
                삭제 버튼은 그 위에 별도 요소로 둡니다.
              */}
              <article className="sd-card relative flex h-full flex-col gap-5 p-5 transition-colors focus-within:border-primary hover:border-primary/60">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 text-xl font-extrabold text-foreground">
                    <Link
                      href={`/stories/${story.id}`}
                      className="block truncate rounded-md after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
                    >
                      {story.title}
                    </Link>
                  </h2>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${story.title} 삭제`}
                    className="relative z-10 shrink-0 text-muted-foreground hover:bg-destructive-tint hover:text-destructive"
                    onClick={() => setDeleteTarget(story)}
                  >
                    <span
                      className="material-symbols-rounded text-2xl"
                      aria-hidden="true"
                    >
                      delete
                    </span>
                  </Button>
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 text-sm font-bold text-muted-foreground">
                  <span className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1">
                    <span
                      className="material-symbols-rounded text-lg"
                      aria-hidden="true"
                    >
                      extension
                    </span>
                    소리 블록 {story.clips.length}개
                  </span>
                  <span>{formatDate(story.updatedAt)}</span>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-1 grid size-14 place-items-center rounded-2xl bg-destructive-tint text-destructive sm:mx-0">
              <span
                className="material-symbols-rounded text-3xl"
                aria-hidden="true"
              >
                delete
              </span>
            </div>
            <AlertDialogTitle>이 이야기를 지울까요?</AlertDialogTitle>
            <AlertDialogDescription>
              ‘{deleteTarget?.title}’의 배치 정보가 사라지고 되돌릴 수 없어요.
              소리함의 원본 소리는 그대로 남아요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
