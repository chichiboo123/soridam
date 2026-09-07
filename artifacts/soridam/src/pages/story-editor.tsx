import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { db, type Sound, type SoundStory, type SoundClip } from "@/lib/db";
import { generateId, formatTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getAudioContext, decodeAudioBlob, audioBufferToWav } from "@/lib/audio";

const PIXELS_PER_SECOND = 40;
const TRACK_HEIGHT = 80;
const NUM_TRACKS = 4;

export default function StoryEditor() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [story, setStory] = useState<SoundStory | null>(null);
  const [sounds, setSounds] = useState<Record<string, Sound>>({});
  const [buffers, setBuffers] = useState<Record<string, AudioBuffer>>({});
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [duration, setDuration] = useState(10); // min 10s

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [librarySounds, setLibrarySounds] = useState<Sound[]>([]);
  
  const [selectedClip, setSelectedClip] = useState<SoundClip | null>(null);

  // Web Audio playback refs
  const sourcesRef = useRef<{ source: AudioBufferSourceNode, gain: GainNode, timeout: number }[]>([]);
  const playheadRafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const playheadOffsetRef = useRef<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (params.id) loadData(params.id);
  }, [params.id]);

  const loadData = async (id: string) => {
    const st = await db.getStory(id);
    if (!st) {
      toast({ title: "이야기를 찾을 수 없습니다.", variant: "destructive" });
      setLocation("/stories");
      return;
    }
    setStory(st);

    const snds = await db.getSounds();
    const sndMap: Record<string, Sound> = {};
    snds.forEach(s => sndMap[s.id] = s);
    setSounds(sndMap);
    setLibrarySounds(snds);

    // load buffers for used clips
    const newBuffers: Record<string, AudioBuffer> = {};
    for (const clip of st.clips) {
      if (sndMap[clip.soundId] && !newBuffers[clip.soundId]) {
        try {
          newBuffers[clip.soundId] = await decodeAudioBlob(sndMap[clip.soundId].audioBlob);
        } catch (e) {
          console.error("Failed to decode blob for", clip.soundId);
        }
      }
    }
    setBuffers(newBuffers);
    updateDuration(st);
  };

  const updateDuration = (st: SoundStory) => {
    let max = 10;
    st.clips.forEach(c => {
      const end = c.startTime + (c.trimEnd - c.trimStart);
      if (end > max) max = end;
    });
    setDuration(Math.max(10, max + 5));
  };

  const saveStory = useCallback(async (updatedStory: SoundStory) => {
    await db.saveStory(updatedStory);
    setStory(updatedStory);
    updateDuration(updatedStory);
  }, []);

  const stopPlayback = useCallback(() => {
    sourcesRef.current.forEach(s => {
      try { s.source.stop(); } catch(e){}
      clearTimeout(s.timeout);
    });
    sourcesRef.current = [];
    cancelAnimationFrame(playheadRafRef.current!);
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    if (!story) return;
    const ctx = getAudioContext();
    stopPlayback();

    const currentOffset = playheadTime;
    startTimeRef.current = ctx.currentTime - currentOffset;

    const newSources: typeof sourcesRef.current = [];

    story.clips.forEach(clip => {
      const buffer = buffers[clip.soundId];
      if (!buffer) return;

      const clipDuration = clip.trimEnd - clip.trimStart;
      const clipEndTime = clip.startTime + clipDuration;

      // if clip is already past, skip
      if (clipEndTime <= currentOffset) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gain = ctx.createGain();
      gain.gain.value = clip.volume;

      source.connect(gain);
      gain.connect(ctx.destination);

      let startWhen = 0;
      let offsetInClip = 0;

      if (clip.startTime > currentOffset) {
        // Starts in the future
        startWhen = ctx.currentTime + (clip.startTime - currentOffset);
        offsetInClip = clip.trimStart;
      } else {
        // Starts immediately, skipping part of the clip
        startWhen = ctx.currentTime;
        offsetInClip = clip.trimStart + (currentOffset - clip.startTime);
      }

      const durationToPlay = clip.trimEnd - offsetInClip;

      // rudimentary fades
      if (clip.fadeIn > 0 && offsetInClip < clip.trimStart + clip.fadeIn) {
        gain.gain.setValueAtTime(0, startWhen);
        gain.gain.linearRampToValueAtTime(clip.volume, startWhen + (clip.fadeIn - (offsetInClip - clip.trimStart)));
      }
      
      source.start(startWhen, offsetInClip, durationToPlay);

      newSources.push({ source, gain, timeout: 0 });
    });

    sourcesRef.current = newSources;
    setIsPlaying(true);

    const updatePlayhead = () => {
      const now = ctx.currentTime;
      const t = now - startTimeRef.current;
      setPlayheadTime(t);
      if (t >= duration) {
        stopPlayback();
        setPlayheadTime(0);
      } else {
        playheadRafRef.current = requestAnimationFrame(updatePlayhead);
      }
    };
    playheadRafRef.current = requestAnimationFrame(updatePlayhead);

  }, [story, buffers, playheadTime, duration, stopPlayback]);

  const togglePlayback = () => {
    if (isPlaying) stopPlayback();
    else startPlayback();
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    const t = x / PIXELS_PER_SECOND;
    setPlayheadTime(Math.max(0, Math.min(t, duration)));
    if (isPlaying) {
      stopPlayback();
      // setTimeout(() => startPlayback(), 50); // Optionally auto-restart
    }
  };

  const addClip = async (sound: Sound) => {
    if (!story) return;
    setIsLibraryOpen(false);

    // find first available track
    let track = 0;
    
    const newClip: SoundClip = {
      id: generateId(),
      soundId: sound.id,
      startTime: playheadTime,
      track: track,
      trimStart: sound.trimStart,
      trimEnd: sound.trimEnd,
      volume: 1.0,
      fadeIn: 0,
      fadeOut: 0
    };

    // Load buffer if not already loaded
    if (!buffers[sound.id]) {
      const buf = await decodeAudioBlob(sound.audioBlob);
      setBuffers(prev => ({ ...prev, [sound.id]: buf }));
    }

    const updated = { ...story, clips: [...story.clips, newClip], updatedAt: Date.now() };
    saveStory(updated);
  };

  const updateClip = (id: string, updates: Partial<SoundClip>) => {
    if (!story) return;
    const updated = {
      ...story,
      clips: story.clips.map(c => c.id === id ? { ...c, ...updates } : c),
      updatedAt: Date.now()
    };
    saveStory(updated);
    if (selectedClip && selectedClip.id === id) {
      setSelectedClip({ ...selectedClip, ...updates });
    }
  };

  const deleteClip = (id: string) => {
    if (!story) return;
    const updated = {
      ...story,
      clips: story.clips.filter(c => c.id !== id),
      updatedAt: Date.now()
    };
    saveStory(updated);
    setSelectedClip(null);
  };

  const renderWav = async () => {
    if (!story || story.clips.length === 0) return;
    toast({ title: "오디오 믹싱 중...", description: "잠시만 기다려주세요." });
    try {
      let maxTime = 0;
      story.clips.forEach(c => {
        const end = c.startTime + (c.trimEnd - c.trimStart);
        if (end > maxTime) maxTime = end;
      });
      
      const sampleRate = 44100;
      const offlineCtx = new OfflineAudioContext(2, sampleRate * maxTime, sampleRate);
      
      story.clips.forEach(clip => {
        const buffer = buffers[clip.soundId];
        if (!buffer) return;
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        const gain = offlineCtx.createGain();
        gain.gain.value = clip.volume;
        // Fades can be added here identically to startPlayback
        if (clip.fadeIn > 0) {
          gain.gain.setValueAtTime(0, clip.startTime);
          gain.gain.linearRampToValueAtTime(clip.volume, clip.startTime + clip.fadeIn);
        }
        if (clip.fadeOut > 0) {
          const fadeStart = clip.startTime + (clip.trimEnd - clip.trimStart) - clip.fadeOut;
          gain.gain.setValueAtTime(clip.volume, fadeStart);
          gain.gain.linearRampToValueAtTime(0, clip.startTime + (clip.trimEnd - clip.trimStart));
        }

        source.connect(gain);
        gain.connect(offlineCtx.destination);
        source.start(clip.startTime, clip.trimStart, clip.trimEnd - clip.trimStart);
      });

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = audioBufferToWav(renderedBuffer);
      
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${story.title}.wav`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({ title: "다운로드 완료", description: "WAV 파일이 생성되었습니다." });
    } catch (e) {
      console.error(e);
      toast({ title: "오류", description: "믹싱 중 문제가 발생했습니다.", variant: "destructive" });
    }
  };

  // Dragging logic for clips
  const [draggingClip, setDraggingClip] = useState<{ id: string, startX: number, startTrack: number, initialTime: number } | null>(null);

  const handleClipPointerDown = (e: React.PointerEvent, clip: SoundClip) => {
    e.stopPropagation();
    setSelectedClip(clip);
    setDraggingClip({
      id: clip.id,
      startX: e.clientX,
      startTrack: clip.track,
      initialTime: clip.startTime
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleClipPointerMove = (e: React.PointerEvent) => {
    if (!draggingClip) return;
    
    const dx = e.clientX - draggingClip.startX;
    const dt = dx / PIXELS_PER_SECOND;
    let newTime = Math.max(0, draggingClip.initialTime + dt);
    
    // basic track determination based on Y position inside container isn't reliable with pure dx/dy on pointer
    // For simplicity, we just allow dragging in X axis here.
    // If they want to change track, we can add up/down arrows in the editor dialog.
    
    updateClip(draggingClip.id, { startTime: newTime });
  };

  const handleClipPointerUp = (e: React.PointerEvent) => {
    if (draggingClip) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setDraggingClip(null);
    }
  };

  if (!story) return null;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background relative overflow-hidden">
      {/* Header */}
      <header className="h-[72px] flex items-center px-4 md:px-8 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-10">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/stories")} className="text-muted-foreground">
          <span className="material-symbols-rounded">arrow_back</span>
        </Button>
        <Input 
          value={story.title} 
          onChange={(e) => updateClip("title", { } as any) /* Just updating the title directly */} 
          onBlur={(e) => saveStory({ ...story, title: e.target.value })}
          className="flex-1 font-bold text-xl border-transparent bg-transparent shadow-none px-0 focus-visible:ring-0"
        />
        <Button variant="outline" size="sm" onClick={renderWav} className="hidden md:flex gap-2">
          <span className="material-symbols-rounded text-lg">download</span>
          WAV 내보내기
        </Button>
        <Button variant="outline" size="icon" onClick={renderWav} className="md:hidden">
          <span className="material-symbols-rounded">download</span>
        </Button>
      </header>

      {/* Main Timeline */}
      <main className="flex-1 overflow-auto flex flex-col relative select-none">
        
        {/* Toolbar */}
        <div className="sticky top-0 z-20 flex items-center px-4 py-2 bg-background/80 backdrop-blur-md border-b border-border justify-between">
          <div className="flex items-center gap-2">
            <Button size="icon" variant={isPlaying ? "secondary" : "default"} onClick={togglePlayback} className="rounded-2xl shadow-sm h-12 w-12">
              <span className="material-symbols-rounded text-3xl">{isPlaying ? 'pause' : 'play_arrow'}</span>
            </Button>
            <div className="text-xl font-mono ml-2 font-medium w-24">
              {formatTime(playheadTime)}
            </div>
          </div>
          
          <Button onClick={() => setIsLibraryOpen(true)} className="gap-1 rounded-xl shadow-sm bg-secondary text-secondary-foreground h-10 px-4 text-sm">
            <span className="material-symbols-rounded text-lg">add</span>
            소리 추가
          </Button>
        </div>

        {/* Tracks Container */}
        <div 
          ref={containerRef}
          className="relative flex-1 overflow-x-auto overflow-y-hidden bg-muted/30"
          onClick={handleTimelineClick}
        >
          <div 
            className="absolute top-0 bottom-0 min-h-full" 
            style={{ width: `${duration * PIXELS_PER_SECOND}px` }}
          >
            {/* Grid lines */}
            {Array.from({ length: Math.ceil(duration) }).map((_, i) => (
              <div 
                key={i} 
                className="absolute top-0 bottom-0 border-l border-border/50 text-[10px] text-muted-foreground/50 pl-1 pt-1 font-mono pointer-events-none"
                style={{ left: `${i * PIXELS_PER_SECOND}px` }}
              >
                {i}s
              </div>
            ))}

            {/* Tracks Backgrounds */}
            {Array.from({ length: NUM_TRACKS }).map((_, i) => (
              <div 
                key={`track-${i}`}
                className="absolute w-full border-b border-border/30"
                style={{ top: `${i * TRACK_HEIGHT}px`, height: `${TRACK_HEIGHT}px` }}
              />
            ))}

            {/* Clips */}
            {story.clips.map(clip => {
              const snd = sounds[clip.soundId];
              if (!snd) return null;
              
              const isSelected = selectedClip?.id === clip.id;
              const clipDuration = clip.trimEnd - clip.trimStart;
              const width = clipDuration * PIXELS_PER_SECOND;
              const left = clip.startTime * PIXELS_PER_SECOND;
              const top = clip.track * TRACK_HEIGHT + 8; // padding
              
              return (
                <div
                  key={clip.id}
                  className={cn(
                    "absolute h-[64px] rounded-xl flex items-center px-3 overflow-hidden cursor-grab shadow-sm transition-shadow border",
                    isSelected ? "bg-primary text-primary-foreground border-primary z-10 shadow-md ring-2 ring-primary/50" : "bg-card text-card-foreground border-border hover:border-primary/50"
                  )}
                  style={{ left: `${left}px`, width: `${width}px`, top: `${top}px` }}
                  onPointerDown={(e) => handleClipPointerDown(e, clip)}
                  onPointerMove={handleClipPointerMove}
                  onPointerUp={handleClipPointerUp}
                >
                  {/* Mock Waveform for visual */}
                  <div className="absolute inset-0 opacity-20 pointer-events-none flex items-center justify-around px-1 overflow-hidden">
                    {Array.from({length: Math.max(3, Math.floor(width/6))}).map((_, i) => (
                      <div key={i} className="w-[3px] bg-current rounded-full" style={{ height: `${20 + Math.random()*60}%` }}/>
                    ))}
                  </div>
                  <span className="relative z-10 font-medium text-sm truncate select-none pointer-events-none drop-shadow-sm">{snd.name}</span>
                </div>
              );
            })}

            {/* Playhead */}
            <div 
              className="absolute top-0 bottom-0 w-[2px] bg-destructive z-30 pointer-events-none shadow-[0_0_8px_rgba(255,0,0,0.5)]"
              style={{ left: `${playheadTime * PIXELS_PER_SECOND}px` }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-destructive rounded-full" />
            </div>
          </div>
        </div>
      </main>

      {/* Editor Sheet (simplified as a dialog) */}
      <Dialog open={!!selectedClip} onOpenChange={(o) => !o && setSelectedClip(null)}>
        <DialogContent className="sm:max-w-md bg-card border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle>클립 설정</DialogTitle>
          </DialogHeader>
          
          {selectedClip && (
            <div className="space-y-6 py-4">
              <div>
                <label className="text-sm font-medium mb-2 block text-muted-foreground">트랙 이동</label>
                <div className="flex gap-2">
                  {Array.from({ length: NUM_TRACKS }).map((_, i) => (
                    <Button 
                      key={i} 
                      variant={selectedClip.track === i ? "default" : "outline"}
                      className="flex-1 rounded-xl h-10"
                      onClick={() => updateClip(selectedClip.id, { track: i })}
                    >
                      {i + 1}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 flex justify-between text-muted-foreground">
                  <span>볼륨</span>
                  <span className="font-mono text-xs">{Math.round(selectedClip.volume * 100)}%</span>
                </label>
                <Slider 
                  min={0} max={2} step={0.1} 
                  value={selectedClip.volume} 
                  onChange={(e) => updateClip(selectedClip.id, { volume: parseFloat((e.target as HTMLInputElement).value) })} 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block text-muted-foreground">페이드 인 (초)</label>
                  <Input 
                    type="number" step="0.5" min="0" 
                    value={selectedClip.fadeIn} 
                    onChange={(e) => updateClip(selectedClip.id, { fadeIn: parseFloat(e.target.value) || 0 })} 
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block text-muted-foreground">페이드 아웃 (초)</label>
                  <Input 
                    type="number" step="0.5" min="0" 
                    value={selectedClip.fadeOut} 
                    onChange={(e) => updateClip(selectedClip.id, { fadeOut: parseFloat(e.target.value) || 0 })} 
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <Button variant="destructive" className="w-full rounded-xl" onClick={() => deleteClip(selectedClip.id)}>
                  이 클립 삭제
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Library Dialog */}
      <Dialog open={isLibraryOpen} onOpenChange={setIsLibraryOpen}>
        <DialogContent className="max-h-[80vh] flex flex-col bg-card border-none shadow-2xl rounded-3xl">
          <DialogHeader>
            <DialogTitle>소리 보관함에서 추가</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-3">
            {librarySounds.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                보관된 소리가 없습니다.
              </div>
            ) : (
              librarySounds.map(snd => (
                <div key={snd.id} className="flex items-center justify-between p-4 bg-background rounded-2xl border border-border shadow-sm">
                  <div className="font-medium truncate mr-4">{snd.name}</div>
                  <Button size="sm" onClick={() => addClip(snd)} className="shrink-0 rounded-xl px-4">
                    추가
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
