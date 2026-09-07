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
const TRACK_HEIGHT = 100; // Increased track height for chunkier blocks
const NUM_TRACKS = 4;

const getBlockColor = (trackIndex: number) => {
  const colors = [
    { bg: 'hsl(21, 100%, 61%)', border: 'hsl(21, 100%, 45%)', text: '#FFF' }, // Orange
    { bg: 'hsl(165, 70%, 45%)', border: 'hsl(165, 70%, 30%)', text: '#FFF' }, // Mint
    { bg: 'hsl(48, 100%, 55%)', border: 'hsl(48, 100%, 40%)', text: '#000' }, // Yellow
    { bg: 'hsl(330, 100%, 70%)', border: 'hsl(330, 100%, 55%)', text: '#FFF' }, // Pink
  ];
  return colors[trackIndex % colors.length];
};

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
        startWhen = ctx.currentTime + (clip.startTime - currentOffset);
        offsetInClip = clip.trimStart;
      } else {
        startWhen = ctx.currentTime;
        offsetInClip = clip.trimStart + (currentOffset - clip.startTime);
      }

      const durationToPlay = clip.trimEnd - offsetInClip;

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
    }
  };

  const addClip = async (sound: Sound) => {
    if (!story) return;
    setIsLibraryOpen(false);

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
      <header className="h-[80px] flex items-center px-4 md:px-8 border-b-4 border-border bg-card shrink-0 gap-4 shadow-sm z-10">
        <Button size="icon" onClick={() => setLocation("/stories")} className="bg-muted text-muted-foreground hover:bg-muted/80 rounded-[1rem] shadow-[0_4px_0_0_rgba(0,0,0,0.1)] active:shadow-none active:translate-y-[4px] transition-all">
          <span className="material-symbols-rounded text-2xl">arrow_back</span>
        </Button>
        <Input 
          value={story.title} 
          onChange={(e) => setStory({ ...story, title: e.target.value })}
          onBlur={(e) => saveStory({ ...story, title: e.target.value, updatedAt: Date.now() })}
          className="flex-1 font-black text-2xl md:text-3xl border-2 border-transparent hover:border-border focus:border-primary bg-transparent focus:bg-muted/30 shadow-none px-4 rounded-2xl h-14 transition-all focus-visible:ring-0"
        />
        <Button onClick={renderWav} className="hidden md:flex gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-[1.25rem] h-12 px-6 shadow-[0_4px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[4px] transition-all font-bold">
          <span className="material-symbols-rounded text-xl">download</span>
          WAV 저장
        </Button>
        <Button size="icon" onClick={renderWav} className="md:hidden bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-[1rem] h-12 w-12 shadow-[0_4px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[4px] transition-all">
          <span className="material-symbols-rounded text-2xl">download</span>
        </Button>
      </header>

      {/* Main Timeline */}
      <main className="flex-1 overflow-auto flex flex-col relative select-none bg-muted/40">
        
        {/* Toolbar */}
        <div className="sticky top-0 z-20 flex items-center px-4 py-3 bg-background/90 backdrop-blur-md border-b-2 border-border/50 justify-between">
          <div className="flex items-center gap-4">
            <Button size="icon" onClick={togglePlayback} className={cn(
              "rounded-[1.25rem] h-14 w-14 transition-all shadow-[0_4px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[4px]",
              isPlaying ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-0.5"
            )}>
              <span className="material-symbols-rounded text-3xl">{isPlaying ? 'pause' : 'play_arrow'}</span>
            </Button>
            <div className="text-2xl font-mono font-black w-24 text-foreground/80 drop-shadow-sm">
              {formatTime(playheadTime)}
            </div>
          </div>
          
          <Button onClick={() => setIsLibraryOpen(true)} className="gap-2 rounded-[1.25rem] bg-accent text-accent-foreground hover:bg-accent/90 h-12 px-5 font-bold shadow-[0_4px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[4px] transition-all">
            <span className="material-symbols-rounded text-2xl">add_circle</span>
            소리 추가
          </Button>
        </div>

        {/* Tracks Container */}
        <div 
          ref={containerRef}
          className="relative flex-1 overflow-x-auto overflow-y-hidden"
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
                className="absolute top-0 bottom-0 border-l-2 border-border/40 text-[12px] text-muted-foreground/60 pl-1.5 pt-1.5 font-mono font-bold pointer-events-none"
                style={{ left: `${i * PIXELS_PER_SECOND}px` }}
              >
                {i}s
              </div>
            ))}

            {/* Tracks Backgrounds */}
            {Array.from({ length: NUM_TRACKS }).map((_, i) => (
              <div 
                key={`track-${i}`}
                className="absolute w-full flex flex-col justify-center px-2"
                style={{ top: `${i * TRACK_HEIGHT}px`, height: `${TRACK_HEIGHT}px` }}
              >
                {/* Visual groove for tracks like a toy rail */}
                <div 
                  className="w-full bg-black/5 rounded-3xl border-y-2 border-black/5 shadow-inner" 
                  style={{ height: TRACK_HEIGHT - 20, marginTop: 10 }} 
                />
              </div>
            ))}

            {/* Clips */}
            {story.clips.map(clip => {
              const snd = sounds[clip.soundId];
              if (!snd) return null;
              
              const isSelected = selectedClip?.id === clip.id;
              const clipDuration = clip.trimEnd - clip.trimStart;
              const width = clipDuration * PIXELS_PER_SECOND;
              const left = clip.startTime * PIXELS_PER_SECOND;
              const top = clip.track * TRACK_HEIGHT + 10;
              
              const blockStyle = getBlockColor(clip.track);
              
              return (
                <div
                  key={clip.id}
                  className={cn(
                    "absolute rounded-2xl flex items-center px-4 overflow-hidden cursor-grab active:cursor-grabbing transition-transform",
                    isSelected ? "z-20 scale-105" : "hover:-translate-y-0.5 z-10"
                  )}
                  style={{ 
                    left: `${left}px`, 
                    width: `${width}px`, 
                    top: `${top}px`, 
                    height: `${TRACK_HEIGHT - 20}px`,
                    backgroundColor: blockStyle.bg,
                    borderBottom: `6px solid ${blockStyle.border}`,
                    borderLeft: `2px solid ${blockStyle.border}`,
                    borderRight: `2px solid ${blockStyle.border}`,
                    borderTop: `2px solid rgba(255,255,255,0.4)`,
                    color: blockStyle.text,
                    boxShadow: isSelected ? `0 12px 24px rgba(0,0,0,0.2)` : `0 4px 8px rgba(0,0,0,0.1)`
                  }}
                  onPointerDown={(e) => handleClipPointerDown(e, clip)}
                  onPointerMove={handleClipPointerMove}
                  onPointerUp={handleClipPointerUp}
                >
                  <div className="absolute inset-0 opacity-20 pointer-events-none flex items-center justify-around px-2">
                    {Array.from({length: Math.max(3, Math.floor(width/8))}).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-current rounded-full"
                        style={{ height: `${30 + Math.abs(Math.sin(i * 12.9898 + clip.id.length)) * 50}%` }}
                      />
                    ))}
                  </div>
                  <span className="relative z-10 font-bold text-sm md:text-base truncate select-none pointer-events-none drop-shadow-sm">{snd.name}</span>
                </div>
              );
            })}

            {/* Playhead */}
            <div 
              className="absolute top-0 bottom-0 w-[4px] bg-destructive z-30 pointer-events-none shadow-[0_0_12px_rgba(255,0,0,0.4)]"
              style={{ left: `${playheadTime * PIXELS_PER_SECOND}px` }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-6 bg-destructive rounded-full border-2 border-white shadow-sm" />
            </div>
          </div>
        </div>
      </main>

      {/* Editor Dialog */}
      <Dialog open={!!selectedClip} onOpenChange={(o) => !o && setSelectedClip(null)}>
        <DialogContent className="sm:max-w-md bg-card border-4 border-border shadow-2xl rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">블록 설정</DialogTitle>
          </DialogHeader>
          
          {selectedClip && (
            <div className="space-y-8 py-4">
              <div>
                <label className="text-base font-bold mb-3 block text-foreground">트랙 이동</label>
                <div className="flex gap-3">
                  {Array.from({ length: NUM_TRACKS }).map((_, i) => {
                     const style = getBlockColor(i);
                     const isActive = selectedClip.track === i;
                     return (
                      <Button 
                        key={i} 
                        className={cn(
                          "flex-1 rounded-[1rem] h-14 font-black text-xl transition-all shadow-[0_4px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[4px]",
                          isActive ? "opacity-100 -translate-y-1" : "opacity-60 hover:opacity-100"
                        )}
                        style={{
                          backgroundColor: style.bg,
                          borderBottomColor: style.border,
                          borderBottomWidth: isActive ? '0px' : '4px',
                          color: style.text,
                          transform: isActive ? 'translateY(4px)' : 'none',
                          boxShadow: isActive ? 'none' : '0 4px 0 0 rgba(0,0,0,0.15)'
                        }}
                        onClick={() => updateClip(selectedClip.id, { track: i })}
                      >
                        {i + 1}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-base font-bold mb-3 flex justify-between text-foreground">
                  <span>소리 크기</span>
                  <span className="font-mono">{Math.round(selectedClip.volume * 100)}%</span>
                </label>
                <Slider 
                  min={0} max={2} step={0.1} 
                  value={selectedClip.volume} 
                  onChange={(e) => updateClip(selectedClip.id, { volume: parseFloat((e.target as HTMLInputElement).value) })} 
                  className="py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 p-4 rounded-2xl border-2 border-border">
                  <label className="text-sm font-bold mb-2 block text-muted-foreground">서서히 커지기 (초)</label>
                  <Input 
                    type="number" step="0.5" min="0" 
                    value={selectedClip.fadeIn} 
                    onChange={(e) => updateClip(selectedClip.id, { fadeIn: parseFloat(e.target.value) || 0 })} 
                    className="font-mono text-lg bg-card border-2 shadow-inner rounded-xl h-12"
                  />
                </div>
                <div className="bg-muted/50 p-4 rounded-2xl border-2 border-border">
                  <label className="text-sm font-bold mb-2 block text-muted-foreground">서서히 작아지기 (초)</label>
                  <Input 
                    type="number" step="0.5" min="0" 
                    value={selectedClip.fadeOut} 
                    onChange={(e) => updateClip(selectedClip.id, { fadeOut: parseFloat(e.target.value) || 0 })} 
                    className="font-mono text-lg bg-card border-2 shadow-inner rounded-xl h-12"
                  />
                </div>
              </div>

              <div className="pt-6">
                <Button className="w-full rounded-[1.25rem] h-14 bg-destructive hover:bg-destructive/90 text-white font-bold text-lg shadow-[0_4px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[4px] transition-all" onClick={() => deleteClip(selectedClip.id)}>
                  이 블록 지우기
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Library Dialog */}
      <Dialog open={isLibraryOpen} onOpenChange={setIsLibraryOpen}>
        <DialogContent className="max-h-[85vh] flex flex-col bg-card border-4 border-border shadow-2xl rounded-[2.5rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">소리 보관함</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-4 pb-4">
            {librarySounds.length === 0 ? (
              <div className="text-center text-muted-foreground py-12 font-bold bg-muted/30 rounded-3xl border-2 border-dashed border-border/50">
                보관된 소리가 없습니다.
              </div>
            ) : (
              librarySounds.map(snd => (
                <div key={snd.id} className="flex items-center justify-between p-4 md:p-5 bg-card rounded-2xl border-2 border-border shadow-[0_4px_0_0_rgba(0,0,0,0.05)] hover:-translate-y-0.5 transition-transform">
                  <div className="font-bold text-lg truncate mr-4">{snd.name}</div>
                  <Button onClick={() => addClip(snd)} className="shrink-0 rounded-[1rem] px-5 bg-primary text-white font-bold shadow-[0_4px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[4px] transition-all h-10">
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
