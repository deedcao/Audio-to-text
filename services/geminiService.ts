import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { SupportedLanguage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = 'gemini-3-flash-preview';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';

/**
 * Base64 Encoding Helper
 */
export function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Helper to retry operations on transient failures.
 */
async function retryOperation<T>(operation: () => Promise<T>, retries = 5, delay = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    let errString = error.toString();
    const fullErrorText = errString.toLowerCase();
    
    const isRateLimit = fullErrorText.includes("429") || fullErrorText.includes("quota");
    const isNetworkError = fullErrorText.includes("rpc failed") || fullErrorText.includes("fetch failed") || fullErrorText.includes("500");
                           
    if (retries > 0 && (isNetworkError || isRateLimit)) {
      const waitTime = isRateLimit ? Math.max(delay, 15000) : delay;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return retryOperation(operation, retries - 1, waitTime * 2);
    }
    throw error;
  }
}

function splitTextIntoChunks(text: string, limit: number = 4000): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  const lines = text.split('\n');
  for (const line of lines) {
    if (currentChunk.length > 0 && currentChunk.length + line.length > limit) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += line + '\n';
  }
  if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
  return chunks;
}

/**
 * Setup a Live API session for continuous transcription with speaker distinction.
 */
export const startLiveTranscription = (callbacks: {
  onTranscript: (text: string) => void;
  onTurnComplete: () => void;
  onError: (error: any) => void;
  onClose: () => void;
}) => {
  const sessionPromise = ai.live.connect({
    model: LIVE_MODEL,
    callbacks: {
      onopen: () => console.log("Live session opened"),
      onmessage: async (message: LiveServerMessage) => {
        if (message.serverContent?.outputTranscription) {
          const text = message.serverContent.outputTranscription.text;
          if (text) callbacks.onTranscript(text);
        }

        if (message.serverContent?.turnComplete) {
          callbacks.onTurnComplete();
        }
      },
      onerror: (e) => callbacks.onError(e),
      onclose: (e) => callbacks.onClose(),
    },
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {}, 
      systemInstruction: "You are a professional verbatim meeting transcriber. 1. Transcribe the audio EXACTLY in the language it is spoken. 2. DO NOT translate the content into any other language. 3. DO NOT identify real names. Use generic labels like 'Speaker A:', 'Speaker B:', etc. 4. If Chinese is spoken, output Simplified Chinese. 5. Maintain clear paragraph breaks.",
    },
  });

  return sessionPromise;
};

/**
 * Transcribe full audio file with generic speaker labels and strict source language preservation.
 */
export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      config: {
        systemInstruction: `You are a professional verbatim stenographer. 1. Transcribe the audio exactly in its original language. 2. CRITICAL: DO NOT translate the speech. If the speaker speaks English, write English. If they speak Chinese, write Chinese. 3. Use generic speaker labels like 'Speaker A:', 'Speaker B:'. 4. DO NOT attempt to identify or guess real names. 5. If Chinese is detected, use Simplified Chinese.`
      },
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Audio } },
          { text: "Verbatim transcription in original language only." }
        ]
      }
    });
    return response.text || "";
  });
};

/**
 * Ensure the final transcript adheres to simplified Chinese and clean labels without translating.
 */
export const unifyTranscriptStyle = async (text: string, onProgress?: (percent: number) => void): Promise<string> => {
  if (onProgress) onProgress(0);
  const chunks = splitTextIntoChunks(text, 5000);
  const processedChunks: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const res = await retryOperation(async () => {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Please refine the formatting of this transcript. 1. KEEP the original language. DO NOT TRANSLATE. 2. Ensure speaker labels are consistently formatted as 'Speaker X:'. 3. Ensure any Chinese content is Simplified Chinese. 4. Remove any accidentally identified real names and replace them with 'Speaker X'. Text:\n${chunks[i]}`
      });
      return response.text || chunks[i];
    });
    processedChunks.push(res);
    if (onProgress) onProgress(Math.round(((i + 1) / chunks.length) * 100));
  }
  return processedChunks.join('\n\n');
};

/**
 * Translate text while maintaining generic speaker labels.
 */
export const translateText = async (text: string, targetLanguage: SupportedLanguage, onProgress?: (percent: number) => void): Promise<string> => {
  const chunks = splitTextIntoChunks(text, 4000);
  const translatedChunks: string[] = [];
  if (onProgress) onProgress(0);
  for (let i = 0; i < chunks.length; i++) {
    const chunkTranslation = await retryOperation(async () => {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Translate the following meeting transcript into ${targetLanguage}. 1. Maintain generic speaker labels like 'Speaker A:', 'Speaker B:'. DO NOT replace them with names. 2. Translate the labels themselves if appropriate (e.g., 'Speaker A' becomes '发言人 A' in Chinese). 3. Preserve the tone and verbatim meaning. Fragment:\n${chunks[i]}`
      });
      return response.text || "";
    });
    translatedChunks.push(chunkTranslation);
    if (onProgress) onProgress(Math.round(((i + 1) / chunks.length) * 100));
  }
  return translatedChunks.join('\n\n');
};

export const generateSummary = async (text: string, language: SupportedLanguage): Promise<string> => {
  return retryOperation(async () => {
    const prompt = `Generate a structured meeting summary in ${language} based on the transcript provided. Use generic references like 'Speaker A' or 'Speaker B'. DO NOT include real names. Include: Overview, Key Discussion Points, and Action Items. Text:\n"${text.substring(0, 15000)}"`;
    const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt });
    return response.text || "";
  });
};