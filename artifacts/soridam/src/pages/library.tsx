import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'wouter';
import { db, type Sound } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrimSlider } from '@/components/ui/trim-slider';
import { usePeaks } from '@/components/ui/waveform';
import { PageShell, PageHeader, EmptyState } from '@/components/page-header';
import { formatTime, formatDate, cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { renderTrimmedWav, downloadBlob, toSafeFileName } from '@/lib/audio';
import { forgetPeaks } from '@/lib/waveform';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const SORTS = [
  { id: 'recent', label: '최신순' },
  { id: 'name', label: '이름순' },
  { id: 'longest', label: '긴 소리순' },
] as const;

type SortId = (typeof SORTS)[number]['id'];

export default function Library() {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortId>('recent');
  const { toast } = useToast();

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [editSound, setEditSound] = useState<Sound | null>(null);
  const [editName, setEditName] = useState('');
  const [editTrimStart, setEditTrimStart] = useState(0);
  const [editTrimEnd, setEditTrimEnd] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Sound | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const editPeaks = usePeaks(editSound?.id, editSound?.audioBlob, 72);

  const loadSounds = useCallback(async () => {
    try {
      setSounds(await db.getSounds());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSounds();
  }, [loadSounds]);

  /** 재생을 멈추고 objectURL을 반드시 해제합니다 (VER1의 누수 지점). */
  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    audioRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPlayingId(null);
    setPlayProgress(0);
  }, []);

  // 다른 화면으로 이동할 때 소리가 계속 나지 않도록 정리합니다.
  useEffect(() => stopPlayback, [stopPlayback]);

  const handlePlay = (sound: Sound) => {
    if (playingId === sound.id) {
      stopPlayback();
      return;
    }
    stopPlayback();

    const url = URL.createObjectURL(sound.audioBlob);
    const audio = new Audio(url);
    objectUrlRef.current = url;
    audioRef.current = audio;
    setPlayingId(sound.id);
    setPlayProgress(0);

    const span = Math.max(0.01, sound.trimEnd - sound.trimStart);

    audio.onloadedmetadata = () => {
      audio.currentTime = sound.trimStart;
      audio.play().catch(() => {
        stopPlayback();
        toast({
          title: '재생할 수 없어요',
          description: '화면을 한 번 더 눌러 주세요.',
          variant: 'destructive',
        });
      });
    };
    audio.ontimeupdate = () => {
      setPlayProgress(
        Math.min(1, Math.max(0, (audio.currentTime - sound.trimStart) / span)),
      );
      if (audio.currentTime >= sound.trimEnd) stopPlayback();
    };
    audio.onended = stopPlayback;
    audio.onerror = stopPlayback;
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (playingId === deleteTarget.id) stopPlayback();
    await db.deleteSound(deleteTarget.id);
    forgetPeaks(deleteTarget.id);
    setDeleteTarget(null);
    loadSounds();
    toast({ title: '소리를 지웠어요' });
  };

  const openEdit = (sound: Sound) => {
    setEditSound(sound);
    setEditName(sound.name);
    setEditTrimStart(sound.trimStart);
    setEditTrimEnd(sound.trimEnd);
  };

  const saveEdit = async () => {
    if (!editSound) return;
    try {
      await db.saveSound({
        ...editSound,
        name: editName.trim() || editSound.name,
        trimStart: editTrimStart,
        trimEnd: editTrimEnd,
        updatedAt: Date.now(),
      });
      setEditSound(null);
      loadSounds();
      toast({ title: '수정했어요' });
    } catch {
      toast({ title: '수정하지 못했어요', variant: 'destructive' });
    }
  };

  /**
   * 잘라둔 구간만 WAV로 내려받습니다.
   * VER1은 원본을 항상 `.webm`으로 저장해 아이폰에서 열리지 않았습니다.
   */
  const downloadSound = async (sound: Sound) => {
    if (downloadingId) return;
    setDownloadingId(sound.id);
    try {
      const wav = await renderTrimmedWav(
        sound.audioBlob,
        sound.trimStart,
        sound.trimEnd,
      );
      downloadBlob(wav, `${toSafeFileName(sound.name)}.wav`);
      toast({ title: '음원을 내려받았어요' });
    } catch {
      toast({
        title: '내려받지 못했어요',
        description: '소리를 다시 열어 확인해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const visible = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? sounds.filter((sound) => sound.name.toLowerCase().includes(query))
      : sounds.slice();

    switch (sort) {
      case 'name':
        return filtered.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      case 'longest':
        return filtered.sort(
          (a, b) =>
            b.trimEnd - b.trimStart - (a.trimEnd - a.trimStart),
        );
      default:
        return filtered.sort((a, b) => b.createdAt - a.createdAt);
    }
  }, [sounds, searchQuery, sort]);

  return (
    <PageShell width="default">
      <PageHeader
        title="소리함"
        description={
          sounds.length > 0
            ? `담아둔 소리 ${sounds.length}개`
            : '녹음한 소리가 여기에 모여요'
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="relative">
          <span
            className="material-symbols-rounded pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground"
            aria-hidden="true"
          >
            search
          </span>
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="소리 이름으로 찾기"
            aria-label="소리 이름으로 찾기"
            className="h-14 rounded-2xl border-2 border-border bg-card pl-12 pr-12 text-base font-bold focus:border-primary"
          />
          {searchQuery ? (
            <Button
              variant="ghost"
              size="none"
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 size-10 -translate-y-1/2 rounded-full"
              onClick={() => setSearchQuery('')}
            >
              <span
                className="material-symbols-rounded text-xl"
                aria-hidden="true"
              >
                close
              </span>
            </Button>
          ) : null}
        </div>

        <div
          className="flex gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label="정렬 방식"
        >
          {SORTS.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={sort === option.id ? 'default' : 'soft'}
              aria-pressed={sort === option.id}
              onClick={() => setSort(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center font-bold text-muted-foreground">
          불러오는 중…
        </p>
      ) : visible.length === 0 ? (
        searchQuery ? (
          <EmptyState
            icon="search_off"
            title="찾는 소리가 없어요"
            description={`‘${searchQuery}’와(과) 이름이 맞는 소리가 없어요.`}
            action={
              <Button variant="soft" onClick={() => setSearchQuery('')}>
                검색어 지우기
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon="library_music"
            title="아직 담아둔 소리가 없어요"
            description="녹음 화면에서 주변 소리를 담으면 여기에 모입니다."
            action={
              <Button asChild size="lg">
                <Link href="/">
                  <span
                    className="material-symbols-rounded text-xl"
                    aria-hidden="true"
                  >
                    mic
                  </span>
                  소리 녹음하러 가기
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((sound) => {
            const isPlaying = playingId === sound.id;
            return (
              <li
                key={sound.id}
                className={cn(
                  'sd-card overflow-hidden p-3 transition-colors sm:p-4',
                  isPlaying && 'border-primary',
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                  <Button
                    size="icon"
                    variant={isPlaying ? 'default' : 'muted'}
                    aria-label={`${sound.name} ${isPlaying ? '멈추기' : '들어보기'}`}
                    className="shrink-0"
                    onClick={() => handlePlay(sound)}
                  >
                    <span
                      className="material-symbols-rounded text-3xl"
                      aria-hidden="true"
                    >
                      {isPlaying ? 'pause' : 'play_arrow'}
                    </span>
                  </Button>

                  <div className="min-w-0 flex-1 basis-28">
                    <h2 className="truncate text-lg font-extrabold text-foreground">
                      {sound.name}
                    </h2>
                    <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <span className="font-mono tabular-nums">
                        {formatTime(sound.trimEnd - sound.trimStart)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatDate(sound.createdAt)}</span>
                    </p>
                  </div>

                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${sound.name} 고치기`}
                      onClick={() => openEdit(sound)}
                    >
                      <span
                        className="material-symbols-rounded text-2xl"
                        aria-hidden="true"
                      >
                        edit
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${sound.name} 음원 내려받기`}
                      disabled={downloadingId === sound.id}
                      onClick={() => downloadSound(sound)}
                    >
                      <span
                        className="material-symbols-rounded text-2xl"
                        aria-hidden="true"
                      >
                        {downloadingId === sound.id
                          ? 'hourglass_top'
                          : 'download'}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${sound.name} 삭제`}
                      className="text-destructive hover:bg-destructive-tint"
                      onClick={() => setDeleteTarget(sound)}
                    >
                      <span
                        className="material-symbols-rounded text-2xl"
                        aria-hidden="true"
                      >
                        delete
                      </span>
                    </Button>
                  </div>
                </div>

                {isPlaying ? (
                  <div
                    className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label="재생 위치"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(playProgress * 100)}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-100 ease-linear"
                      style={{ width: `${playProgress * 100}%` }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* 소리 고치기 */}
      <Dialog
        open={!!editSound}
        onOpenChange={(open) => !open && setEditSound(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>소리 고치기</DialogTitle>
            <DialogDescription>
              이름과 사용할 소리 구간을 바꿀 수 있어요.
            </DialogDescription>
          </DialogHeader>

          {editSound ? (
            <div className="flex flex-col gap-5 py-2">
              <div>
                <label
                  htmlFor="edit-sound-name"
                  className="mb-2 block text-sm font-bold text-muted-foreground"
                >
                  이름
                </label>
                <Input
                  id="edit-sound-name"
                  value={editName}
                  maxLength={40}
                  onChange={(event) => setEditName(event.target.value)}
                  className="h-13 rounded-xl border-2 text-lg font-extrabold"
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-bold text-muted-foreground">
                  길이 조절
                </p>
                <TrimSlider
                  duration={editSound.duration}
                  trimStart={editTrimStart}
                  trimEnd={editTrimEnd}
                  peaks={editPeaks}
                  onChange={(start, end) => {
                    setEditTrimStart(start);
                    setEditTrimEnd(end);
                  }}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" size="lg" onClick={() => setEditSound(null)}>
              취소
            </Button>
            <Button size="lg" onClick={saveEdit}>
              저장하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-1 grid size-14 place-items-center rounded-2xl bg-destructive-tint text-destructive sm:mx-0">
              <span
                className="material-symbols-rounded text-3xl"
                aria-hidden="true"
              >
                delete
              </span>
            </div>
            <AlertDialogTitle>이 소리를 지울까요?</AlertDialogTitle>
            <AlertDialogDescription>
              ‘{deleteTarget?.name}’ 소리는 삭제하면 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
