// 오디오 유틸리티

let sharedAudioContext: AudioContext | null = null;

/** 재생·디코딩에 공통으로 쓰는 AudioContext (모바일 정책상 하나만 유지) */
export function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    sharedAudioContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
}

// ── WAV 인코딩 ──────────────────────────────────────────────────────────

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;

  let samples: Float32Array;
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    samples = new Float32Array(left.length * 2);
    for (let i = 0; i < left.length; i += 1) {
      samples[i * 2] = left[i];
      samples[i * 2 + 1] = right[i];
    }
  } else {
    samples = buffer.getChannelData(0);
  }

  return encodeWav(samples, numChannels, sampleRate, bitDepth);
}

function encodeWav(
  samples: Float32Array,
  numChannels: number,
  sampleRate: number,
  bitDepth: number,
): Blob {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, 'WAVE');

  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += bytesPerSample) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

// ── 내보내기 ────────────────────────────────────────────────────────────

/**
 * 잘라둔 구간만 WAV로 내보냅니다.
 *
 * VER1은 원본 Blob을 그대로 내려받으면서 확장자를 항상 `.webm`으로 붙였습니다.
 * iOS Safari의 녹음 형식은 mp4라서 실제로는 열리지 않는 파일이 만들어졌고,
 * 잘라낸 구간도 반영되지 않았습니다. 이제는 어느 기기에서 녹음했든
 * 어디서나 열리는 WAV로, 편집한 구간만 저장합니다.
 */
export async function renderTrimmedWav(
  blob: Blob,
  trimStart: number,
  trimEnd: number,
): Promise<Blob> {
  const source = await decodeAudioBlob(blob);
  const start = clamp(trimStart, 0, source.duration);
  const end = clamp(trimEnd, start, source.duration);
  const length = Math.max(1, Math.round((end - start) * source.sampleRate));
  const startFrame = Math.round(start * source.sampleRate);

  const channelCount = Math.min(2, source.numberOfChannels);
  const ctx = new OfflineAudioContext(channelCount, length, source.sampleRate);
  const trimmed = ctx.createBuffer(channelCount, length, source.sampleRate);

  for (let c = 0; c < channelCount; c += 1) {
    const from = source.getChannelData(c);
    const to = trimmed.getChannelData(c);
    for (let i = 0; i < length; i += 1) {
      to[i] = from[startFrame + i] ?? 0;
    }
  }

  return audioBufferToWav(trimmed);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** 파일명에 쓸 수 없는 문자를 정리합니다. */
export function toSafeFileName(name: string, fallback = 'soridam') {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return cleaned || fallback;
}

/**
 * 브라우저 다운로드.
 * revokeObjectURL을 즉시 호출하면 일부 브라우저에서 전송이 끊기므로
 * 문서에 붙였다 떼고 다음 태스크에서 해제합니다.
 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
