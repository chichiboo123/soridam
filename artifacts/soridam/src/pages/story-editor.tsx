import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { db, type Sound, type SoundStory, type SoundClip } from '@/lib/db';
import { generateId, formatTime, formatClock, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { BrandFooter } from '@/components/brand-footer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  getAudioContext,
  decodeAudioBlob,
  audioBufferToWav,
  downloadBlob,
  toSafeFileName,
} from '@/lib/audio';
import { peaksFromBuffer } from '@/lib/waveform';

const TRACK_HEIGHT = 68;
const CLIP_INSET = 8;
const GUTTER_WIDTH = 56;
const RULER_HEIGHT = 28;
const MAX_TRACKS = 6;
const ZOOM_LEVELS = [24, 36, 52, 72, 100, 140];
const DEFAULT_ZOOM_INDEX = 2;
/** 드래그로 판정할 최소 이동 거리 — 이보다 작으면 '탭'으로 봅니다. */
const TAP_TOLERANCE = 8;

const TRACK_COLORS = [
  { bg: 'hsl(21 100% 61%)', edge: 'hsl(14 85% 38%)', ink: '#ffffff' },
  { bg: 'hsl(170 65% 38%)', edge: 'hsl(170 75% 24%)', ink: '#ffffff' },
  { bg: 'hsl(43 100% 62%)', edge: 'hsl(35 90% 40%)', ink: '#3a2408' },
  { bg: 'hsl(330 75% 60%)', edge: 'hsl(330 70% 40%)', ink: '#ffffff' },
  { bg: 'hsl(255 62% 63%)', edge: 'hsl(255 55% 42%)', ink: '#ffffff' },
  { bg: 'hsl(200 78% 50%)', edge: 'hsl(200 80% 32%)', ink: '#ffffff' },
];

const trackColor = (index: number) => TRACK_COLORS[index % TRACK_COLORS.length];

type DragState = {
  clipId: string;
  pointerId: number;
  originX: number;
  originY: number;
  startTime: number;
  startTrack: number;
  moved: boolean;
};

export default function StoryEditor() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [story, setStory] = useState<SoundStory | null>(null);
  const [sounds, setSounds] = useState<Record<string, Sound>>({});
  const [buffers, setBuffers] = useState<Record<string, AudioBuffer>>({});
  const [clipPeaks, setClipPeaks] = useState<Record<string, number[]>>({});

  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [trackCount, setTrackCount] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [isRendering, setIsRendering] = useState(false);

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [librarySounds, setLibrarySounds] = useState<Sound[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const playheadRafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const pxPerSecond = ZOOM_LEVELS[zoomIndex];

  const selectedClip = useMemo(
    () => story?.clips.find((clip) => clip.id === selectedClipId) ?? null,
    [story, selectedClipId],
  );

  /** 콘텐츠 끝 + 여유 5초 (최소 10초) */
  const duration = useMemo(() => {
    if (!story) return 10;
    const end = story.clips.reduce(
      (max, clip) =>
        Math.max(max, clip.startTime + (clip.trimEnd - clip.trimStart)),
      0,
    );
    return Math.max(10, end + 5);
  }, [story]);

  // ── 데이터 ──────────────────────────────────────────────────────────

  const loadData = useCallback(
    async (id: string) => {
      const stored = await db.getStory(id);
      if (!stored) {
        toast({ title: '이야기를 찾을 수 없어요', variant: 'destructive' });
        setLocation('/stories');
        return;
      }

      const inferred = Math.max(
        1,
        ...stored.clips.map((clip) => clip.track + 1),
      );
      const normalized: SoundStory = {
        ...stored,
        trackCount: Math.min(
          MAX_TRACKS,
          Math.max(stored.trackCount ?? inferred, inferred),
        ),
      };
      setStory(normalized);
      setTrackCount(normalized.trackCount ?? 1);

      const all = await db.getSounds();
      const map: Record<string, Sound> = {};
      all.forEach((sound) => {
        map[sound.id] = sound;
      });
      setSounds(map);
      setLibrarySounds(all);

      const nextBuffers: Record<string, AudioBuffer> = {};
      const nextPeaks: Record<string, number[]> = {};
      for (const clip of normalized.clips) {
        const sound = map[clip.soundId];
        if (!sound || nextBuffers[clip.soundId]) continue;
        try {
          const buffer = await decodeAudioBlob(sound.audioBlob);
          nextBuffers[clip.soundId] = buffer;
          nextPeaks[clip.soundId] = peaksFromBuffer(buffer, 48);
        } catch {
          // 디코딩 실패한 소리는 블록은 보이되 소리만 나지 않습니다.
        }
      }
      setBuffers(nextBuffers);
      setClipPeaks(nextPeaks);
    },
    [setLocation, toast],
  );

  useEffect(() => {
    if (params.id) loadData(params.id);
  }, [params.id, loadData]);

  const saveStory = useCallback(async (next: SoundStory) => {
    setStory(next);
    await db.saveStory(next);
  }, []);

  // ── 재생 ────────────────────────────────────────────────────────────

  const stopPlayback = useCallback(() => {
    sourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // 이미 멈춘 소스
      }
    });
    sourcesRef.current = [];
    cancelAnimationFrame(playheadRafRef.current);
    setIsPlaying(false);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  const startPlayback = useCallback(() => {
    if (!story) return;
    const ctx = getAudioContext();
    stopPlayback();

    const offset = playheadTime >= duration - 0.05 ? 0 : playheadTime;
    if (offset !== playheadTime) setPlayheadTime(offset);
    startTimeRef.current = ctx.currentTime - offset;

    const started: AudioBufferSourceNode[] = [];

    story.clips.forEach((clip) => {
      const buffer = buffers[clip.soundId];
      if (!buffer) return;

      const clipLength = clip.trimEnd - clip.trimStart;
      const clipEnd = clip.startTime + clipLength;
      if (clipEnd <= offset) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);

      const startsLater = clip.startTime > offset;
      const when = startsLater
        ? ctx.currentTime + (clip.startTime - offset)
        : ctx.currentTime;
      const offsetInClip = startsLater
        ? clip.trimStart
        : clip.trimStart + (offset - clip.startTime);
      const playLength = Math.max(0, clip.trimEnd - offsetInClip);
      if (playLength <= 0) return;

      // 기본 음량
      gain.gain.setValueAtTime(clip.volume, when);

      // 서서히 커지기 — 이미 지나간 부분은 남은 만큼만 적용
      const elapsedInClip = offsetInClip - clip.trimStart;
      if (clip.fadeIn > 0 && elapsedInClip < clip.fadeIn) {
        const remaining = clip.fadeIn - elapsedInClip;
        const from = clip.volume * (elapsedInClip / clip.fadeIn);
        gain.gain.setValueAtTime(from, when);
        gain.gain.linearRampToValueAtTime(clip.volume, when + remaining);
      }

      /*
       * VER1은 서서히 작아지기(fadeOut)를 WAV 내보내기에만 적용해서
       * 미리 듣기와 저장된 음원이 서로 달랐습니다. 여기서 함께 적용합니다.
       */
      if (clip.fadeOut > 0) {
        const fadeOutStartInClip = clipLength - clip.fadeOut;
        const playedInClip = offsetInClip - clip.trimStart;
        const fadeOutAt = when + Math.max(0, fadeOutStartInClip - playedInClip);
        const endsAt = when + playLength;
        gain.gain.setValueAtTime(
          playedInClip >= fadeOutStartInClip
            ? clip.volume *
                Math.max(0, (clipLength - playedInClip) / clip.fadeOut)
            : clip.volume,
          fadeOutAt,
        );
        gain.gain.linearRampToValueAtTime(0.0001, endsAt);
      }

      source.start(when, offsetInClip, playLength);
      started.push(source);
    });

    sourcesRef.current = started;
    setIsPlaying(true);

    const tick = () => {
      const now = getAudioContext().currentTime - startTimeRef.current;
      if (now >= duration) {
        stopPlayback();
        setPlayheadTime(0);
        return;
      }
      setPlayheadTime(now);
      playheadRafRef.current = requestAnimationFrame(tick);
    };
    playheadRafRef.current = requestAnimationFrame(tick);
  }, [story, buffers, playheadTime, duration, stopPlayback]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) stopPlayback();
    else startPlayback();
  }, [isPlaying, startPlayback, stopPlayback]);

  // 재생 중 플레이헤드가 화면 밖으로 나가면 따라 스크롤합니다.
  useEffect(() => {
    if (!isPlaying) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const x = playheadTime * pxPerSecond;
    const left = scroller.scrollLeft;
    const right = left + scroller.clientWidth;
    if (x < left + 40 || x > right - 80) {
      scroller.scrollTo({ left: Math.max(0, x - 80), behavior: 'auto' });
    }
  }, [playheadTime, isPlaying, pxPerSecond]);

  // ── 편집 ────────────────────────────────────────────────────────────

  const updateClip = useCallback(
    (id: string, updates: Partial<SoundClip>, persist = true) => {
      setStory((current) => {
        if (!current) return current;
        const next: SoundStory = {
          ...current,
          clips: current.clips.map((clip) =>
            clip.id === id ? { ...clip, ...updates } : clip,
          ),
          updatedAt: Date.now(),
        };
        if (persist) db.saveStory(next);
        return next;
      });
    },
    [],
  );

  const deleteClip = useCallback(
    (id: string) => {
      setStory((current) => {
        if (!current) return current;
        const next: SoundStory = {
          ...current,
          clips: current.clips.filter((clip) => clip.id !== id),
          updatedAt: Date.now(),
        };
        db.saveStory(next);
        return next;
      });
      setSelectedClipId(null);
    },
    [],
  );

  const addTrack = () => {
    if (!story || trackCount >= MAX_TRACKS) return;
    const next = trackCount + 1;
    setTrackCount(next);
    saveStory({ ...story, trackCount: next, updatedAt: Date.now() });
  };

  const removeTrack = () => {
    if (!story || trackCount <= 1) return;
    const last = trackCount - 1;
    if (story.clips.some((clip) => clip.track === last)) {
      toast({
        title: '트랙을 지울 수 없어요',
        description: '마지막 줄에 아직 소리 블록이 있어요.',
        variant: 'destructive',
      });
      return;
    }
    const next = trackCount - 1;
    setTrackCount(next);
    saveStory({ ...story, trackCount: next, updatedAt: Date.now() });
  };

  const addClip = async (sound: Sound) => {
    if (!story) return;
    setIsLibraryOpen(false);
    stopPreview();

    const length = sound.trimEnd - sound.trimStart;
    const overlaps = (track: number) =>
      story.clips.some(
        (clip) =>
          clip.track === track &&
          playheadTime < clip.startTime + (clip.trimEnd - clip.trimStart) &&
          playheadTime + length > clip.startTime,
      );

    let targetTrack = 0;
    let found = false;
    for (let i = 0; i < trackCount; i += 1) {
      if (!overlaps(i)) {
        targetTrack = i;
        found = true;
        break;
      }
    }

    // 빈 자리가 없으면 새 줄을 만들어 겹치지 않게 놓아 줍니다.
    let nextTrackCount = trackCount;
    if (!found && trackCount < MAX_TRACKS) {
      targetTrack = trackCount;
      nextTrackCount = trackCount + 1;
      setTrackCount(nextTrackCount);
    }

    if (!buffers[sound.id]) {
      try {
        const buffer = await decodeAudioBlob(sound.audioBlob);
        setBuffers((prev) => ({ ...prev, [sound.id]: buffer }));
        setClipPeaks((prev) => ({
          ...prev,
          [sound.id]: peaksFromBuffer(buffer, 48),
        }));
      } catch {
        toast({
          title: '이 소리를 열 수 없어요',
          description: '다른 소리를 사용해 주세요.',
          variant: 'destructive',
        });
        return;
      }
    }

    const newClip: SoundClip = {
      id: generateId(),
      soundId: sound.id,
      startTime: Math.round(playheadTime * 10) / 10,
      track: targetTrack,
      trimStart: sound.trimStart,
      trimEnd: sound.trimEnd,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    };

    setSounds((prev) => ({ ...prev, [sound.id]: sound }));
    saveStory({
      ...story,
      clips: [...story.clips, newClip],
      trackCount: nextTrackCount,
      updatedAt: Date.now(),
    });
    setSelectedClipId(newClip.id);
  };

  /** 0.1초 격자 + 다른 블록 가장자리·시작점으로 자석처럼 붙이기 */
  const snapTime = useCallback(
    (value: number, ignoreClipId: string) => {
      if (!story) return Math.max(0, value);
      const threshold = 8 / pxPerSecond;
      const anchors = [0];
      story.clips.forEach((clip) => {
        if (clip.id === ignoreClipId) return;
        anchors.push(clip.startTime);
        anchors.push(clip.startTime + (clip.trimEnd - clip.trimStart));
      });

      let best = Math.max(0, Math.round(value * 10) / 10);
      let bestDistance = threshold;
      anchors.forEach((anchor) => {
        const distance = Math.abs(anchor - value);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = anchor;
        }
      });
      return Math.max(0, best);
    },
    [story, pxPerSecond],
  );

  const handleClipPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    clip: SoundClip,
  ) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.stopPropagation();
    setSelectedClipId(clip.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      clipId: clip.id,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startTime: clip.startTime,
      startTrack: clip.track,
      moved: false,
    };
  };

  const handleClipPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.originX;
    const dy = event.clientY - drag.originY;
    if (!drag.moved && Math.hypot(dx, dy) < TAP_TOLERANCE) return;
    drag.moved = true;

    const nextTime = snapTime(drag.startTime + dx / pxPerSecond, drag.clipId);
    const nextTrack = Math.max(
      0,
      Math.min(trackCount - 1, drag.startTrack + Math.round(dy / TRACK_HEIGHT)),
    );
    updateClip(drag.clipId, { startTime: nextTime, track: nextTrack }, false);
  };

  const endClipDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    if (!drag.moved || !story) return;
    const clip = story.clips.find((item) => item.id === drag.clipId);
    if (clip) {
      updateClip(
        drag.clipId,
        { startTime: clip.startTime, track: clip.track },
        true,
      );
    }
  };

  /**
   * 빈 레인을 '탭'했을 때만 재생 위치를 옮깁니다.
   * VER1은 pointerdown 하나로 판정해, 가로 스크롤을 하려고 손가락을 댈 때마다
   * 재생 위치가 튀었습니다.
   */
  const laneTapRef = useRef<{ x: number; y: number } | null>(null);

  const handleLanePointerDown = (event: React.PointerEvent) => {
    laneTapRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleLanePointerUp = (event: React.PointerEvent) => {
    const origin = laneTapRef.current;
    laneTapRef.current = null;
    if (!origin) return;
    if (
      Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >
      TAP_TOLERANCE
    ) {
      return;
    }
    seekFromClientX(event.clientX);
    setSelectedClipId(null);
  };

  const seekFromClientX = (clientX: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const x = clientX - rect.left + scroller.scrollLeft;
    const time = Math.max(0, Math.min(duration, x / pxPerSecond));
    if (isPlaying) stopPlayback();
    setPlayheadTime(time);
  };

  const setFade = (type: 'fadeIn' | 'fadeOut', value: number) => {
    if (!selectedClip) return;
    const clipLength = selectedClip.trimEnd - selectedClip.trimStart;
    const other = type === 'fadeIn' ? selectedClip.fadeOut : selectedClip.fadeIn;
    const max = Math.max(0, Math.floor(clipLength - other));
    const next = Math.min(
      max,
      Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)),
    );
    if (next !== selectedClip[type]) {
      updateClip(selectedClip.id, { [type]: next });
    }
  };

  // ── 키보드 단축키 (데스크톱) ────────────────────────────────────────

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (!selectedClip) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteClip(selectedClip.id);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const step = event.shiftKey ? 1 : 0.1;
        const delta = event.key === 'ArrowLeft' ? -step : step;
        updateClip(selectedClip.id, {
          startTime:
            Math.round(Math.max(0, selectedClip.startTime + delta) * 10) / 10,
        });
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const delta = event.key === 'ArrowUp' ? -1 : 1;
        updateClip(selectedClip.id, {
          track: Math.max(
            0,
            Math.min(trackCount - 1, selectedClip.track + delta),
          ),
        });
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedClip, togglePlayback, deleteClip, updateClip, trackCount]);

  // ── 소리 미리 듣기 (추가 다이얼로그) ────────────────────────────────

  const stopPreview = useCallback(() => {
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewId(null);
  }, []);

  useEffect(() => stopPreview, [stopPreview]);

  const togglePreview = (sound: Sound) => {
    if (previewId === sound.id) {
      stopPreview();
      return;
    }
    stopPreview();
    const url = URL.createObjectURL(sound.audioBlob);
    const audio = new Audio(url);
    previewUrlRef.current = url;
    previewAudioRef.current = audio;
    setPreviewId(sound.id);
    audio.onloadedmetadata = () => {
      audio.currentTime = sound.trimStart;
      audio.play().catch(() => stopPreview());
    };
    audio.ontimeupdate = () => {
      if (audio.currentTime >= sound.trimEnd) stopPreview();
    };
    audio.onended = stopPreview;
    audio.onerror = stopPreview;
  };

  // ── WAV 내보내기 ────────────────────────────────────────────────────

  const renderWav = async () => {
    if (!story || story.clips.length === 0 || isRendering) return;

    const playable = story.clips.filter((clip) => buffers[clip.soundId]);
    if (playable.length === 0) {
      toast({
        title: '저장할 소리가 없어요',
        description: '소리 블록을 먼저 놓아 주세요.',
        variant: 'destructive',
      });
      return;
    }

    setIsRendering(true);
    toast({ title: '음원을 만드는 중이에요', description: '잠시만 기다려 주세요.' });

    try {
      const totalSeconds = playable.reduce(
        (max, clip) =>
          Math.max(max, clip.startTime + (clip.trimEnd - clip.trimStart)),
        0,
      );
      const sampleRate = 44100;
      const length = Math.max(1, Math.ceil(totalSeconds * sampleRate));
      const offline = new OfflineAudioContext(2, length, sampleRate);

      playable.forEach((clip) => {
        const buffer = buffers[clip.soundId];
        const clipLength = clip.trimEnd - clip.trimStart;
        const source = offline.createBufferSource();
        source.buffer = buffer;
        const gain = offline.createGain();
        gain.gain.setValueAtTime(clip.volume, clip.startTime);

        if (clip.fadeIn > 0) {
          gain.gain.setValueAtTime(0.0001, clip.startTime);
          gain.gain.linearRampToValueAtTime(
            clip.volume,
            clip.startTime + Math.min(clip.fadeIn, clipLength),
          );
        }
        if (clip.fadeOut > 0) {
          const fadeStart =
            clip.startTime + Math.max(0, clipLength - clip.fadeOut);
          gain.gain.setValueAtTime(clip.volume, fadeStart);
          gain.gain.linearRampToValueAtTime(
            0.0001,
            clip.startTime + clipLength,
          );
        }

        source.connect(gain);
        gain.connect(offline.destination);
        source.start(clip.startTime, clip.trimStart, clipLength);
      });

      const rendered = await offline.startRendering();
      downloadBlob(
        audioBufferToWav(rendered),
        `${toSafeFileName(story.title, '소리이야기')}.wav`,
      );

      const skipped = story.clips.length - playable.length;
      toast({
        title: '음원을 저장했어요',
        description: skipped
          ? `열 수 없는 소리 ${skipped}개는 빠졌어요.`
          : 'WAV 파일이 만들어졌어요.',
      });
    } catch {
      toast({
        title: '음원을 만들지 못했어요',
        description: '이야기가 너무 길면 실패할 수 있어요.',
        variant: 'destructive',
      });
    } finally {
      setIsRendering(false);
    }
  };

  if (!story) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-background">
        <p className="font-bold text-muted-foreground">불러오는 중…</p>
      </div>
    );
  }

  const contentWidth = Math.max(320, duration * pxPerSecond);
  const lanesHeight = trackCount * TRACK_HEIGHT;
  const tickStep = pxPerSecond >= 72 ? 1 : pxPerSecond >= 36 ? 2 : 5;

  return (
    <div
      className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background"
      style={{ paddingTop: 'var(--sd-safe-top)' }}
    >
      {/* ── 헤더 ───────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-border bg-card px-3 py-2.5 md:gap-3 md:px-6 md:py-3">
        <Button
          size="icon-sm"
          variant="muted"
          aria-label="이야기 목록으로"
          onClick={() => {
            stopPlayback();
            setLocation('/stories');
          }}
        >
          <span className="material-symbols-rounded text-2xl" aria-hidden="true">
            arrow_back
          </span>
        </Button>

        <Input
          value={story.title}
          aria-label="이야기 제목"
          maxLength={40}
          onChange={(event) =>
            setStory({ ...story, title: event.target.value })
          }
          onBlur={(event) =>
            saveStory({
              ...story,
              title: event.target.value.trim() || '새 이야기',
              updatedAt: Date.now(),
            })
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className="h-11 flex-1 border-transparent bg-transparent px-3 text-lg font-extrabold hover:border-border focus-visible:bg-card md:text-xl"
        />

        <Button
          variant="secondary"
          size="sm"
          disabled={isRendering || story.clips.length === 0}
          onClick={renderWav}
          className="shrink-0"
        >
          <span className="material-symbols-rounded text-xl" aria-hidden="true">
            {isRendering ? 'hourglass_top' : 'download'}
          </span>
          <span className="hidden sm:inline">
            {isRendering ? '만드는 중…' : '음원 저장'}
          </span>
        </Button>
      </header>

      {/* ── 도구 막대 ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-b-2 border-border bg-card px-3 py-2 md:px-6">
        <div className="flex items-center gap-2">
        <Button
          size="icon"
          aria-label={isPlaying ? '멈추기' : '재생하기'}
          variant={isPlaying ? 'muted' : 'default'}
          onClick={togglePlayback}
        >
          <span className="material-symbols-rounded text-2xl" aria-hidden="true">
            {isPlaying ? 'pause' : 'play_arrow'}
          </span>
        </Button>
        <Button
          size="icon"
          variant="muted"
          aria-label="처음으로"
          onClick={() => {
            stopPlayback();
            setPlayheadTime(0);
            scrollerRef.current?.scrollTo({ left: 0 });
          }}
        >
          <span className="material-symbols-rounded text-2xl" aria-hidden="true">
            skip_previous
          </span>
        </Button>
        <span
          className="w-16 shrink-0 font-mono text-lg font-extrabold tabular-nums text-foreground md:text-xl"
          aria-live="off"
        >
          {formatTime(playheadTime)}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex items-center rounded-xl border-2 border-border">
            <Button
              size="none"
              variant="ghost"
              aria-label="타임라인 축소"
              disabled={zoomIndex === 0}
              className="size-9 rounded-l-lg"
              onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
            >
              <span
                className="material-symbols-rounded text-xl"
                aria-hidden="true"
              >
                zoom_out
              </span>
            </Button>
            <Button
              size="none"
              variant="ghost"
              aria-label="타임라인 확대"
              disabled={zoomIndex === ZOOM_LEVELS.length - 1}
              className="size-9 rounded-r-lg"
              onClick={() =>
                setZoomIndex((index) =>
                  Math.min(ZOOM_LEVELS.length - 1, index + 1),
                )
              }
            >
              <span
                className="material-symbols-rounded text-xl"
                aria-hidden="true"
              >
                zoom_in
              </span>
            </Button>
          </div>

          <div className="flex items-center rounded-xl border-2 border-border">
            <Button
              size="none"
              variant="ghost"
              aria-label="트랙 줄이기"
              disabled={trackCount <= 1}
              className="size-9 rounded-l-lg"
              onClick={removeTrack}
            >
              <span
                className="material-symbols-rounded text-xl"
                aria-hidden="true"
              >
                remove
              </span>
            </Button>
            <span className="w-6 text-center font-mono text-sm font-extrabold tabular-nums">
              {trackCount}
            </span>
            <Button
              size="none"
              variant="ghost"
              aria-label="트랙 늘리기"
              disabled={trackCount >= MAX_TRACKS}
              className="size-9 rounded-r-lg"
              onClick={addTrack}
            >
              <span
                className="material-symbols-rounded text-xl"
                aria-hidden="true"
              >
                add
              </span>
            </Button>
          </div>

          {/* 넓은 화면: 도구 막대 오른쪽 끝 */}
          <Button
            variant="accent"
            className="hidden md:inline-flex"
            onClick={() => setIsLibraryOpen(true)}
          >
            <span
              className="material-symbols-rounded text-xl"
              aria-hidden="true"
            >
              add_circle
            </span>
            소리 추가
          </Button>
        </div>
        </div>

        {/*
          좁은 화면에서는 도구가 두 줄로 접히면서 가장 중요한 버튼이
          구석에 밀렸습니다. 모바일에서는 전체 폭 기본 액션으로 분리합니다.
        */}
        <Button
          variant="accent"
          size="lg"
          className="mt-2 w-full md:hidden"
          onClick={() => setIsLibraryOpen(true)}
        >
          <span className="material-symbols-rounded text-xl" aria-hidden="true">
            add_circle
          </span>
          소리 추가
        </Button>
      </div>

      {/* ── 본문: 타임라인 + 인스펙터 ──────────────────────────────── */}
      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative flex min-h-0 flex-1 overflow-y-auto bg-muted/30">
          <div className="flex min-h-full w-full">
            {/* 트랙 번호 열 — 가로 스크롤 밖에 두어 항상 제자리에 있습니다 */}
            <div
              className="shrink-0 border-r-2 border-border bg-card"
              style={{ width: GUTTER_WIDTH }}
              aria-hidden="true"
            >
              <div style={{ height: RULER_HEIGHT }} />
              {Array.from({ length: trackCount }).map((_, index) => {
                const color = trackColor(index);
                return (
                  <div
                    key={index}
                    className="flex items-center justify-center"
                    style={{ height: TRACK_HEIGHT }}
                  >
                    <span
                      className="grid size-8 place-items-center rounded-lg text-sm font-extrabold"
                      style={{
                        color: color.edge,
                        border: `2px solid ${color.bg}`,
                      }}
                    >
                      {index + 1}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 가로 스크롤 레인 */}
            <div
              ref={scrollerRef}
              className="custom-scrollbar min-w-0 flex-1 overflow-x-auto"
            >
              {/* min-w-full: 이야기가 짧아도 눈금과 트랙이 화면 끝까지 이어집니다 */}
              <div
                className="relative min-w-full"
                style={{
                  width: contentWidth,
                  height: RULER_HEIGHT + lanesHeight,
                }}
                onPointerDown={handleLanePointerDown}
                onPointerUp={handleLanePointerUp}
              >
                {/* 눈금자 */}
                <div
                  className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur"
                  style={{ height: RULER_HEIGHT }}
                >
                  {Array.from({
                    length: Math.floor(duration / tickStep) + 1,
                  }).map((_, index) => {
                    const seconds = index * tickStep;
                    return (
                      <span
                        key={seconds}
                        className="absolute top-0 border-l border-border/70 pl-1 font-mono text-[10px] font-bold text-muted-foreground"
                        style={{
                          left: seconds * pxPerSecond,
                          height: RULER_HEIGHT,
                        }}
                      >
                        {formatClock(seconds)}
                      </span>
                    );
                  })}
                </div>

                {/* 트랙 배경 */}
                {Array.from({ length: trackCount }).map((_, index) => (
                  <div
                    key={index}
                    className={cn(
                      'absolute left-0 right-0 border-b border-border/60',
                      index % 2 === 1 && 'bg-black/[0.015]',
                    )}
                    style={{
                      top: RULER_HEIGHT + index * TRACK_HEIGHT,
                      height: TRACK_HEIGHT,
                    }}
                  />
                ))}

                {/* 소리 블록 */}
                {story.clips.map((clip) => {
                  const sound = sounds[clip.soundId];
                  if (!sound) return null;
                  const selected = clip.id === selectedClipId;
                  const clipLength = clip.trimEnd - clip.trimStart;
                  const width = Math.max(28, clipLength * pxPerSecond);
                  const color = trackColor(clip.track);
                  const peaks = clipPeaks[clip.soundId];

                  return (
                    <div
                      key={clip.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${sound.name} 블록, ${clip.track + 1}번 줄, ${formatClock(clip.startTime)}부터`}
                      aria-pressed={selected}
                      className={cn(
                        'absolute flex touch-none select-none items-center overflow-hidden rounded-lg px-1.5 transition-shadow',
                        'cursor-grab active:cursor-grabbing',
                        selected && 'ring-3 ring-foreground ring-offset-1',
                      )}
                      style={{
                        left: clip.startTime * pxPerSecond,
                        width,
                        top:
                          RULER_HEIGHT +
                          clip.track * TRACK_HEIGHT +
                          CLIP_INSET / 2,
                        height: TRACK_HEIGHT - CLIP_INSET,
                        backgroundColor: color.bg,
                        borderBottom: `3px solid ${color.edge}`,
                        color: color.ink,
                        boxShadow: selected
                          ? '0 6px 14px rgba(15,23,42,0.22)'
                          : '0 2px 4px rgba(15,23,42,0.12)',
                      }}
                      onPointerDown={(event) =>
                        handleClipPointerDown(event, clip)
                      }
                      onPointerMove={handleClipPointerMove}
                      onPointerUp={endClipDrag}
                      onPointerCancel={endClipDrag}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedClipId(clip.id);
                        }
                      }}
                    >
                      {/* 이 소리의 실제 파형 */}
                      {peaks ? (
                        <div className="pointer-events-none absolute inset-x-1 inset-y-2 flex items-center gap-[1px] opacity-35">
                          {peaks.map((value, index) => (
                            <div
                              key={index}
                              className="min-h-[2px] flex-1 rounded-full bg-current"
                              style={{ height: `${Math.round(value * 100)}%` }}
                            />
                          ))}
                        </div>
                      ) : null}
                      <span className="pointer-events-none relative w-full truncate text-center text-xs font-extrabold drop-shadow-sm">
                        {sound.name}
                      </span>
                    </div>
                  );
                })}

                {/* 재생 위치 */}
                <div
                  className="pointer-events-none absolute z-30 w-[2px] bg-destructive"
                  style={{
                    left: playheadTime * pxPerSecond,
                    top: 0,
                    height: RULER_HEIGHT + lanesHeight,
                  }}
                >
                  <span className="absolute -left-[5px] top-0 size-3 rounded-full border-2 border-background bg-destructive" />
                </div>

              </div>
            </div>
          </div>

          {/*
            빈 타임라인 안내는 가로 스크롤 영역 밖에 둡니다.
            안쪽에 두면 타임라인 전체 폭(예: 520px) 기준으로 가운데 정렬돼
            좁은 화면에서는 오른쪽으로 밀려 잘렸습니다.
          */}
          {story.clips.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
              <div className="sd-card max-w-xs border-dashed p-5 text-center">
                <span
                  className="material-symbols-rounded text-4xl text-primary/40"
                  aria-hidden="true"
                >
                  waving_hand
                </span>
                <h2 className="mt-2 text-base font-extrabold text-foreground">
                  타임라인이 비어 있어요
                </h2>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  ‘소리 추가’를 눌러 첫 소리 블록을 놓아 보세요.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* 인스펙터 — 데스크톱은 오른쪽 패널, 모바일은 아래 시트 */}
        <aside
          className={cn(
            'shrink-0 border-border bg-card',
            'md:flex md:h-full md:w-[320px] md:flex-col md:border-l-2 lg:w-[360px]',
            selectedClip
              ? 'max-h-[min(54vh,27rem)] overflow-y-auto border-t-2 shadow-[0_-8px_24px_rgba(15,23,42,0.1)] md:max-h-none md:shadow-none'
              : 'hidden md:flex',
          )}
          aria-label="블록 설정"
        >
          {selectedClip ? (
            <ClipInspector
              clip={selectedClip}
              soundName={sounds[selectedClip.soundId]?.name ?? '소리'}
              trackCount={trackCount}
              onClose={() => setSelectedClipId(null)}
              onChange={(updates) => updateClip(selectedClip.id, updates)}
              onFade={setFade}
              onDelete={() => deleteClip(selectedClip.id)}
            />
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center gap-2 p-6 text-center md:flex">
              <span
                className="material-symbols-rounded text-5xl text-muted-foreground/40"
                aria-hidden="true"
              >
                touch_app
              </span>
              <p className="font-extrabold text-foreground">
                블록을 눌러 편집해요
              </p>
              <p className="text-sm font-semibold text-muted-foreground">
                빈 곳을 누르면 재생 위치가 옮겨져요.
                <br />
                스페이스바로 재생/멈춤을 할 수 있어요.
              </p>
            </div>
          )}
        </aside>
      </main>

      <BrandFooter
        variant="bar"
        className="shrink-0 border-t-2 border-border"
      />
      <div style={{ height: 'var(--sd-safe-bottom)' }} aria-hidden="true" />

      {/* ── 소리 추가 ──────────────────────────────────────────────── */}
      <Dialog
        open={isLibraryOpen}
        onOpenChange={(open) => {
          setIsLibraryOpen(open);
          if (!open) stopPreview();
        }}
      >
        <DialogContent className="flex max-h-[80dvh] flex-col">
          <DialogHeader>
            <DialogTitle>소리 고르기</DialogTitle>
            <DialogDescription>
              들어보고 마음에 드는 소리를 재생 위치(
              {formatClock(playheadTime)})에 놓아요.
            </DialogDescription>
          </DialogHeader>

          <div className="custom-scrollbar -mr-2 mt-2 flex-1 overflow-y-auto pr-2">
            {librarySounds.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-border bg-muted/40 px-4 py-10 text-center">
                <p className="font-extrabold text-foreground">
                  소리함이 비어 있어요
                </p>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  먼저 녹음 화면에서 소리를 담아 주세요.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {librarySounds.map((sound) => (
                  <li
                    key={sound.id}
                    className="flex items-center gap-2 rounded-xl border-2 border-border bg-card p-2"
                  >
                    <Button
                      size="icon-sm"
                      variant={previewId === sound.id ? 'default' : 'muted'}
                      aria-label={`${sound.name} 미리 듣기`}
                      onClick={() => togglePreview(sound)}
                    >
                      <span
                        className="material-symbols-rounded text-2xl"
                        aria-hidden="true"
                      >
                        {previewId === sound.id ? 'pause' : 'play_arrow'}
                      </span>
                    </Button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold">{sound.name}</p>
                      <p className="font-mono text-xs font-bold text-muted-foreground">
                        {formatTime(sound.trimEnd - sound.trimStart)}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => addClip(sound)}>
                      추가
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClipInspector({
  clip,
  soundName,
  trackCount,
  onClose,
  onChange,
  onFade,
  onDelete,
}: {
  clip: SoundClip;
  soundName: string;
  trackCount: number;
  onClose: () => void;
  onChange: (updates: Partial<SoundClip>) => void;
  onFade: (type: 'fadeIn' | 'fadeOut', value: number) => void;
  onDelete: () => void;
}) {
  const clipLength = clip.trimEnd - clip.trimStart;
  const fadeMaxReached = clip.fadeIn + clip.fadeOut >= clipLength;

  return (
    <div className="flex flex-col gap-5 p-4 pb-8 md:p-6">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-extrabold text-foreground">
            {soundName}
          </h2>
          <p className="font-mono text-xs font-bold text-muted-foreground">
            {formatClock(clip.startTime)} 부터 · {formatTime(clipLength)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="설정 닫기"
          onClick={onClose}
        >
          <span className="material-symbols-rounded text-xl" aria-hidden="true">
            close
          </span>
        </Button>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-muted-foreground">줄 옮기기</p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: trackCount }).map((_, index) => {
            const color = trackColor(index);
            const active = clip.track === index;
            return (
              <button
                key={index}
                type="button"
                aria-label={`${index + 1}번 줄로 옮기기`}
                aria-pressed={active}
                className={cn(
                  'size-11 rounded-xl text-lg font-extrabold transition-all',
                  active ? 'ring-3 ring-foreground ring-offset-2' : 'opacity-70',
                )}
                style={{
                  backgroundColor: color.bg,
                  color: color.ink,
                  borderBottom: `3px solid ${color.edge}`,
                }}
                onClick={() => onChange({ track: index })}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label
          htmlFor="clip-volume"
          className="mb-2 flex justify-between text-sm font-bold text-muted-foreground"
        >
          <span>소리 크기</span>
          <span className="font-mono text-foreground">
            {Math.round(clip.volume * 100)}%
          </span>
        </label>
        <Slider
          id="clip-volume"
          min={0}
          max={2}
          step={0.05}
          value={clip.volume}
          onChange={(event) =>
            onChange({
              volume: parseFloat((event.target as HTMLInputElement).value),
            })
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FadeControl
          label="서서히 커지기"
          value={clip.fadeIn}
          canIncrease={!fadeMaxReached}
          onChange={(value) => onFade('fadeIn', value)}
        />
        <FadeControl
          label="서서히 작아지기"
          value={clip.fadeOut}
          canIncrease={!fadeMaxReached}
          onChange={(value) => onFade('fadeOut', value)}
        />
      </div>

      <Button variant="destructive" size="lg" onClick={onDelete}>
        <span className="material-symbols-rounded text-xl" aria-hidden="true">
          delete
        </span>
        이 블록 지우기
      </Button>
    </div>
  );
}

function FadeControl({
  label,
  value,
  canIncrease,
  onChange,
}: {
  label: string;
  value: number;
  canIncrease: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-border bg-muted/40 p-3">
      <span className="text-xs font-bold text-muted-foreground">
        {label} (초)
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          size="none"
          variant="soft"
          className="size-9 rounded-lg"
          aria-label={`${label} 1초 줄이기`}
          disabled={value <= 0}
          onClick={() => onChange(value - 1)}
        >
          <span className="material-symbols-rounded text-lg" aria-hidden="true">
            remove
          </span>
        </Button>
        <span className="min-w-0 flex-1 text-center font-mono text-base font-extrabold tabular-nums">
          {value}
        </span>
        <Button
          size="none"
          variant="soft"
          className="size-9 rounded-lg"
          aria-label={`${label} 1초 늘리기`}
          disabled={!canIncrease}
          onClick={() => onChange(value + 1)}
        >
          <span className="material-symbols-rounded text-lg" aria-hidden="true">
            add
          </span>
        </Button>
      </div>
    </div>
  );
}
