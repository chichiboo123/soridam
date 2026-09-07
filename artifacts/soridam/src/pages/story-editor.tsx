import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { db, type Sound, type SoundStory, type SoundClip } from "@/lib/db";
import { generateId, formatTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getAudioContext, decodeAudioBlob, audioBufferToWav } from "@/lib/audio";

const PIXELS_PER_SECOND = 60;
const TRACK_HEIGHT = 64;
const GUTTER_WIDTH = 64;

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
  const [duration, setDuration] = useState(10);
  const [trackCount, setTrackCount] = useState(1);

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [librarySounds, setLibrarySounds] = useState<Sound[]>([]);
  
  const [selectedClip, setSelectedClip] = useState<SoundClip | null>(null);

  const sourcesRef = useRef<{ source: AudioBufferSourceNode, gain: GainNode, timeout: number }[]>([]);
  const playheadRafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingClip, setDraggingClip] = useState<{ id: string, startX: number, startY: number, startTrack: number, initialTime: number } | null>(null);

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
    const inferredTrackCount = Math.max(
      1,
      ...st.clips.map((clip) => clip.track + 1),
    );
    const normalizedStory = {
      ...st,
      trackCount: Math.max(st.trackCount ?? inferredTrackCount, inferredTrackCount),
    };
    setStory(normalizedStory);
    setTrackCount(normalizedStory.trackCount);

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
    updateDuration(normalizedStory);
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

  const addTrack = () => {
    if (!story) return;
    const newCount = trackCount + 1;
    setTrackCount(newCount);
    saveStory({ ...story, trackCount: newCount, updatedAt: Date.now() });
  };

  const removeTrack = () => {
    if (!story || trackCount <= 1) return;
    const lastTrack = trackCount - 1;
    const hasClips = story.clips.some(c => c.track === lastTrack);
    if (hasClips) {
      toast({ title: "삭제 불가", description: "마지막 트랙에 소리 블록이 있습니다.", variant: "destructive" });
      return;
    }
    const newCount = trackCount - 1;
    setTrackCount(newCount);
    saveStory({ ...story, trackCount: newCount, updatedAt: Date.now() });
  };

  const stopPlayback = useCallback(() => {
    sourcesRef.current.forEach(s => {
      try { s.source.stop(); } catch(e){}
      clearTimeout(s.timeout);
    });
    sourcesRef.current = [];
    if (playheadRafRef.current) {
      cancelAnimationFrame(playheadRafRef.current);
    }
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

  const handleTimelinePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft - GUTTER_WIDTH;
    
    // Don't seek if clicking on the gutter
    if (x < 0) return;

    const t = x / PIXELS_PER_SECOND;
    setPlayheadTime(Math.max(0, Math.min(t, duration)));
    if (isPlaying) {
      stopPlayback();
    }
    setSelectedClip(null);
  };

  const addClip = async (sound: Sound) => {
    if (!story) return;
    setIsLibraryOpen(false);

    // Find the first track that is empty at playheadTime, or default to track 0
    let targetTrack = 0;
    for (let i = 0; i < trackCount; i++) {
      const hasOverlap = story.clips.some(c => 
        c.track === i && 
        (playheadTime < c.startTime + (c.trimEnd - c.trimStart)) && 
        (playheadTime + (sound.trimEnd - sound.trimStart) > c.startTime)
      );
      if (!hasOverlap) {
        targetTrack = i;
        break;
      }
    }

    const newClip: SoundClip = {
      id: generateId(),
      soundId: sound.id,
      startTime: playheadTime,
      track: targetTrack,
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

  const updateClip = (id: string, updates: Partial<SoundClip>, persist = true) => {
    if (!story) return;
    const updated = {
      ...story,
      clips: story.clips.map(c => c.id === id ? { ...c, ...updates } : c),
      updatedAt: Date.now()
    };
    
    if (persist) {
      saveStory(updated);
    } else {
      setStory(updated);
      updateDuration(updated);
    }
    
    if (selectedClip && selectedClip.id === id) {
      setSelectedClip(prev => prev ? { ...prev, ...updates } : null);
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

  const handleClipPointerDown = (e: React.PointerEvent, clip: SoundClip) => {
    e.stopPropagation();
    setSelectedClip(clip);
    setDraggingClip({
      id: clip.id,
      startX: e.clientX,
      startY: e.clientY,
      startTrack: clip.track,
      initialTime: clip.startTime
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleClipPointerMove = (e: React.PointerEvent) => {
    if (!draggingClip) return;
    const dx = e.clientX - draggingClip.startX;
    const dy = e.clientY - draggingClip.startY;
    const dt = dx / PIXELS_PER_SECOND;
    
    const newTime = Math.max(0, draggingClip.initialTime + dt);
    const newTrack = Math.max(0, Math.min(trackCount - 1, draggingClip.startTrack + Math.round(dy / TRACK_HEIGHT)));
    
    updateClip(draggingClip.id, { startTime: newTime, track: newTrack }, false);
  };

  const handleClipPointerUp = (e: React.PointerEvent) => {
    if (draggingClip) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      const clip = story?.clips.find(c => c.id === draggingClip.id);
      if (clip) {
        updateClip(draggingClip.id, { startTime: clip.startTime, track: clip.track }, true);
      }
      setDraggingClip(null);
    }
  };

  const setFade = (type: 'fadeIn' | 'fadeOut', value: number) => {
    if (!selectedClip) return;
    const clipDuration = selectedClip.trimEnd - selectedClip.trimStart;
    const currentVal = selectedClip[type];
    const otherVal = type === 'fadeIn' ? selectedClip.fadeOut : selectedClip.fadeIn;
    const maxValue = Math.max(0, Math.floor(clipDuration - otherVal));
    const newVal = Math.min(maxValue, Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)));
    
    if (newVal !== currentVal) {
      updateClip(selectedClip.id, { [type]: newVal });
    }
  };

  const adjustFade = (type: 'fadeIn' | 'fadeOut', amount: number) => {
    if (!selectedClip) return;
    setFade(type, selectedClip[type] + amount);
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

  if (!story) return null;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background relative overflow-hidden">
      {/* Header */}
      <header className="h-[72px] md:h-[80px] flex items-center px-4 md:px-8 border-b-4 border-border bg-card shrink-0 gap-3 md:gap-4 z-10">
        <Button size="icon" onClick={() => setLocation("/stories")} className="bg-muted text-muted-foreground hover:bg-muted/80 rounded-xl md:rounded-2xl shadow-[0_4px_0_0_rgba(0,0,0,0.1)] active:shadow-none active:translate-y-[4px] transition-all h-10 w-10 md:h-12 md:w-12">
          <span className="material-symbols-rounded text-xl md:text-2xl">arrow_back</span>
        </Button>
        <Input 
          value={story.title} 
          onChange={(e) => setStory({ ...story, title: e.target.value })}
          onBlur={(e) => saveStory({ ...story, title: e.target.value, updatedAt: Date.now() })}
          className="flex-1 font-black text-xl md:text-2xl border-2 border-transparent hover:border-border focus:border-primary bg-transparent focus:bg-muted/30 shadow-none px-3 md:px-4 rounded-xl md:rounded-2xl h-10 md:h-12 transition-all focus-visible:ring-0"
        />
        <Button onClick={renderWav} className="hidden md:flex gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-2xl h-12 px-6 shadow-[0_4px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[4px] transition-all font-bold">
          <span className="material-symbols-rounded text-xl">download</span>
          음원 저장
        </Button>
        <Button size="icon" onClick={renderWav} className="md:hidden bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-xl h-10 w-10 shadow-[0_4px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[4px] transition-all">
          <span className="material-symbols-rounded text-xl">download</span>
        </Button>
      </header>

      {/* Main Container */}
      <main className="flex-1 overflow-hidden flex flex-col md:flex-row relative bg-muted/30">
        
        {/* Timeline Area */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          
          <div className="shrink-0 flex items-center px-4 py-3 bg-card border-b-2 border-border/50 justify-between z-20">
            <div className="flex items-center gap-4">
              <Button size="icon" onClick={togglePlayback} className={cn(
                "rounded-2xl h-12 w-12 transition-all shadow-[0_4px_0_0_rgba(0,0,0,0.1)] active:shadow-none active:translate-y-[4px]",
                isPlaying ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}>
                <span className="material-symbols-rounded text-2xl">{isPlaying ? 'pause' : 'play_arrow'}</span>
              </Button>
              <div className="text-xl md:text-2xl font-mono font-black w-20 text-foreground drop-shadow-sm">
                {formatTime(playheadTime)}
              </div>
            </div>
            
            <div className="flex items-center gap-2 md:gap-3">
              <Button variant="outline" onClick={removeTrack} disabled={trackCount <= 1} className="hidden md:flex gap-1 rounded-2xl h-12 px-4 font-bold border-2 shadow-sm active:translate-y-[2px]">
                <span className="material-symbols-rounded text-lg">remove</span>
                트랙 지우기
              </Button>
              <Button variant="outline" onClick={addTrack} className="hidden md:flex gap-1 rounded-2xl h-12 px-4 font-bold border-2 shadow-sm active:translate-y-[2px]">
                <span className="material-symbols-rounded text-lg">add</span>
                트랙 추가
              </Button>
              
              {/* Mobile Track Controls */}
              <Button variant="outline" size="icon" onClick={removeTrack} disabled={trackCount <= 1} className="md:hidden rounded-xl h-10 w-10 border-2 shadow-sm active:translate-y-[2px]">
                <span className="material-symbols-rounded text-lg">remove</span>
              </Button>
              <Button variant="outline" size="icon" onClick={addTrack} className="md:hidden rounded-xl h-10 w-10 border-2 shadow-sm active:translate-y-[2px]">
                <span className="material-symbols-rounded text-lg">add</span>
              </Button>

              <Button onClick={() => setIsLibraryOpen(true)} className="gap-2 rounded-2xl bg-accent text-accent-foreground hover:bg-accent/90 h-12 px-5 font-bold shadow-[0_4px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[4px] transition-all ml-1 md:ml-2">
                <span className="material-symbols-rounded text-xl">add_circle</span>
                소리 추가
              </Button>
            </div>
          </div>

          <div 
            ref={containerRef}
            className="relative flex-1 overflow-x-auto overflow-y-auto custom-scrollbar"
            onPointerDown={handleTimelinePointerDown}
          >
            <div 
              className="absolute top-0 bottom-0 min-w-full" 
              style={{ 
                width: `${Math.max(100, duration * PIXELS_PER_SECOND) + GUTTER_WIDTH}px`,
                height: `${trackCount * TRACK_HEIGHT + 40}px` 
              }}
            >
              {/* Sticky Gutter Container */}
              <div className="sticky left-0 z-30 h-full top-0 w-[64px] bg-card border-r-2 border-border/50 shadow-[4px_0_12px_rgba(0,0,0,0.02)] pt-[40px] pointer-events-none">
                {Array.from({ length: trackCount }).map((_, i) => {
                  const style = getBlockColor(i);
                  return (
                    <div 
                      key={`track-num-${i}`}
                      className="absolute flex items-center justify-center w-8 h-8 rounded-lg font-black text-sm shadow-sm bg-card left-1/2 -translate-x-1/2"
                      style={{ 
                        top: i * TRACK_HEIGHT + 40 + TRACK_HEIGHT / 2 - 16, 
                        color: style.bg,
                        border: `2px solid ${style.bg}`
                      }}
                    >
                      {i + 1}
                    </div>
                  );
                })}
              </div>

              {/* Empty Timeline Guide */}
              {story.clips.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10" style={{ left: GUTTER_WIDTH, top: 40 }}>
                  <div className="bg-card p-6 md:p-8 rounded-3xl border-4 border-dashed border-border/60 shadow-sm flex flex-col items-center gap-4 pointer-events-auto text-center max-w-sm mx-4">
                    <span className="material-symbols-rounded text-5xl text-primary/40">waving_hand</span>
                    <div>
                      <h3 className="text-xl font-black text-foreground mb-2">타임라인이 비어있어요!</h3>
                      <p className="text-muted-foreground font-bold text-sm">오른쪽 위 <strong className="text-accent-foreground bg-accent px-2 py-0.5 rounded-md">소리 추가</strong> 버튼을 눌러<br/>이야기를 시작해보세요.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Timeline Content */}
              <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${GUTTER_WIDTH}px`, right: 0 }}>
                {/* Grid lines */}
                {Array.from({ length: Math.ceil(duration) }).map((_, i) => (
                  <div 
                    key={i} 
                    className="absolute top-0 bottom-0 border-l border-border/60 text-[10px] text-muted-foreground/60 pl-1 pt-1 font-mono font-bold z-0"
                    style={{ left: `${i * PIXELS_PER_SECOND}px` }}
                  >
                    {i}s
                  </div>
                ))}

                {/* Track Backgrounds */}
                {Array.from({ length: trackCount }).map((_, i) => (
                  <div 
                    key={`track-${i}`}
                    className="absolute w-full flex flex-col justify-center z-0"
                    style={{ top: `${i * TRACK_HEIGHT + 40}px`, height: `${TRACK_HEIGHT}px` }}
                  >
                    <div 
                      className="w-full bg-black/[0.02] dark:bg-white/[0.02] rounded-r-xl border-y border-black/[0.04] dark:border-white/[0.04]" 
                      style={{ height: TRACK_HEIGHT - 12 }} 
                    />
                  </div>
                ))}
              </div>

              {/* Clips */}
              {story.clips.map(clip => {
                const snd = sounds[clip.soundId];
                if (!snd) return null;
                
                const isSelected = selectedClip?.id === clip.id;
                const clipDuration = clip.trimEnd - clip.trimStart;
                const width = clipDuration * PIXELS_PER_SECOND;
                const left = GUTTER_WIDTH + clip.startTime * PIXELS_PER_SECOND;
                const top = 40 + clip.track * TRACK_HEIGHT + 6;
                const blockHeight = TRACK_HEIGHT - 12;
                
                const blockStyle = getBlockColor(clip.track);
                
                return (
                  <div
                    key={clip.id}
                    className={cn(
                      "absolute rounded-md flex items-center px-2 overflow-hidden cursor-grab active:cursor-grabbing transition-shadow group",
                      isSelected ? "z-20 ring-2 ring-primary ring-offset-2 ring-offset-background" : "z-10"
                    )}
                    style={{ 
                      left: `${left}px`, 
                      width: `${Math.max(20, width)}px`, 
                      top: `${top}px`, 
                      height: `${blockHeight}px`,
                      backgroundColor: blockStyle.bg,
                      borderBottom: `4px solid ${blockStyle.border}`,
                      borderLeft: `1px solid ${blockStyle.border}`,
                      borderRight: `1px solid ${blockStyle.border}`,
                      borderTop: `2px solid rgba(255,255,255,0.4)`,
                      color: blockStyle.text,
                      boxShadow: isSelected ? `0 8px 16px rgba(0,0,0,0.2)` : `0 2px 4px rgba(0,0,0,0.1)`
                    }}
                    onPointerDown={(e) => handleClipPointerDown(e, clip)}
                    onPointerMove={handleClipPointerMove}
                    onPointerUp={handleClipPointerUp}
                  >
                    {/* Inner highlight logic without breaking border top */}
                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 pointer-events-none transition-colors" />

                    <div className="absolute inset-0 opacity-20 pointer-events-none flex items-center justify-around px-1 overflow-hidden">
                      {Array.from({length: Math.max(2, Math.floor(width/12))}).map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-current shrink-0"
                          style={{ height: `${30 + Math.abs(Math.sin(i * 12.9898 + clip.id.length)) * 40}%` }}
                        />
                      ))}
                    </div>
                    <span className="relative z-10 font-bold text-xs md:text-sm truncate select-none pointer-events-none drop-shadow-sm w-full text-center">
                      {snd.name}
                    </span>
                  </div>
                );
              })}

              {/* Playhead */}
              <div 
                className="absolute top-[40px] bottom-0 w-[2px] bg-destructive z-40 pointer-events-none shadow-[0_0_8px_rgba(255,0,0,0.4)] transition-transform duration-75"
                style={{ left: `${GUTTER_WIDTH + playheadTime * PIXELS_PER_SECOND}px` }}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 bg-destructive rounded-full border-2 border-background shadow-sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Inspector Panel */}
        <div className={cn(
          "bg-card border-border shrink-0 flex flex-col transition-all duration-300 ease-in-out z-30",
          "md:w-[320px] lg:w-[360px] md:h-full md:border-l-4 md:border-t-0",
          "w-full border-t-4 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] md:shadow-none relative",
          selectedClip ? "h-[380px] md:h-full" : "h-[80px] md:h-full"
        )}>
          <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
            {selectedClip ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-xl text-foreground">블록 설정</h3>
                  <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 rounded-full bg-muted/50" onClick={() => setSelectedClip(null)}>
                    <span className="material-symbols-rounded text-xl">close</span>
                  </Button>
                </div>
                
                <div>
                  <label className="text-sm font-bold mb-3 block text-muted-foreground">트랙 이동</label>
                  <div className="flex gap-2 flex-wrap">
                    {Array.from({ length: trackCount }).map((_, i) => {
                       const style = getBlockColor(i);
                       const isActive = selectedClip.track === i;
                       return (
                        <Button 
                          key={i} 
                          className={cn(
                            "w-12 rounded-xl h-12 font-black text-lg transition-all active:translate-y-[2px]",
                            isActive ? "opacity-100 -translate-y-1" : "opacity-60 hover:opacity-100"
                          )}
                          style={{
                            backgroundColor: style.bg,
                            borderBottomColor: style.border,
                            borderBottomWidth: isActive ? '0px' : '3px',
                            color: style.text,
                            transform: isActive ? 'translateY(3px)' : 'none',
                            boxShadow: isActive ? 'none' : '0 3px 0 0 rgba(0,0,0,0.15)'
                          }}
                          onClick={() => updateClip(selectedClip.id, { track: i })}
                        >
                          {i + 1}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold flex justify-between text-muted-foreground">
                    <span>소리 크기</span>
                    <span className="font-mono text-foreground">{Math.round(selectedClip.volume * 100)}%</span>
                  </label>
                  <Slider 
                    min={0} max={2} step={0.1} 
                    value={selectedClip.volume} 
                    onChange={(e) => updateClip(selectedClip.id, { volume: parseFloat((e.target as HTMLInputElement).value) })} 
                    className="py-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/40 p-3 rounded-xl border border-border/50 flex flex-col gap-2">
                    <label className="text-xs font-bold text-muted-foreground">서서히 커지기 (초)</label>
                    <div className="flex items-center gap-1.5">
                      <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg active:translate-y-1" onClick={() => adjustFade('fadeIn', -1)} aria-label="1초 줄이기" disabled={selectedClip.fadeIn <= 0}>
                        <span className="material-symbols-rounded text-lg">remove</span>
                      </Button>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={selectedClip.fadeIn}
                        onChange={(e) => setFade('fadeIn', Number(e.target.value))}
                        aria-label="서서히 커지는 시간(초)"
                        className="h-8 min-w-0 px-1 text-center font-mono font-bold text-sm rounded-lg"
                      />
                      <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg active:translate-y-1" onClick={() => adjustFade('fadeIn', 1)} aria-label="1초 늘리기" disabled={selectedClip.fadeIn + selectedClip.fadeOut >= (selectedClip.trimEnd - selectedClip.trimStart)}>
                        <span className="material-symbols-rounded text-lg">add</span>
                      </Button>
                    </div>
                  </div>
                  <div className="bg-muted/40 p-3 rounded-xl border border-border/50 flex flex-col gap-2">
                    <label className="text-xs font-bold text-muted-foreground">서서히 작아지기 (초)</label>
                    <div className="flex items-center gap-1.5">
                      <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg active:translate-y-1" onClick={() => adjustFade('fadeOut', -1)} aria-label="1초 줄이기" disabled={selectedClip.fadeOut <= 0}>
                        <span className="material-symbols-rounded text-lg">remove</span>
                      </Button>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={selectedClip.fadeOut}
                        onChange={(e) => setFade('fadeOut', Number(e.target.value))}
                        aria-label="서서히 작아지는 시간(초)"
                        className="h-8 min-w-0 px-1 text-center font-mono font-bold text-sm rounded-lg"
                      />
                      <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg active:translate-y-1" onClick={() => adjustFade('fadeOut', 1)} aria-label="1초 늘리기" disabled={selectedClip.fadeIn + selectedClip.fadeOut >= (selectedClip.trimEnd - selectedClip.trimStart)}>
                        <span className="material-symbols-rounded text-lg">add</span>
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button variant="destructive" className="w-full rounded-xl h-12 font-bold shadow-[0_4px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[4px] transition-all" onClick={() => deleteClip(selectedClip.id)}>
                    이 블록 지우기
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-60">
                 <span className="material-symbols-rounded text-4xl mb-1 md:text-5xl hidden md:block">touch_app</span>
                 <p className="font-bold text-sm md:text-lg text-foreground">블록을 선택하여 편집하세요</p>
                 <p className="text-xs md:text-sm font-medium hidden md:block">빈 공간을 누르면 재생 위치가 이동합니다.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Library Dialog */}
      <Dialog open={isLibraryOpen} onOpenChange={setIsLibraryOpen}>
        <DialogContent className="max-h-[85vh] flex flex-col bg-card border-4 border-border shadow-2xl rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">소리 보관함</DialogTitle>
            <DialogDescription className="pr-10 text-base">이야기에 넣을 소리를 골라주세요.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-3 pb-4 custom-scrollbar">
            {librarySounds.length === 0 ? (
              <div className="text-center text-muted-foreground py-12 font-bold bg-muted/30 rounded-2xl border-2 border-dashed border-border/50">
                보관된 소리가 없습니다.
              </div>
            ) : (
              librarySounds.map(snd => (
                <div key={snd.id} className="flex items-center justify-between p-3 md:p-4 bg-card rounded-xl border-2 border-border shadow-sm hover:border-primary/50 transition-colors">
                  <div className="font-bold text-base truncate mr-4">{snd.name}</div>
                  <Button onClick={() => addClip(snd)} size="sm" className="shrink-0 rounded-lg px-4 font-bold shadow-[0_2px_0_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[2px] transition-all">
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
