import { decodeAudioBlob } from './audio';

/**
 * 실제 오디오 파형.
 *
 * VER1의 파형은 `Math.sin(i * 12.9898) * 43758.5453` 로 만든 가짜 막대였습니다.
 * 어떤 소리든 똑같은 모양이 나와서 아이들이 "어디를 잘라야 할지" 눈으로
 * 판단할 수 없었습니다. 여기서는 디코딩한 PCM에서 구간별 RMS를 뽑아
 * 실제 소리의 크기 변화를 그립니다.
 */

const MIN_BAR = 0.08;

export function peaksFromBuffer(buffer: AudioBuffer, bucketCount = 96) {
  const buckets = Math.max(1, Math.floor(bucketCount));
  const length = buffer.length;
  if (length === 0) return new Array<number>(buckets).fill(MIN_BAR);

  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    channels.push(buffer.getChannelData(c));
  }

  const step = length / buckets;
  const peaks = new Array<number>(buckets);
  let max = 0;

  for (let i = 0; i < buckets; i += 1) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.min(length, Math.floor((i + 1) * step)));

    let sumSquares = 0;
    let count = 0;
    // 긴 오디오에서도 즉시 그려지도록 구간당 최대 512개 표본만 훑습니다.
    const stride = Math.max(1, Math.floor((end - start) / 512));
    for (let j = start; j < end; j += stride) {
      for (let c = 0; c < channels.length; c += 1) {
        const v = channels[c][j];
        sumSquares += v * v;
        count += 1;
      }
    }

    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
    peaks[i] = rms;
    if (rms > max) max = rms;
  }

  if (max > 0) {
    for (let i = 0; i < buckets; i += 1) {
      // sqrt 로 한 번 더 펴서 조용한 소리도 눈에 보이게 합니다.
      peaks[i] = Math.max(MIN_BAR, Math.sqrt(peaks[i] / max));
    }
  } else {
    peaks.fill(MIN_BAR);
  }

  return peaks;
}

/** 같은 소리를 다시 디코딩하지 않도록 id별로 캐시 */
const cache = new Map<string, number[]>();
const pending = new Map<string, Promise<number[]>>();

export async function getPeaks(
  cacheKey: string,
  blob: Blob,
  bucketCount = 96,
): Promise<number[]> {
  const key = `${cacheKey}:${bucketCount}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const inflight = pending.get(key);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const buffer = await decodeAudioBlob(blob);
      const peaks = peaksFromBuffer(buffer, bucketCount);
      cache.set(key, peaks);
      return peaks;
    } catch {
      // 디코딩 실패 시에도 UI가 비어 보이지 않도록 평평한 파형을 돌려줍니다.
      const fallback = new Array<number>(bucketCount).fill(0.25);
      cache.set(key, fallback);
      return fallback;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, task);
  return task;
}

export function forgetPeaks(cacheKey: string) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${cacheKey}:`)) cache.delete(key);
  }
}
