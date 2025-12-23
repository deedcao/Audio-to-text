
/**
 * Audio processing utilities to handle large files by resampling and chunking.
 * This allows us to bypass the 20MB API payload limit by sending smaller, optimized chunks.
 */

// WAV Header constants
const NUM_CHANNELS = 1;
const SAMPLE_RATE = 16000;
const BIT_DEPTH = 16;

/**
 * Encodes Float32 PCM data to WAV format
 */
function encodeWAV(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, NUM_CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * NUM_CHANNELS * 2, true);
  view.setUint16(32, NUM_CHANNELS * 2, true);
  view.setUint16(34, BIT_DEPTH, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write PCM samples
  floatTo16BitPCM(view, 44, samples);

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

/**
 * Converts a File to AudioBuffer
 */
async function decodeAudio(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  return await audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Converts AudioBuffer to 16kHz Mono Float32Array
 */
async function resampleAndMixDown(audioBuffer: AudioBuffer): Promise<Float32Array> {
  const offlineCtx = new OfflineAudioContext(
    NUM_CHANNELS,
    audioBuffer.duration * SAMPLE_RATE,
    SAMPLE_RATE
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();

  const renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer.getChannelData(0);
}

/**
 * Processes a large audio file: Decodes -> Resamples (16k Mono) -> Chunks -> Encodes to WAV
 * Returns an array of base64 strings ready for API
 */
export const processLargeAudioFile = async (file: File): Promise<string[]> => {
  try {
    // 1. Decode
    const audioBuffer = await decodeAudio(file);
    
    // 2. Resample to 16kHz Mono (drastically reduces size)
    const pcmData = await resampleAndMixDown(audioBuffer);

    // 3. Chunk it
    // Increase chunk size to 180 seconds (3 minutes)
    // Larger chunks provide much better context for the LLM to understand flow
    // 180 * 16000 samples = 2,880,000 samples
    // 2,880,000 * 2 bytes = ~5.76 MB raw PCM -> ~7.6 MB Base64
    // This is well within the typical 20MB limit for API requests.
    const SAMPLES_PER_CHUNK = 180 * SAMPLE_RATE; 
    const chunks: string[] = [];

    for (let i = 0; i < pcmData.length; i += SAMPLES_PER_CHUNK) {
      const end = Math.min(i + SAMPLES_PER_CHUNK, pcmData.length);
      const chunkData = pcmData.slice(i, end);
      const wavBuffer = encodeWAV(chunkData);
      const base64 = arrayBufferToBase64(wavBuffer);
      chunks.push(base64);
    }

    return chunks;

  } catch (error) {
    console.error("Error processing audio file:", error);
    throw new Error("音频解码失败。文件可能损坏，或超出了浏览器处理能力。");
  }
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
