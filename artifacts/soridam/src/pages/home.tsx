import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrimSlider } from "@/components/ui/trim-slider";
import { useToast } from "@/hooks/use-toast";
import { db, type Sound } from "@/lib/db";
import { generateId, formatTime } from "@/lib/utils";
import { getAudioContext } from "@/lib/audio";

export default function Home() {
  const { toast } = useToast();
  
  // Recording state
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const recordingTimeRef = useRef(0);
  const startingRef = useRef(false);

  // Review state
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [soundName, setSoundName] = useState("");
  
  // Playback state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      cancelAnimationFrame(rafRef.current!);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const requestPermission = async (): Promise<MediaStream | null> => {
    try {
      streamRef.current?.getTracks().forEach(track => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setHasPermission(true);
      
      const audioCtx = getAudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      return stream;
    } catch (err) {
      setHasPermission(false);
      toast({
        title: "마이크 접근 거부됨",
        description: "녹음을 위해 마이크 권한이 필요합니다.",
        variant: "destructive"
      });
      return null;
    }
  };

  const startRecording = async () => {
    if (startingRef.current || isRecording) return;
    startingRef.current = true;
    setIsStarting(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("이 브라우저에서는 녹음 기능을 사용할 수 없습니다.");
      }

      // A fresh stream avoids reusing a track that the browser has already ended.
      const stream = await requestPermission();
      if (!stream) return;

      audioChunksRef.current = [];
      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/mp4;codecs=mp4a.40.2",
        "audio/webm",
        "audio/mp4",
      ];
      const supportedType = mimeCandidates.find(type => MediaRecorder.isTypeSupported(type));

      const attachHandlers = (recorder: MediaRecorder) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        recorder.onerror = () => {
          toast({
            title: "녹음 중 문제가 발생했어요",
            description: "마이크 연결을 확인한 뒤 다시 시도해 주세요.",
            variant: "destructive",
          });
        };
        recorder.onstop = async () => {
          const blobType = recorder.mimeType || supportedType || "audio/webm";
          const blob = new Blob(audioChunksRef.current, { type: blobType });
          if (blob.size === 0) {
            toast({
              title: "녹음된 소리가 없어요",
              description: "마이크를 확인하고 조금 더 길게 녹음해 주세요.",
              variant: "destructive",
            });
            return;
          }

          let measuredDuration = recordingTimeRef.current;
          try {
            const audioContext = getAudioContext();
            const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
            if (Number.isFinite(decoded.duration) && decoded.duration > 0) {
              measuredDuration = decoded.duration;
            }
          } catch {
            // Some Safari/WebM combinations cannot be decoded by Web Audio.
            // The monotonic recording timer is a safe finite fallback.
          }

          measuredDuration = Number.isFinite(measuredDuration) && measuredDuration > 0
            ? measuredDuration
            : 0.1;
          setDuration(measuredDuration);
          setTrimStart(0);
          setTrimEnd(measuredDuration);
          setCurrentTime(0);
          setRecordedBlob(blob);
          setRecordedUrl(URL.createObjectURL(blob));
        };
      };

      let recorder = new MediaRecorder(stream, supportedType ? { mimeType: supportedType } : undefined);
      attachHandlers(recorder);
      try {
        // Omitting a timeslice is more reliable in Safari and embedded previews.
        recorder.start();
      } catch {
        // Some browsers report a MIME type as supported but still reject start().
        recorder = new MediaRecorder(stream);
        attachHandlers(recorder);
        recorder.start();
      }

      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      recordingTimeRef.current = 0;

      timerRef.current = window.setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          setRecordingTime(prev => {
            const next = prev + 0.1;
            recordingTimeRef.current = next;
            return next;
          });
        }
      }, 100);

      const updateLevel = () => {
        if (analyserRef.current && mediaRecorderRef.current?.state === 'recording') {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          setAudioLevel(sum / dataArray.length);
        }
        rafRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (error) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setHasPermission(false);
      toast({
        title: "녹음을 시작할 수 없어요",
        description: error instanceof Error && error.message
          ? error.message
          : "마이크를 사용하는 다른 앱을 닫고 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      setAudioLevel(0);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      clearInterval(timerRef.current);
      setAudioLevel(0);
    }
  };

  const resetRecording = () => {
    setRecordedBlob(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setSoundName("");
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const saveSound = async () => {
    if (!recordedBlob) return;
    try {
      const sound: Sound = {
        id: generateId(),
        name: soundName || "새로운 소리",
        audioBlob: recordedBlob,
        duration,
        mimeType: recordedBlob.type,
        trimStart,
        trimEnd,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.saveSound(sound);
      toast({
        title: "저장 완료",
        description: "소리가 보관함에 저장되었습니다.",
      });
      resetRecording();
    } catch (e) {
      toast({
        title: "저장 실패",
        description: "저장 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  };

  // Audio Playback effect for trimming
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let rafId: number;
    const updateTime = () => {
      setCurrentTime(audio.currentTime);
      if (audio.currentTime >= trimEnd && !audio.paused) {
        audio.pause();
        audio.currentTime = trimStart;
        setCurrentTime(trimStart);
        setIsPlaying(false);
      } else if (!audio.paused) {
        rafId = requestAnimationFrame(updateTime);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      rafId = requestAnimationFrame(updateTime);
    };

    const handlePause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafId);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    
    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      cancelAnimationFrame(rafId);
    };
  }, [trimEnd, trimStart]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      if (audio.currentTime < trimStart || audio.currentTime >= trimEnd - 0.05) {
        audio.currentTime = trimStart;
      }
      audio.play().catch(e => console.error("Playback failed", e));
    }
  };

  return (
    <div className="flex flex-col h-full items-center p-4 md:p-12 w-full max-w-5xl mx-auto">
      <div className="w-full mb-6 md:mb-10 text-center mt-2 md:mt-4">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground font-serif tracking-tight">소리담</h1>
        <p className="text-muted-foreground mt-2 md:mt-3 font-medium text-sm md:text-base">소리를 담다, 이야기를 담다</p>
      </div>

      {!recordedBlob ? (
        <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md gap-8 md:gap-12 pb-12">
          {/* Level Visualizer & Timer */}
          <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center rounded-full bg-card shadow-xl border border-border/60">
            {isRecording && (
              <>
                <div 
                  className="absolute inset-0 bg-primary/10 rounded-full transition-transform duration-100 ease-linear pointer-events-none"
                  style={{ transform: `scale(${1 + (audioLevel / 255) * 0.3})` }}
                />
                <div 
                  className="absolute inset-0 bg-primary/5 rounded-full transition-transform duration-200 ease-out pointer-events-none"
                  style={{ transform: `scale(${1 + (audioLevel / 255) * 0.6})` }}
                />
              </>
            )}
            <div className="flex flex-col items-center z-10">
              <span className="text-xs md:text-sm font-bold text-muted-foreground mb-2">
                {isRecording ? (isPaused ? "일시정지됨" : "녹음 중...") : "준비됨"}
              </span>
              <div className="text-5xl md:text-6xl font-mono font-bold text-foreground tracking-tighter">
                {formatTime(recordingTime)}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-6">
            {!isRecording ? (
              <Button size="icon" disabled={isStarting} aria-label={isStarting ? "마이크 준비 중" : "녹음 시작"} className="w-24 h-24 md:w-28 md:h-28 rounded-[2rem] shadow-xl hover:scale-105 transition-all bg-destructive text-destructive-foreground hover:bg-destructive/90 group" onClick={startRecording}>
                <span className="material-symbols-rounded text-5xl md:text-6xl group-hover:scale-110 transition-transform">{isStarting ? "hourglass_top" : "mic"}</span>
              </Button>
            ) : (
              <>
                {isPaused ? (
                  <Button size="icon" variant="secondary" className="w-20 h-20 md:w-24 md:h-24 rounded-[1.5rem] shadow-md hover:scale-105 transition-all" onClick={resumeRecording}>
                    <span className="material-symbols-rounded text-4xl md:text-5xl">mic</span>
                  </Button>
                ) : (
                  <Button size="icon" variant="secondary" className="w-20 h-20 md:w-24 md:h-24 rounded-[1.5rem] shadow-md hover:scale-105 transition-all" onClick={pauseRecording}>
                    <span className="material-symbols-rounded text-4xl md:text-5xl">pause</span>
                  </Button>
                )}
                
                <Button size="icon" variant="default" className="w-24 h-24 md:w-28 md:h-28 rounded-[2rem] shadow-xl hover:scale-105 transition-all" onClick={stopRecording}>
                  <span className="material-symbols-rounded text-5xl md:text-6xl">stop</span>
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center flex-1 w-full max-w-3xl gap-6 md:gap-8 animate-in fade-in zoom-in-95 pb-12">
          <audio ref={audioRef} src={recordedUrl!} className="hidden" />
          
          <div className="w-full bg-card p-6 md:p-10 rounded-[2rem] shadow-sm border border-border flex flex-col items-center">
            <Input 
              value={soundName} 
              onChange={(e) => setSoundName(e.target.value)} 
              placeholder="여기를 눌러 소리 이름을 지어주세요" 
              className="text-2xl md:text-3xl font-bold text-center h-auto py-3 bg-transparent border-b-2 border-transparent hover:border-border focus:border-primary shadow-none focus-visible:ring-0 px-4 rounded-none w-full max-w-md transition-colors"
              autoFocus
            />
            
            <div className="w-full mt-8 md:mt-12">
              <TrimSlider 
                duration={duration} 
                trimStart={trimStart} 
                trimEnd={trimEnd} 
                currentTime={currentTime}
                onChange={(start, end) => {
                  setTrimStart(start);
                  setTrimEnd(end);
                  if (audioRef.current && (audioRef.current.currentTime < start || audioRef.current.currentTime > end)) {
                    audioRef.current.currentTime = start;
                    setCurrentTime(start);
                  }
                }}
                onSeek={(time) => {
                    if (audioRef.current && Number.isFinite(time) && time >= 0) {
                       const seekLimit = Number.isFinite(duration) && duration > 0 ? duration : 0;
                       if (seekLimit === 0) return;
                       const safeTime = Math.min(time, seekLimit);
                       audioRef.current.currentTime = safeTime;
                       setCurrentTime(safeTime);
                  }
                }}
              />
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-4 mt-8 w-full relative">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 hidden md:block">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground font-bold" onClick={() => { setTrimStart(0); setTrimEnd(duration); }}>
                  <span className="material-symbols-rounded text-lg">refresh</span>
                  전체 구간 선택
                </Button>
              </div>

              <Button size="icon" variant="outline" className="w-14 h-14 rounded-full shadow-sm" onClick={() => {
                if (audioRef.current) {
                  audioRef.current.currentTime = trimStart;
                  setCurrentTime(trimStart);
                }
              }} title="구간 처음으로">
                <span className="material-symbols-rounded text-2xl">skip_previous</span>
              </Button>
              
              <Button size="icon" variant="default" className="w-20 h-20 rounded-full shadow-lg hover:scale-105 transition-transform" onClick={togglePlayback}>
                <span className="material-symbols-rounded text-4xl">{isPlaying ? 'pause' : 'play_arrow'}</span>
              </Button>
              
              {/* Spacer for mobile to balance */}
              <div className="w-14 h-14 md:hidden"></div>
            </div>
            
            <div className="mt-6 md:hidden w-full flex justify-center">
               <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground font-bold" onClick={() => { setTrimStart(0); setTrimEnd(duration); }}>
                  <span className="material-symbols-rounded text-lg">refresh</span>
                  전체 구간 선택
                </Button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full">
            <Button variant="outline" className="flex-1 h-16 rounded-[1.5rem] text-lg font-bold gap-2" onClick={resetRecording}>
              <span className="material-symbols-rounded text-xl">delete</span>
              다시 녹음하기
            </Button>
            <Button variant="default" className="flex-1 h-16 rounded-[1.5rem] text-lg font-bold gap-2 shadow-md bg-secondary hover:bg-secondary/90 text-secondary-foreground" onClick={saveSound}>
              <span className="material-symbols-rounded text-xl">save</span>
              이 소리 저장하기
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
