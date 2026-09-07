import * as React from "react";
import { cn, formatTime } from "@/lib/utils";

interface TrimSliderProps {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime?: number;
  onChange: (start: number, end: number) => void;
  onSeek?: (time: number) => void;
  className?: string;
}

export function TrimSlider({ duration, trimStart, trimEnd, currentTime = trimStart, onChange, onSeek, className }: TrimSliderProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState<'start' | 'end' | null>(null);

  // Generate a stable pseudorandom waveform based on duration length so it feels natural but consistent
  const waveform = React.useMemo(() => {
    const bars = 80;
    const res = [];
    for (let i = 0; i < bars; i++) {
      const x = i / bars;
      const env = Math.sin(x * Math.PI); 
      const noise = (Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1; 
      const val = Math.abs(noise) * 0.6 + 0.3; 
      res.push(Math.max(0.1, env * val));
    }
    return res;
  }, []);

  const handlePointerDown = (e: React.PointerEvent, handle: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(handle);
  };

  const handleContainerPointerDown = (e: React.PointerEvent) => {
    if (isDragging || !containerRef.current || !onSeek) return;
    const rect = containerRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(percent * duration);
  };

  React.useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newValue = percent * duration;

      if (isDragging === 'start') {
        onChange(Math.min(newValue, trimEnd - 0.1), trimEnd);
      } else {
        onChange(trimStart, Math.max(newValue, trimStart + 0.1));
      }
    };

    const handlePointerUp = () => {
      setIsDragging(null);
    };

    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, duration, trimStart, trimEnd, onChange]);

  const startPercent = (trimStart / duration) * 100 || 0;
  const endPercent = (trimEnd / duration) * 100 || 100;
  const playheadPercent = (currentTime / duration) * 100 || 0;

  return (
    <div className={cn("w-full select-none touch-none flex flex-col gap-3", className)}>
      {/* Header Info */}
      <div className="flex justify-between text-xs font-bold text-muted-foreground font-mono px-1">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
      
      {/* Timeline container */}
      <div 
        ref={containerRef}
        className="relative h-24 md:h-28 bg-card rounded-2xl overflow-hidden border-2 border-border shadow-inner cursor-pointer group/timeline"
        onPointerDown={handleContainerPointerDown}
      >
        {/* Waveform bars */}
        <div className="absolute inset-0 flex items-center justify-between gap-[2px] px-3">
          {waveform.map((h, i) => {
            const percent = (i / waveform.length) * 100;
            const isActive = percent >= startPercent && percent <= endPercent;
            return (
              <div 
                key={i} 
                className={cn(
                  "flex-1 rounded-full transition-colors duration-200", 
                  isActive ? "bg-primary" : "bg-primary/20"
                )} 
                style={{ height: `${h * 80}%` }} 
              />
            );
          })}
        </div>

        {/* Dimmed Areas */}
        <div className="absolute top-0 bottom-0 left-0 bg-background/50 backdrop-blur-[1px] transition-all border-r border-primary/20" style={{ width: `${startPercent}%` }} />
        <div className="absolute top-0 bottom-0 right-0 bg-background/50 backdrop-blur-[1px] transition-all border-l border-primary/20" style={{ width: `${100 - endPercent}%` }} />

        {/* Playhead */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-destructive z-20 pointer-events-none"
          style={{ left: `${playheadPercent}%` }}
        >
          <div className="absolute -top-1 -translate-x-1/2 w-3 h-3 rounded-full bg-destructive shadow-sm" />
        </div>

        {/* Start Handle */}
        <div 
          className="absolute top-0 bottom-0 w-8 flex flex-col items-center justify-center cursor-ew-resize transform -translate-x-1/2 z-30 group"
          style={{ left: `${startPercent}%` }}
          onPointerDown={(e) => handlePointerDown(e, 'start')}
        >
          <div className="w-2 h-12 md:h-14 bg-primary rounded-full group-hover:scale-y-110 group-active:scale-y-110 transition-transform shadow-md border border-primary-foreground/20 flex flex-col items-center justify-center gap-1">
            <div className="w-0.5 h-1.5 bg-primary-foreground/60 rounded-full" />
            <div className="w-0.5 h-1.5 bg-primary-foreground/60 rounded-full" />
          </div>
        </div>
        
        {/* End Handle */}
        <div 
          className="absolute top-0 bottom-0 w-8 flex flex-col items-center justify-center cursor-ew-resize transform -translate-x-1/2 z-30 group"
          style={{ left: `${endPercent}%` }}
          onPointerDown={(e) => handlePointerDown(e, 'end')}
        >
          <div className="w-2 h-12 md:h-14 bg-primary rounded-full group-hover:scale-y-110 group-active:scale-y-110 transition-transform shadow-md border border-primary-foreground/20 flex flex-col items-center justify-center gap-1">
            <div className="w-0.5 h-1.5 bg-primary-foreground/60 rounded-full" />
            <div className="w-0.5 h-1.5 bg-primary-foreground/60 rounded-full" />
          </div>
        </div>
      </div>

      {/* Info Footer */}
      <div className="flex justify-between items-center mt-2 px-1 md:px-4">
        <div className="flex flex-col items-center">
          <span className="text-[10px] md:text-xs text-muted-foreground font-bold mb-1">자르기 시작</span>
          <div className="bg-primary/10 text-primary px-2.5 py-1 rounded-md font-mono font-bold text-xs md:text-sm border border-primary/20">
            {formatTime(trimStart)}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] md:text-xs text-muted-foreground font-bold mb-1">남길 구간의 길이</span>
          <div className="bg-secondary/10 text-secondary-foreground px-3 md:px-4 py-1.5 rounded-xl font-mono font-bold text-sm md:text-base border border-secondary/20 shadow-sm">
            {formatTime(trimEnd - trimStart)}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] md:text-xs text-muted-foreground font-bold mb-1">자르기 끝</span>
          <div className="bg-primary/10 text-primary px-2.5 py-1 rounded-md font-mono font-bold text-xs md:text-sm border border-primary/20">
            {formatTime(trimEnd)}
          </div>
        </div>
      </div>
    </div>
  );
}
