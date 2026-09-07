import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrimSlider } from '@/components/ui/trim-slider';
import { usePeaks } from '@/components/ui/waveform';
import { PageShell } from '@/components/page-header';
import { useToast } from '@/hooks/use-toast';
import { db, type Sound } from '@/lib/db';
import { generateId, formatTime, cn } from '@/lib/utils';
import { getAudioContext } from '@/lib/audio';

/** 브라우저 메모리를 지키기 위한 한 번 녹음 최대 길이 */
const MAX_RECORDING_SECONDS = 10 * 60;

type RecordingStatus = 'idle' | 'starting' | 'recording' | 'paused';

export default function Home() {
  const { toast } = useToast();

  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>(
    'unknown',
  );
  const [supported] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia,
  );
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const recordingTimeRef = useRef(0);
  const startingRef = useRef(false);

  // 녹음 후 검토 상태
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedKey, setRecordedKey] = useState<string>('');
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [soundName, setSoundName] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const peaks = usePeaks(recordedKey || null, recordedBlob, 72);

  const isRecording = status === 'recording' || status === 'paused';

  /** 마이크와 분석 노드를 완전히 정리합니다 (탭의 녹음 표시등도 꺼집니다). */
  const releaseMicrophone = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setAudioLevel(0);
  }, []);

  // 페이지를 떠날 때만 정리 — 녹음 중간에 실행되지 않도록 의존성을 비웁니다.
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      releaseMicrophone();
    };
  }, [releaseMicrophone]);

  // objectURL은 교체·언마운트 시점에 해제합니다.
  useEffect(() => {
    if (!recordedUrl) return;
    return () => URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl]);

  const requestPermission = async (): Promise<MediaStream | null> => {
    try {
      releaseMicrophone();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermission('granted');

      const audioCtx = getAudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      sourceNodeRef.current = source;
      analyserRef.current = analyser;
      return stream;
    } catch {
      setPermission('denied');
      return null;
    }
  };

  const finishRecording = useCallback(() => {
    clearInterval(timerRef.current);
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
    setStatus('idle');
    setAudioLevel(0);
  }, []);

  const startRecording = async () => {
    if (startingRef.current || isRecording) return;
    startingRef.current = true;
    setStatus('starting');
    setJustSaved(false);

    try {
      if (!supported) {
        throw new Error('이 브라우저에서는 녹음 기능을 사용할 수 없습니다.');
      }

      const stream = await requestPermission();
      if (!stream) {
        setStatus('idle');
        return;
      }

      audioChunksRef.current = [];
      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/webm',
        'audio/mp4',
      ];
      const supportedType = mimeCandidates.find((type) =>
        MediaRecorder.isTypeSupported(type),
      );

      const attachHandlers = (recorder: MediaRecorder) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        recorder.onerror = () => {
          toast({
            title: '녹음 중 문제가 발생했어요',
            description: '마이크 연결을 확인한 뒤 다시 시도해 주세요.',
            variant: 'destructive',
          });
        };
        recorder.onstop = async () => {
          // 녹음이 끝나면 마이크를 바로 놓아줍니다.
          releaseMicrophone();

          const blobType = recorder.mimeType || supportedType || 'audio/webm';
          const blob = new Blob(audioChunksRef.current, { type: blobType });
          if (blob.size === 0) {
            toast({
              title: '녹음된 소리가 없어요',
              description: '마이크를 확인하고 조금 더 길게 녹음해 주세요.',
              variant: 'destructive',
            });
            return;
          }

          let measuredDuration = recordingTimeRef.current;
          try {
            const audioContext = getAudioContext();
            const decoded = await audioContext.decodeAudioData(
              await blob.arrayBuffer(),
            );
            if (Number.isFinite(decoded.duration) && decoded.duration > 0) {
              measuredDuration = decoded.duration;
            }
          } catch {
            // 디코딩 실패 시 타이머 값 사용
          }

          measuredDuration =
            Number.isFinite(measuredDuration) && measuredDuration > 0
              ? measuredDuration
              : 0.1;

          setDuration(measuredDuration);
          setTrimStart(0);
          setTrimEnd(measuredDuration);
          setCurrentTime(0);
          setRecordedBlob(blob);
          setRecordedKey(generateId());
          setRecordedUrl(URL.createObjectURL(blob));
        };
      };

      let recorder = new MediaRecorder(
        stream,
        supportedType ? { mimeType: supportedType } : undefined,
      );
      attachHandlers(recorder);
      try {
        recorder.start();
      } catch {
        recorder = new MediaRecorder(stream);
        attachHandlers(recorder);
        recorder.start();
      }

      mediaRecorderRef.current = recorder;
      setStatus('recording');
      setRecordingTime(0);
      recordingTimeRef.current = 0;

      timerRef.current = window.setInterval(() => {
        if (mediaRecorderRef.current?.state !== 'recording') return;
        const next = recordingTimeRef.current + 0.1;
        recordingTimeRef.current = next;
        setRecordingTime(next);
        if (next >= MAX_RECORDING_SECONDS) {
          toast({
            title: '최대 녹음 길이에 도달했어요',
            description: '한 번에 10분까지 녹음할 수 있어요.',
          });
          finishRecording();
        }
      }, 100);

      const updateLevel = () => {
        if (
          analyserRef.current &&
          mediaRecorderRef.current?.state === 'recording'
        ) {
          const dataArray = new Uint8Array(
            analyserRef.current.frequencyBinCount,
          );
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i += 1) sum += dataArray[i];
          setAudioLevel(sum / dataArray.length);
        }
        rafRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (error) {
      releaseMicrophone();
      setStatus('idle');
      toast({
        title: '녹음을 시작할 수 없어요',
        description:
          error instanceof Error && error.message
            ? error.message
            : '마이크를 사용하는 다른 앱을 닫고 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      startingRef.current = false;
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setStatus('paused');
      setAudioLevel(0);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setStatus('recording');
    }
  };

  const resetRecording = () => {
    setRecordedBlob(null);
    setRecordedKey('');
    setRecordedUrl(null);
    setSoundName('');
    setCurrentTime(0);
    setIsPlaying(false);
    setDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    setRecordingTime(0);
    recordingTimeRef.current = 0;
  };

  const saveSound = async () => {
    if (!recordedBlob || saving) return;
    setSaving(true);
    try {
      const sound: Sound = {
        id: generateId(),
        name: soundName.trim() || '새로운 소리',
        audioBlob: recordedBlob,
        duration,
        mimeType: recordedBlob.type,
        trimStart,
        trimEnd,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.saveSound(sound);
      resetRecording();
      setJustSaved(true);
      toast({
        title: '소리함에 담았어요!',
        description: `‘${sound.name}’ 소리를 저장했습니다.`,
      });
    } catch {
      toast({
        title: '저장하지 못했어요',
        description: '저장 공간을 확인한 뒤 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // 잘라낸 구간 안에서만 재생되도록 감시합니다.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let rafId = 0;
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
      return;
    }
    if (audio.currentTime < trimStart || audio.currentTime >= trimEnd - 0.05) {
      audio.currentTime = trimStart;
    }
    audio.play().catch(() => {
      toast({
        title: '재생할 수 없어요',
        description: '화면을 한 번 더 눌러 주세요.',
        variant: 'destructive',
      });
    });
  };

  const levelScale = 1 + Math.min(1, audioLevel / 160) * 0.18;

  return (
    <PageShell width="default" className="items-center">
      <header className="mb-4 text-center sm:mb-6 md:mb-8">
        <h1 className="tracking-tight text-foreground">소리담</h1>
        <p className="mt-1 text-sm font-bold text-muted-foreground md:text-base">
          소리를 담다, 이야기를 담다
        </p>
      </header>

      {!supported ? (
        <Notice
          icon="mic_off"
          tone="warning"
          title="이 브라우저에서는 녹음할 수 없어요"
          description="크롬, 사파리, 엣지 최신 버전에서 열어 주세요. 이미 저장한 소리는 소리함에서 그대로 사용할 수 있어요."
          action={
            <Button asChild variant="soft" size="lg">
              <Link href="/sounds">소리함으로 가기</Link>
            </Button>
          }
        />
      ) : !recordedBlob ? (
        <div className="flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 sm:gap-7 md:gap-10">
          {permission === 'denied' ? (
            <Notice
              icon="mic_off"
              tone="warning"
              title="마이크를 사용할 수 없어요"
              description="주소창 왼쪽의 자물쇠(또는 ⓘ) 아이콘을 눌러 마이크 권한을 ‘허용’으로 바꾼 뒤 다시 시도해 주세요."
              action={
                <Button size="lg" onClick={startRecording}>
                  <span
                    className="material-symbols-rounded text-xl"
                    aria-hidden="true"
                  >
                    refresh
                  </span>
                  다시 시도하기
                </Button>
              }
            />
          ) : null}

          {/* 레벨 미터 + 타이머 */}
          <div
            className="relative flex aspect-square w-[min(62vw,30vh,17rem)] items-center justify-center rounded-[2.5rem] border-4 border-border bg-card sd-pop sd-pop-xl sd-pop-soft"
            role="status"
            aria-live="polite"
          >
            {status === 'recording' ? (
              <div
                className="pointer-events-none absolute inset-0 rounded-[2.25rem] bg-brand/15 transition-transform duration-100 ease-linear"
                style={{ transform: `scale(${levelScale})` }}
              />
            ) : null}

            <div className="z-10 flex flex-col items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-extrabold md:text-sm',
                  status === 'recording'
                    ? 'bg-destructive text-destructive-foreground'
                    : status === 'paused'
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {status === 'recording'
                  ? '녹음 중'
                  : status === 'paused'
                    ? '잠시 멈춤'
                    : status === 'starting'
                      ? '마이크 준비 중'
                      : '준비됐어요'}
              </span>
              <span className="font-mono text-[clamp(2.25rem,11vw,3.75rem)] font-black tabular-nums leading-none tracking-tight text-foreground">
                {formatTime(recordingTime)}
              </span>
            </div>
          </div>

          {/* 조작 버튼 */}
          <div className="flex items-center justify-center gap-5">
            {!isRecording ? (
              <Button
                size="none"
                variant="destructive"
                disabled={status === 'starting'}
                aria-label={
                  status === 'starting' ? '마이크 준비 중' : '녹음 시작'
                }
                className="size-[min(28vw,7rem)] rounded-[2rem] sd-pop-xl"
                onClick={startRecording}
              >
                <span
                  className="material-symbols-rounded text-[clamp(2.5rem,12vw,3.5rem)]"
                  aria-hidden="true"
                >
                  {status === 'starting' ? 'hourglass_top' : 'mic'}
                </span>
              </Button>
            ) : (
              <>
                <Button
                  size="none"
                  variant={status === 'paused' ? 'secondary' : 'muted'}
                  aria-label={status === 'paused' ? '녹음 이어하기' : '잠시 멈춤'}
                  className="size-[min(22vw,5.5rem)] rounded-3xl sd-pop-lg"
                  onClick={status === 'paused' ? resumeRecording : pauseRecording}
                >
                  <span
                    className="material-symbols-rounded text-[clamp(1.75rem,8vw,2.5rem)]"
                    aria-hidden="true"
                  >
                    {status === 'paused' ? 'mic' : 'pause'}
                  </span>
                </Button>

                <Button
                  size="none"
                  aria-label="녹음 마치기"
                  className="size-[min(26vw,6.5rem)] rounded-[2rem] sd-pop-xl"
                  onClick={finishRecording}
                >
                  <span
                    className="material-symbols-rounded text-[clamp(2rem,10vw,3rem)]"
                    aria-hidden="true"
                  >
                    stop
                  </span>
                </Button>
              </>
            )}
          </div>

          <p className="text-center text-sm font-semibold text-muted-foreground">
            {isRecording
              ? '다 담았으면 정지 버튼을 눌러 주세요.'
              : '빨간 버튼을 누르면 소리를 담아요.'}
          </p>

          {justSaved ? (
            <Button asChild variant="soft" size="lg">
              <Link href="/sounds">
                <span
                  className="material-symbols-rounded text-xl"
                  aria-hidden="true"
                >
                  library_music
                </span>
                방금 담은 소리 보러 가기
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex w-full max-w-2xl flex-col gap-5 duration-200 animate-in fade-in">
          <audio ref={audioRef} src={recordedUrl ?? undefined} preload="auto" />

          <section className="sd-card p-4 sm:p-6">
            <label
              htmlFor="sound-name"
              className="mb-2 block text-sm font-bold text-muted-foreground"
            >
              소리 이름
            </label>
            <Input
              id="sound-name"
              value={soundName}
              onChange={(event) => setSoundName(event.target.value)}
              placeholder="예) 빗소리, 발자국 소리"
              maxLength={40}
              className="h-14 rounded-xl border-2 border-border bg-muted/40 px-4 text-lg font-extrabold focus:border-primary focus:bg-card"
            />

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-extrabold text-foreground">
                  쓸 만큼만 잘라요
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setTrimStart(0);
                    setTrimEnd(duration);
                  }}
                >
                  <span
                    className="material-symbols-rounded text-lg"
                    aria-hidden="true"
                  >
                    refresh
                  </span>
                  전체 선택
                </Button>
              </div>

              <TrimSlider
                duration={duration}
                trimStart={trimStart}
                trimEnd={trimEnd}
                currentTime={currentTime}
                peaks={peaks}
                onChange={(start, end) => {
                  setTrimStart(start);
                  setTrimEnd(end);
                  const audio = audioRef.current;
                  if (
                    audio &&
                    (audio.currentTime < start || audio.currentTime > end)
                  ) {
                    audio.currentTime = start;
                    setCurrentTime(start);
                  }
                }}
                onSeek={(time) => {
                  const audio = audioRef.current;
                  if (!audio || !Number.isFinite(time) || duration <= 0) return;
                  audio.currentTime = Math.min(Math.max(time, 0), duration);
                  setCurrentTime(audio.currentTime);
                  if (!isPlaying) audio.play().catch(() => {});
                }}
              />
            </div>

            <div className="mt-5 flex items-center justify-center gap-4">
              <Button
                size="icon-lg"
                variant="muted"
                aria-label="자른 구간 처음으로"
                onClick={() => {
                  const audio = audioRef.current;
                  if (!audio) return;
                  audio.currentTime = trimStart;
                  setCurrentTime(trimStart);
                }}
              >
                <span
                  className="material-symbols-rounded text-3xl"
                  aria-hidden="true"
                >
                  skip_previous
                </span>
              </Button>
              <Button
                size="none"
                aria-label={isPlaying ? '멈추기' : '들어보기'}
                className="size-20 rounded-3xl sd-pop-lg"
                onClick={togglePlayback}
              >
                <span
                  className="material-symbols-rounded text-4xl"
                  aria-hidden="true"
                >
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
              </Button>
              <div className="size-14" aria-hidden="true" />
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="soft"
              size="xl"
              className="flex-1"
              onClick={resetRecording}
            >
              <span
                className="material-symbols-rounded text-2xl"
                aria-hidden="true"
              >
                restart_alt
              </span>
              다시 녹음하기
            </Button>
            <Button
              variant="secondary"
              size="xl"
              className="flex-1"
              disabled={saving}
              onClick={saveSound}
            >
              <span
                className="material-symbols-rounded text-2xl"
                aria-hidden="true"
              >
                {saving ? 'hourglass_top' : 'save'}
              </span>
              {saving ? '저장 중…' : '이 소리 저장하기'}
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function Notice({
  icon,
  title,
  description,
  action,
  tone = 'warning',
}: {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  tone?: 'warning' | 'info';
}) {
  return (
    <div
      className={cn(
        'flex w-full max-w-md flex-col items-center gap-3 rounded-3xl border-2 p-6 text-center',
        tone === 'warning'
          ? 'border-destructive/30 bg-destructive-tint'
          : 'border-border bg-card',
      )}
      role="alert"
    >
      <span
        className="material-symbols-rounded text-4xl text-destructive"
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="text-lg font-extrabold text-foreground">{title}</p>
      <p className="text-sm font-semibold leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
