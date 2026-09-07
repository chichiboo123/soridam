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
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

  const waveform = React.useMemo(() => {
    const bars = 60; // Thicker bars for chunky look
    const res = [];
    for (let i = 0; i < bars; i++) {
      const x = i / bars;
      const env = Math.sin(x * Math.PI); 
      const noise = (Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1; 
      const val = Math.abs(noise) * 0.6 + 0.3; 
      res.push(Math.max(0.15, env * val));
    }
    return res;
  }, []);

  const handlePointerDown = (e: React.PointerEvent, handle: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(handle);
  };

  const handleContainerPointerDown = (e: React.PointerEvent) => {
    if (isDragging || !containerRef.current || !onSeek || safeDuration === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || rect.width <= 0) return;
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const nextTime = percent * safeDuration;
    if (Number.isFinite(nextTime)) onSeek(nextTime);
  };

  React.useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging || !containerRef.current || safeDuration === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (!Number.isFinite(rect.width) || rect.width <= 0) return;
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newValue = percent * safeDuration;
      if (!Number.isFinite(newValue)) return;

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
  }, [isDragging, safeDuration, trimStart, trimEnd, onChange]);

  const toPercent = (value: number, fallback: number) => {
    if (safeDuration === 0 || !Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(100, (value / safeDuration) * 100));
  };
  const startPercent = toPercent(trimStart, 0);
  const endPercent = toPercent(trimEnd, 100);
  const playheadPercent = toPercent(currentTime, 0);

  return (
    <div className={cn("w-full select-none touch-none flex flex-col gap-4", className)}>
      <div className="flex justify-between text-sm font-bold text-muted-foreground font-mono px-2">
        <span>0:00</span>
        <span>{formatTime(safeDuration)}</span>
      </div>
      
      <div 
        ref={containerRef}
        className="relative h-28 md:h-32 bg-muted/50 rounded-3xl overflow-hidden border-4 border-border cursor-pointer group/timeline shadow-inner"
        onPointerDown={handleContainerPointerDown}
      >
        {/* Waveform bars */}
        <div className="absolute inset-0 flex items-center justify-between gap-1 px-4">
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
                style={{ height: `${h * 70}%` }} 
              />
            );
          })}
        </div>

        {/* Dimmed Areas */}
        <div className="absolute top-0 bottom-0 left-0 bg-background/60 backdrop-blur-[2px] transition-all border-r-2 border-primary/30" style={{ width: `${startPercent}%` }} />
        <div className="absolute top-0 bottom-0 right-0 bg-background/60 backdrop-blur-[2px] transition-all border-l-2 border-primary/30" style={{ width: `${100 - endPercent}%` }} />

        {/* Playhead */}
        <div 
          className="absolute top-0 bottom-0 w-1 bg-destructive z-20 pointer-events-none shadow-[0_0_8px_rgba(255,0,0,0.5)]"
          style={{ left: `${playheadPercent}%` }}
        >
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-destructive shadow-md border-2 border-white" />
        </div>

        {/* Start Handle */}
        <div 
          className="absolute top-0 bottom-0 w-10 flex flex-col items-center justify-center cursor-ew-resize transform -translate-x-1/2 z-30 group"
          style={{ left: `${startPercent}%` }}
          onPointerDown={(e) => handlePointerDown(e, 'start')}
        >
          <div className="w-3.5 h-16 md:h-20 bg-primary rounded-full group-hover:scale-110 group-active:scale-110 transition-transform shadow-[0_4px_0_0_rgba(0,0,0,0.2)] border-2 border-primary-foreground/30 flex flex-col items-center justify-center gap-1.5">
            <div className="w-1 h-2 bg-primary-foreground/80 rounded-full" />
            <div className="w-1 h-2 bg-primary-foreground/80 rounded-full" />
            <div className="w-1 h-2 bg-primary-foreground/80 rounded-full" />
          </div>
        </div>
        
        {/* End Handle */}
        <div 
          className="absolute top-0 bottom-0 w-10 flex flex-col items-center justify-center cursor-ew-resize transform -translate-x-1/2 z-30 group"
          style={{ left: `${endPercent}%` }}
          onPointerDown={(e) => handlePointerDown(e, 'end')}
        >
          <div className="w-3.5 h-16 md:h-20 bg-primary rounded-full group-hover:scale-110 group-active:scale-110 transition-transform shadow-[0_4px_0_0_rgba(0,0,0,0.2)] border-2 border-primary-foreground/30 flex flex-col items-center justify-center gap-1.5">
            <div className="w-1 h-2 bg-primary-foreground/80 rounded-full" />
            <div className="w-1 h-2 bg-primary-foreground/80 rounded-full" />
            <div className="w-1 h-2 bg-primary-foreground/80 rounded-full" />
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mt-2 px-2 md:px-6">
        <div className="flex flex-col items-center">
          <span className="text-xs md:text-sm text-muted-foreground font-black mb-1.5">자르기 시작</span>
          <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-xl font-mono font-black text-sm md:text-base shadow-[0_2px_0_0_rgba(0,0,0,0.2)]">
            {formatTime(trimStart)}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs md:text-sm text-muted-foreground font-black mb-1.5">남길 길이</span>
          <div className="bg-card text-foreground px-4 md:px-6 py-2 rounded-2xl font-mono font-black text-base md:text-lg border-2 border-border shadow-[0_4px_0_0_rgba(0,0,0,0.05)]">
            {formatTime(trimEnd - trimStart)}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs md:text-sm text-muted-foreground font-black mb-1.5">자르기 끝</span>
          <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-xl font-mono font-black text-sm md:text-base shadow-[0_2px_0_0_rgba(0,0,0,0.2)]">
            {formatTime(trimEnd)}
          </div>
        </div>
      </div>
    </div>
  );
}
