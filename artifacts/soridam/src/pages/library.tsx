import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { db, type Sound } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TrimSlider } from "@/components/ui/trim-slider";

export default function Library() {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Edit dialog state
  const [editSound, setEditSound] = useState<Sound | null>(null);
  const [editName, setEditName] = useState("");
  const [editTrimStart, setEditTrimStart] = useState(0);
  const [editTrimEnd, setEditTrimEnd] = useState(0);
  const [deleteSound, setDeleteSound] = useState<Sound | null>(null);

  useEffect(() => {
    loadSounds();
  }, []);

  const loadSounds = async () => {
    const data = await db.getSounds();
    setSounds(data);
  };

  const handlePlay = (sound: Sound) => {
    if (playingId === sound.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const url = URL.createObjectURL(sound.audioBlob);
    const audio = new Audio(url);
    audioRef.current = audio;
    
    setPlayingId(sound.id);

    audio.onloadedmetadata = () => {
      audio.currentTime = sound.trimStart;
      audio.play();
    };

    audio.ontimeupdate = () => {
      if (audio.currentTime >= sound.trimEnd) {
        audio.pause();
        setPlayingId(null);
      }
    };
    audio.onended = () => {
      setPlayingId(null);
      URL.revokeObjectURL(url);
    };
  };

  const handleDelete = async () => {
    if (deleteSound) {
      await db.deleteSound(deleteSound.id);
      loadSounds();
      if (playingId === deleteSound.id) {
        audioRef.current?.pause();
        setPlayingId(null);
      }
      setDeleteSound(null);
    }
  };

  const openEdit = (sound: Sound) => {
    setEditSound(sound);
    setEditName(sound.name);
    setEditTrimStart(sound.trimStart);
    setEditTrimEnd(sound.trimEnd);
  };

  const saveEdit = async () => {
    if (!editSound) return;
    try {
      await db.saveSound({
        ...editSound,
        name: editName,
        trimStart: editTrimStart,
        trimEnd: editTrimEnd,
        updatedAt: Date.now()
      });
      setEditSound(null);
      loadSounds();
      toast({ title: "수정 완료!" });
    } catch (e) {
      toast({ title: "오류", variant: "destructive" });
    }
  };

  const downloadSound = (sound: Sound) => {
    const url = URL.createObjectURL(sound.audioBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sound.name}.webm`; 
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = sounds.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex flex-col h-full p-4 md:p-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8 mt-4">
        <h1 className="text-4xl font-black">소리 보관함</h1>
      </div>

      <div className="mb-8 relative">
        <span className="material-symbols-rounded absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground text-3xl">search</span>
        <Input 
          className="pl-16 bg-card border-4 border-border shadow-[0_4px_0_0_rgba(0,0,0,0.05)] h-16 rounded-[2rem] text-xl font-bold focus-visible:ring-0 focus:border-primary transition-all" 
          placeholder="소리 찾기..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto pb-20 px-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4 bg-muted/30 rounded-[2.5rem] border-4 border-dashed border-border">
            <span className="material-symbols-rounded text-6xl opacity-40">library_music</span>
            <p className="font-bold text-lg">보관된 소리가 없어요.</p>
          </div>
        ) : (
          <div className="grid gap-5">
            {filtered.map(sound => (
              <div key={sound.id} className="bg-card p-5 rounded-[2rem] flex items-center gap-5 border-4 border-border shadow-[0_6px_0_0_rgba(0,0,0,0.05)] hover:border-primary/50 transition-colors group">
                <Button 
                  size="icon" 
                  className={`w-16 h-16 rounded-[1.25rem] shrink-0 shadow-[0_4px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[4px] transition-all ${playingId === sound.id ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  onClick={() => handlePlay(sound)}
                >
                  <span className="material-symbols-rounded text-4xl">
                    {playingId === sound.id ? 'pause' : 'play_arrow'}
                  </span>
                </Button>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-xl md:text-2xl truncate">{sound.name}</h3>
                  <div className="text-sm md:text-base text-muted-foreground flex gap-3 font-mono mt-1 font-bold">
                    <span className="bg-muted px-2 py-0.5 rounded-lg">{formatTime(sound.trimEnd - sound.trimStart)}</span>
                    <span className="opacity-50">•</span>
                    <span>{new Date(sound.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex gap-2 shrink-0 md:opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="hover:bg-muted rounded-xl h-12 w-12" onClick={() => openEdit(sound)}>
                    <span className="material-symbols-rounded text-2xl">edit</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="hover:bg-muted rounded-xl h-12 w-12" onClick={() => downloadSound(sound)}>
                    <span className="material-symbols-rounded text-2xl">download</span>
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`${sound.name} 삭제`} className="text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl h-12 w-12" onClick={() => setDeleteSound(sound)}>
                    <span className="material-symbols-rounded text-2xl">delete</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!editSound} onOpenChange={(open) => !open && setEditSound(null)}>
        <DialogContent className="sm:max-w-md bg-card border-4 border-border shadow-2xl rounded-[2.5rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">소리 고치기</DialogTitle>
            <DialogDescription className="pr-10 text-base">이름과 사용할 소리 구간을 바꿀 수 있어요.</DialogDescription>
          </DialogHeader>
          {editSound && (
            <div className="py-4 flex flex-col gap-8">
              <div>
                <label className="text-base font-bold mb-3 block text-foreground">이름</label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="font-black text-xl h-14 rounded-2xl border-2 shadow-inner bg-muted/30 focus-visible:ring-primary/20 focus-visible:ring-4" />
              </div>
              
              <div>
                <label className="text-base font-bold mb-3 block text-foreground">길이 조절</label>
                <TrimSlider 
                  duration={editSound.duration} 
                  trimStart={editTrimStart} 
                  trimEnd={editTrimEnd} 
                  onChange={(s, e) => { setEditTrimStart(s); setEditTrimEnd(e); }}
                />
              </div>
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="ghost" className="h-14 rounded-[1.25rem] text-lg font-bold" onClick={() => setEditSound(null)}>취소</Button>
            <Button className="h-14 rounded-[1.25rem] text-lg font-bold shadow-[0_4px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[4px] transition-all" onClick={saveEdit}>저장하기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteSound} onOpenChange={(open) => !open && setDeleteSound(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-1 grid size-16 place-items-center rounded-2xl bg-destructive/10 text-destructive sm:mx-0">
              <span className="material-symbols-rounded text-4xl" aria-hidden="true">delete</span>
            </div>
            <AlertDialogTitle className="text-2xl font-black">이 소리를 지울까요?</AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed">‘{deleteSound?.name}’ 소리는 삭제하면 다시 되돌릴 수 없어요.</AlertDialogDescription>
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
