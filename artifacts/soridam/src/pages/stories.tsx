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
    };
    await db.saveStory(newStory);
    setLocation(`/stories/${id}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (confirm("이야기를 삭제하시겠습니까?")) {
      await db.deleteStory(id);
      loadStories();
    }
  };

  return (
    <div className="flex flex-col h-full p-4 md:p-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8 mt-4">
        <h1 className="text-3xl font-bold font-serif">소리 이야기</h1>
        <Button onClick={createNewStory} className="gap-2 rounded-2xl shadow-md">
          <span className="material-symbols-rounded">add</span>
          새 이야기
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {stories.length === 0 ? (
          <div className="col-span-2 flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
            <span className="material-symbols-rounded text-6xl opacity-20">auto_awesome</span>
            <p>만들어진 이야기가 없습니다. 새 이야기를 시작해보세요.</p>
          </div>
        ) : (
          stories.map(story => (
            <Link key={story.id} href={`/stories/${story.id}`}>
              <div className="bg-card p-6 rounded-3xl shadow-sm border border-border/50 hover:shadow-md transition-shadow cursor-pointer group flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-xl truncate pr-4">{story.title}</h3>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0 group-hover:text-destructive transition-colors opacity-0 group-hover:opacity-100" onClick={(e) => handleDelete(e, story.id)}>
                    <span className="material-symbols-rounded text-xl">delete</span>
                  </Button>
                </div>
                <div className="flex justify-between items-end mt-auto text-sm text-muted-foreground font-mono">
                  <span>{story.clips.length}개의 소리</span>
                  <span>{new Date(story.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
