import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { db, type SoundStory } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { generateId } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function Stories() {
  const [stories, setStories] = useState<SoundStory[]>([]);
  const [, setLocation] = useLocation();
  const [deleteStory, setDeleteStory] = useState<SoundStory | null>(null);

  useEffect(() => {
    loadStories();
  }, []);

  const loadStories = async () => {
    const data = await db.getStories();
    setStories(data);
  };

  const createNewStory = async () => {
    const id = generateId();
    const newStory: SoundStory = {
      id,
      title: "새 이야기",
      clips: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      trackCount: 1,
    };
    await db.saveStory(newStory);
    setLocation(`/stories/${id}`);
  };

  const handleDelete = async () => {
    if (deleteStory) {
      await db.deleteStory(deleteStory.id);
      loadStories();
      setDeleteStory(null);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 md:p-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3 mb-8 mt-4">
        <h1 className="text-3xl sm:text-4xl font-black">소리 이야기</h1>
        <Button onClick={createNewStory} className="gap-1.5 rounded-[1.5rem] h-14 px-4 sm:px-6 text-base sm:text-lg font-bold bg-accent text-accent-foreground hover:bg-accent/90 shadow-[0_6px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[6px] transition-all">
          <span className="material-symbols-rounded text-2xl">add_circle</span>
          새 이야기
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 px-1">
        {stories.length === 0 ? (
          <div className="col-span-2 flex flex-col items-center justify-center h-64 text-muted-foreground gap-4 bg-muted/30 rounded-[2.5rem] border-4 border-dashed border-border">
            <span className="material-symbols-rounded text-6xl opacity-40">auto_awesome</span>
            <p className="font-bold text-lg">만들어진 이야기가 없어요. 새 이야기를 시작해보세요!</p>
          </div>
        ) : (
          stories.map(story => (
            <Link key={story.id} href={`/stories/${story.id}`}>
              <div className="bg-card p-6 md:p-8 rounded-[2.5rem] border-4 border-border shadow-[0_6px_0_0_rgba(0,0,0,0.05)] hover:-translate-y-1 hover:shadow-[0_10px_0_0_rgba(0,0,0,0.05)] hover:border-primary/50 transition-all cursor-pointer group flex flex-col gap-6">
                <div className="flex justify-between items-start">
                  <h3 className="font-black text-2xl truncate pr-4">{story.title}</h3>
                  <Button variant="ghost" size="icon" aria-label={`${story.title} 삭제`} className="h-12 w-12 rounded-xl text-destructive shrink-0 hover:bg-destructive/10 transition-colors md:text-muted-foreground md:opacity-0 md:group-hover:text-destructive md:group-hover:opacity-100" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteStory(story); }}>
                    <span className="material-symbols-rounded text-2xl">delete</span>
                  </Button>
                </div>
                <div className="flex justify-between items-end mt-auto text-base text-muted-foreground font-bold">
                  <span className="bg-muted px-3 py-1 rounded-xl flex items-center gap-2">
                    <span className="material-symbols-rounded text-lg">extension</span>
                    {story.clips.length}개의 조각
                  </span>
                  <span className="font-mono text-sm opacity-60">{new Date(story.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
      <AlertDialog open={!!deleteStory} onOpenChange={(open) => !open && setDeleteStory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-1 grid size-16 place-items-center rounded-2xl bg-destructive/10 text-destructive sm:mx-0"><span className="material-symbols-rounded text-4xl" aria-hidden="true">delete</span></div>
            <AlertDialogTitle className="text-2xl font-black">이 이야기를 지울까요?</AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed">‘{deleteStory?.title}’ 이야기의 배치 정보가 사라지며, 삭제 후에는 되돌릴 수 없어요. 보관함의 원본 소리는 그대로 남아요.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 rounded-xl text-base font-bold">취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="h-12 rounded-xl bg-destructive text-base font-bold text-destructive-foreground hover:bg-destructive/90">삭제하기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
