
import { GoogleGenAI } from "@google/genai";
import { SupportedLanguage } from "../types";

// Helper to get a fresh AI instance with the current process.env.API_KEY
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_PRO = 'gemini-3-pro-preview';
const MODEL_FLASH = 'gemini-3-flash-preview';

async function retryOperation<T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const errString = error.toString().toLowerCase();
    if (errString.includes("429") || errString.includes("quota")) {
       throw new Error("QUOTA_EXHAUSTED");
    }
    if (retries > 0 && (errString.includes("500") || errString.includes("timeout") || errString.includes("deadline"))) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryOperation(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * High-precision verbatim transcription.
 * Strictly enforces Simplified Chinese for any detected Chinese dialects.
 */
export const transcribeAudio = async (base64Audio: string, mimeType: string, isChunk: boolean = true): Promise<string> => {
  return retryOperation(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: MODEL_FLASH,
      config: {
        systemInstruction: `You are a world-class professional transcriptionist. 
Your goal is to provide a strictly VERBATIM (word-for-word) transcript.

CRITICAL RULES:
1. Transcribe EXACTLY what is said. DO NOT summarize or paraphrase.
2. CHINESE LANGUAGE RULE: If the audio is in ANY Chinese dialect (Mandarin, Cantonese, etc.), you MUST output ONLY Simplified Chinese (简体中文). NEVER use Traditional characters.
3. If the audio is in English, use standard English.
4. Maintain the original language in this step. DO NOT translate yet.
5. Identify speakers as "SPEAKER 1:", "SPEAKER 2:", etc.
6. Output ONLY the transcript text.`
      },
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Audio } }, 
          { text: `Transcribe this audio verbatim. If Chinese is detected, use Simplified Chinese characters only.` }
        ]
      }
    });
    return response.text || "";
  });
};

/**
 * Merges chunks and fixes boundary issues without losing data.
 */
export const unifyTranscriptStyle = async (text: string): Promise<string> => {
  if (text.length < 50) return text;

  return retryOperation(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: MODEL_FLASH, 
      config: {
        systemInstruction: `You are a transcript editor. Merge multiple chunks into a cohesive document.
1. Fix split sentences at chunk boundaries.
2. Keep speaker labels consistent.
3. DO NOT SUMMARIZE. DO NOT REMOVE CONTENT.
4. MANDATORY: All Chinese text must be Simplified Chinese (简体中文).`
      },
      contents: `Polish and merge this transcript while maintaining its verbatim nature and using Simplified Chinese:\n\n${text}`
    });
    return response.text || text;
  });
};

export const translateText = async (text: string, targetLanguage: SupportedLanguage, onProgress?: (p: number) => void): Promise<string> => {
  return retryOperation(async () => {
    const ai = getAI();
    const isSimplifiedTarget = targetLanguage === SupportedLanguage.CHINESE_SIMPLIFIED;
    
    const response = await ai.models.generateContent({
      model: MODEL_PRO,
      contents: `Translate the following transcript into ${targetLanguage}. 
- Keep "SPEAKER X:" labels exactly as they are.
- Translate accurately without skipping content.
${isSimplifiedTarget ? '- Use Simplified Chinese (简体中文) ONLY. No traditional characters.' : ''}\n\n${text}`
    });
    if (onProgress) onProgress(100);
    return response.text || "";
  });
};

export const generateSummary = async (text: string, language: SupportedLanguage): Promise<string> => {
  return retryOperation(async () => {
    const ai = getAI();
    const isSimplifiedTarget = language === SupportedLanguage.CHINESE_SIMPLIFIED;
    
    const response = await ai.models.generateContent({
      model: MODEL_PRO,
      contents: `Generate a detailed professional summary and key takeaways in ${language}.
${isSimplifiedTarget ? '- Use Simplified Chinese (简体中文) ONLY.' : ''}\n\n${text}`
    });
    return response.text || "";
  });
};
