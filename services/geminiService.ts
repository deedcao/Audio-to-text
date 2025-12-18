import { GoogleGenAI } from "@google/genai";
import { SupportedLanguage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Using gemini-3-flash-preview for better instruction following in text tasks
const MODEL_NAME = 'gemini-3-flash-preview';

/**
 * Helper to retry operations on transient failures (network, 5xx) and rate limits (429).
 */
async function retryOperation<T>(operation: () => Promise<T>, retries = 5, delay = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    let errString = '';
    try {
      errString = JSON.stringify(error);
    } catch {
      errString = error.toString();
    }
    
    const message = error.message || '';
    const fullErrorText = (message + ' ' + errString).toLowerCase();
    
    const isRateLimit = fullErrorText.includes("429") || 
                        fullErrorText.includes("quota") || 
                        fullErrorText.includes("resource_exhausted");

    const isNetworkError = fullErrorText.includes("rpc failed") || 
                           fullErrorText.includes("xhr error") || 
                           fullErrorText.includes("fetch failed") || 
                           fullErrorText.includes("500") ||
                           fullErrorText.includes("503");
                           
    if (retries > 0 && (isNetworkError || isRateLimit)) {
      const waitTime = isRateLimit ? Math.max(delay, 15000) : delay;
      console.warn(`Operation failed (${isRateLimit ? 'Rate Limit' : 'Network'}), retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return retryOperation(operation, retries - 1, waitTime * 2);
    }
    throw error;
  }
}

/**
 * Splits text into manageable chunks for API processing.
 */
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
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Transcribes audio content using Gemini.
 */
export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      config: {
        systemInstruction: `You are a professional stenographer.
        Task: Transcribe the audio accurately.
        Rules:
        1. Identify speakers (e.g., Speaker 1, Speaker 2).
        2. If Chinese is detected, output ONLY Simplified Chinese (简体中文).
        3. Maintain verbatim accuracy.
        4. Format with clear paragraphs and line breaks between speakers.`
      },
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Audio } },
          { text: "Transcribe this audio. Ensure all Chinese output is in Simplified Chinese." }
        ]
      }
    });
    return response.text || "";
  });
};

/**
 * Ensures text style consistency (Simplified Chinese focus).
 */
export const unifyTranscriptStyle = async (text: string, onProgress?: (percent: number) => void): Promise<string> => {
  if (onProgress) onProgress(0);
  const hasChinese = /[\u4e00-\u9fa5]/.test(text);
  if (!hasChinese) {
    if (onProgress) onProgress(100);
    return text;
  }

  const TRADITIONAL_INDICATORS = ['這', '個', '們', '來', '對', '時', '說', '會', '為', '國', '學', '後', '實', '體', '業'];
  const hasTraditional = TRADITIONAL_INDICATORS.some(char => text.includes(char));

  if (!hasTraditional) {
    if (onProgress) onProgress(100);
    return text;
  }

  const chunks = splitTextIntoChunks(text, 5000);
  const processedChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const res = await retryOperation(async () => {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Task: Convert all Traditional Chinese characters to Simplified Chinese. 
        Keep formatting, speaker labels, and non-Chinese text exactly as is.
        
        Text:
        ${chunks[i]}`
      });
      return response.text || chunks[i];
    });
    processedChunks.push(res);
    if (onProgress) onProgress(Math.round(((i + 1) / chunks.length) * 100));
  }
  return processedChunks.join('\n\n');
};

/**
 * Translates text with high-intensity completeness instructions.
 */
export const translateText = async (
  text: string, 
  targetLanguage: SupportedLanguage,
  onProgress?: (percent: number) => void
): Promise<string> => {
  const chunks = splitTextIntoChunks(text, 4000); // Smaller chunks for higher precision
  const translatedChunks: string[] = [];
  
  if (onProgress) onProgress(0);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkTranslation = await retryOperation(async () => {
      const prompt = `Task: Translate the following text COMPLETELY into ${targetLanguage}.
      
      CRITICAL INSTRUCTIONS:
      1. TRANSLATE 100% of the content. Do NOT leave any words, phrases, or sentences in the original language.
      2. No "lazy translation": Ensure every single line is converted to ${targetLanguage}.
      3. Speaker labels: Translate "Speaker" to the equivalent in ${targetLanguage} (e.g., "发言人" for Chinese).
      4. Formatting: Maintain the exact paragraph structure and line breaks.
      5. Tone: Preserve the original speaker's tone and intent.
      6. Verbatim: Do not summarize or omit anything.
      
      Original Text Segment:
      """
      ${chunk}
      """
      
      Translated Text in ${targetLanguage}:`;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt
      });

      return response.text || "";
    });
    
    translatedChunks.push(chunkTranslation);
    if (onProgress) onProgress(Math.round(((i + 1) / chunks.length) * 100));
  }

  return translatedChunks.join('\n\n');
};

/**
 * Generates meeting minutes/summary.
 */
export const generateSummary = async (text: string, language: SupportedLanguage): Promise<string> => {
  return retryOperation(async () => {
    const prompt = `Task: Create structured Meeting Minutes in ${language} based on the provided text.
    
    Required Sections:
    1. **Overview**: General topic and context.
    2. **Key Points**: Critical information discussed.
    3. **Action Items**: Decisions made or future tasks.
    
    Text:
    "${text.substring(0, 15000)}"`;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt
    });
    return response.text || "";
  });
};
