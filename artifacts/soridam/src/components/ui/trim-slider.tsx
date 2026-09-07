import * as React from "react";
import { cn, formatTime } from "@/lib/utils";

interface TrimSliderProps {
  duration: number;
  trimStart: number;
  trimEnd: number;
  onChange: (start: number, end: number) => void;
  className?: string;
}

export function TrimSlider({ duration, trimStart, trimEnd, onChange, className }: TrimSliderProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState<'start' | 'end' | null>(null);

  const handlePointerDown = (e: React.PointerEvent, handle: 'start' | 'end') => {
    e.preventDefault();
    setIsDragging(handle);
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

  const startPercent = (trimStart / duration) * 100;
  const endPercent = (trimEnd / duration) * 100;

  return (
    <div className={cn("w-full py-4 select-none touch-none", className)}>
      <div className="flex justify-between text-xs text-muted-foreground mb-2 font-mono">
        <span>{formatTime(trimStart)}</span>
        <span>{formatTime(trimEnd)}</span>
      </div>
      <div 
        ref={containerRef}
        className="relative h-12 bg-muted rounded-xl cursor-crosshair overflow-hidden"
      >
        {/* Active Region */}
        <div 
          className="absolute top-0 bottom-0 bg-primary/20"
          style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }}
        />
        
        {/* Start Handle */}
        <div 
          className="absolute top-0 bottom-0 w-4 bg-primary flex items-center justify-center cursor-ew-resize transform -translate-x-1/2 z-10 rounded-full"
          style={{ left: `${startPercent}%` }}
          onPointerDown={(e) => handlePointerDown(e, 'start')}
        >
          <div className="w-1 h-4 bg-primary-foreground rounded-full opacity-50 pointer-events-none" />
        </div>
        
        {/* End Handle */}
        <div 
          className="absolute top-0 bottom-0 w-4 bg-primary flex items-center justify-center cursor-ew-resize transform -translate-x-1/2 z-10 rounded-full"
          style={{ left: `${endPercent}%` }}
          onPointerDown={(e) => handlePointerDown(e, 'end')}
        >
          <div className="w-1 h-4 bg-primary-foreground rounded-full opacity-50 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
