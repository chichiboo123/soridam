import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { db, type SoundStory } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { generateId } from "@/lib/utils";

export default function Stories() {
  const [stories, setStories] = useState<SoundStory[]>([]);
  const [, setLocation] = useLocation();

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

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (confirm("이야기를 정말 삭제할까요?")) {
      await db.deleteStory(id);
      loadStories();
    }
  };

  return (
    <div className="flex flex-col h-full p-4 md:p-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8 mt-4">
        <h1 className="text-4xl font-black">소리 이야기</h1>
        <Button onClick={createNewStory} className="gap-2 rounded-[1.5rem] h-14 px-6 text-lg font-bold bg-accent text-accent-foreground hover:bg-accent/90 shadow-[0_6px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[6px] transition-all">
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
                  <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl text-muted-foreground shrink-0 hover:bg-destructive/10 group-hover:text-destructive transition-colors opacity-0 group-hover:opacity-100" onClick={(e) => handleDelete(e, story.id)}>
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
    </div>
  );
}
