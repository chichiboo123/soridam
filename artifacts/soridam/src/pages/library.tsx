import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { db, type Sound } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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

  const handleDelete = async (id: string) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      await db.deleteSound(id);
      loadSounds();
      if (playingId === id) {
        audioRef.current?.pause();
        setPlayingId(null);
      }
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
      toast({ title: "수정 완료" });
    } catch (e) {
      toast({ title: "오류", variant: "destructive" });
    }
  };

  const downloadSound = (sound: Sound) => {
    const url = URL.createObjectURL(sound.audioBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sound.name}.webm`; // In real app, we'd export to WAV using audio buffer, but this is simple raw download
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = sounds.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex flex-col h-full p-4 md:p-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8 mt-4">
        <h1 className="text-3xl font-bold font-serif">소리 보관함</h1>
      </div>

      <div className="mb-6 relative">
        <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">search</span>
        <Input 
          className="pl-12 bg-card border-none shadow-sm h-14 rounded-2xl text-lg" 
          placeholder="소리 검색..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
            <span className="material-symbols-rounded text-6xl opacity-20">library_music</span>
            <p>보관된 소리가 없습니다.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map(sound => (
              <div key={sound.id} className="bg-card p-4 rounded-3xl flex items-center gap-4 shadow-sm border border-border/50 group">
                <Button 
                  size="icon" 
                  variant={playingId === sound.id ? "default" : "secondary"} 
                  className="w-14 h-14 rounded-2xl shrink-0"
                  onClick={() => handlePlay(sound)}
                >
                  <span className="material-symbols-rounded text-3xl">
                    {playingId === sound.id ? 'pause' : 'play_arrow'}
                  </span>
                </Button>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg truncate">{sound.name}</h3>
                  <div className="text-sm text-muted-foreground flex gap-2 font-mono mt-1">
                    <span>{formatTime(sound.trimEnd - sound.trimStart)}</span>
                    <span>•</span>
                    <span>{new Date(sound.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex gap-2 shrink-0 md:opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(sound)}>
                    <span className="material-symbols-rounded">edit</span>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => downloadSound(sound)}>
                    <span className="material-symbols-rounded">download</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(sound.id)}>
                    <span className="material-symbols-rounded">delete</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!editSound} onOpenChange={(open) => !open && setEditSound(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>소리 수정</DialogTitle>
          </DialogHeader>
          {editSound && (
            <div className="py-4 flex flex-col gap-6">
              <div>
                <label className="text-sm font-medium mb-2 block text-muted-foreground">이름</label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="font-bold text-lg" />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block text-muted-foreground">재생 구간 설정</label>
                <TrimSlider 
                  duration={editSound.duration} 
                  trimStart={editTrimStart} 
                  trimEnd={editTrimEnd} 
                  onChange={(s, e) => { setEditTrimStart(s); setEditTrimEnd(e); }}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditSound(null)}>취소</Button>
            <Button onClick={saveEdit}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
