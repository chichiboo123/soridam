import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrimSlider } from "@/components/ui/trim-slider";
import { useToast } from "@/hooks/use-toast";
import { db, type Sound } from "@/lib/db";
import { generateId, formatTime } from "@/lib/utils";
import { audioBufferToWav, getAudioContext } from "@/lib/audio";

export default function Home() {
  const { toast } = useToast();
  
  // Recording state
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);

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

  const requestPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setHasPermission(true);
      
      const audioCtx = getAudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      
    } catch (err) {
      setHasPermission(false);
      toast({
        title: "마이크 접근 거부됨",
        description: "녹음을 위해 마이크 권한이 필요합니다.",
        variant: "destructive"
      });
    }
  };

  const startRecording = async () => {
    if (!hasPermission) await requestPermission();
    if (!streamRef.current) return;

    audioChunksRef.current = [];
    const options = { mimeType: 'audio/webm' };
    const type = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 
                 MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
                 
    const mr = new MediaRecorder(streamRef.current, type ? { mimeType: type } : undefined);
    
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    
    mr.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: mr.mimeType });
      setRecordedBlob(blob);
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
      
      // Get exact duration
      const tempAudio = new Audio(url);
      tempAudio.onloadedmetadata = () => {
        setDuration(tempAudio.duration);
        setTrimStart(0);
        setTrimEnd(tempAudio.duration);
      };
    };

    mr.start(100); // chunk every 100ms
    mediaRecorderRef.current = mr;
    setIsRecording(true);
    setIsPaused(false);
    setRecordingTime(0);

    const startTime = Date.now();
    let accumulatedPauseTime = 0;
    let lastPauseStart = 0;

    const updateTimer = () => {
      if (!isPaused && mediaRecorderRef.current?.state === 'recording') {
         // rough time calculation
      }
    };
    
    timerRef.current = window.setInterval(() => {
      if (mediaRecorderRef.current?.state === 'recording') {
        setRecordingTime(prev => prev + 0.1);
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

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.currentTime >= trimEnd) {
        audio.pause();
        audio.currentTime = trimStart;
        setIsPlaying(false);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
  }, [trimEnd, trimStart]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      if (audio.currentTime < trimStart || audio.currentTime >= trimEnd) {
        audio.currentTime = trimStart;
      }
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="flex flex-col h-full items-center p-6 md:p-12 max-w-2xl mx-auto w-full">
      <div className="w-full mb-8 text-center mt-8">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground font-serif">소리담</h1>
        <p className="text-muted-foreground mt-2 font-medium">나만의 작은 소리 채집장</p>
      </div>

      {!recordedBlob ? (
        <div className="flex flex-col items-center justify-center flex-1 w-full max-w-sm gap-12">
          {/* Level Visualizer & Timer */}
          <div className="relative w-64 h-64 flex items-center justify-center rounded-full bg-card shadow-xl border border-border/50">
            {isRecording && (
              <div 
                className="absolute inset-0 bg-primary/10 rounded-full transition-transform duration-100 ease-linear pointer-events-none"
                style={{ transform: `scale(${1 + (audioLevel / 255) * 0.5})` }}
              />
            )}
            <div className="text-5xl font-mono font-medium z-10 text-foreground tracking-tighter">
              {formatTime(recordingTime)}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-6">
            {!isRecording ? (
              <Button size="icon" className="w-24 h-24 rounded-[2rem] shadow-lg hover:scale-105 transition-all bg-destructive text-destructive-foreground" onClick={startRecording}>
                <span className="material-symbols-rounded text-5xl">mic</span>
              </Button>
            ) : (
              <>
                {isPaused ? (
                  <Button size="icon" variant="secondary" className="w-20 h-20 rounded-[1.5rem] shadow-md" onClick={resumeRecording}>
                    <span className="material-symbols-rounded text-4xl">mic</span>
                  </Button>
                ) : (
                  <Button size="icon" variant="secondary" className="w-20 h-20 rounded-[1.5rem] shadow-md" onClick={pauseRecording}>
                    <span className="material-symbols-rounded text-4xl">pause</span>
                  </Button>
                )}
                
                <Button size="icon" variant="default" className="w-24 h-24 rounded-[2rem] shadow-lg" onClick={stopRecording}>
                  <span className="material-symbols-rounded text-5xl">stop</span>
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center flex-1 w-full gap-6 animate-in fade-in zoom-in-95">
          <audio ref={audioRef} src={recordedUrl!} onEnded={() => setIsPlaying(false)} className="hidden" />
          
          <div className="w-full bg-card p-6 rounded-3xl shadow-sm border border-border">
            <Input 
              value={soundName} 
              onChange={(e) => setSoundName(e.target.value)} 
              placeholder="소리 이름 입력..." 
              className="text-2xl font-bold text-center h-auto py-4 bg-transparent border-none shadow-none focus-visible:ring-0 px-0"
              autoFocus
            />
            
            <div className="mt-8 flex justify-center mb-6">
              <Button size="icon" variant="secondary" className="w-16 h-16 rounded-2xl" onClick={togglePlayback}>
                <span className="material-symbols-rounded text-3xl">{isPlaying ? 'pause' : 'play_arrow'}</span>
              </Button>
            </div>

            <TrimSlider 
              duration={duration} 
              trimStart={trimStart} 
              trimEnd={trimEnd} 
              onChange={(start, end) => {
                setTrimStart(start);
                setTrimEnd(end);
                if (audioRef.current && isPlaying) {
                  audioRef.current.currentTime = start;
                }
              }} 
            />
            
            <div className="flex justify-center mt-2">
               <Button variant="ghost" size="sm" onClick={() => { setTrimStart(0); setTrimEnd(duration); }}>
                 구간 초기화
               </Button>
            </div>
          </div>

          <div className="flex gap-4 w-full">
            <Button variant="outline" className="flex-1 h-14 rounded-2xl text-lg" onClick={resetRecording}>
              다시 녹음
            </Button>
            <Button variant="default" className="flex-1 h-14 rounded-2xl text-lg" onClick={saveSound}>
              보관함에 저장
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
