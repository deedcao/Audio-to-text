import { GoogleGenAI } from "@google/genai";
import { SupportedLanguage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = 'gemini-2.5-flash';

/**
 * Helper to retry operations on transient failures (network, 5xx).
 */
async function retryOperation<T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isNetworkError = error.message?.includes("Rpc failed") || 
                           error.message?.includes("xhr error") || 
                           error.toString().includes("500") ||
                           error.toString().includes("503");
                           
    if (retries > 0 && isNetworkError) {
      console.warn(`Operation failed, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryOperation(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Splits text into manageable chunks for API processing.
 * Preserves sentence/line integrity where possible.
 */
function splitTextIntoChunks(text: string, limit: number = 6000): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  const lines = text.split('\n');

  for (const line of lines) {
    // If adding this line exceeds limit, push current chunk and start new
    if (currentChunk.length > 0 && currentChunk.length + line.length > limit) {
      chunks.push(currentChunk);
      currentChunk = '';
    }
    currentChunk += line + '\n';
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Transcribes audio content using Gemini.
 * @param base64Audio The base64 string of the audio (without data prefix).
 * @param mimeType The mime type of the audio file.
 */
export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  return retryOperation(async () => {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Audio
              }
            },
            {
              text: "Please provide a verbatim transcription of this audio file. Identify different speakers (e.g., Speaker 1, Speaker 2). Format the output as a clean dialogue script. **Start each speaker's turn on a new line and separate different speakers with an empty line to ensure clear structure.** Do not add any introductory or concluding remarks, just the transcription text. If the audio is silent or unintelligible, simply state '[Inaudible]'."
            }
          ]
        }
      });

      return response.text || "";
    } catch (error: any) {
      console.error("Transcription error:", error);
      // Improve error messages for common issues
      if (error.message?.includes("Rpc failed") || error.toString().includes("500")) {
        throw new Error("Network error during upload. The file is likely too large (browser XHR limit). Please try a smaller file (under 20MB) or split the audio.");
      }
      throw new Error("Failed to transcribe audio. Please ensure the file is valid and try again.");
    }
  });
};

/**
 * Translates text into a target language.
 * Handles large texts by chunking them to avoid XHR limits.
 * @param text The source text to translate.
 * @param targetLanguage The target language enum value.
 */
export const translateText = async (text: string, targetLanguage: SupportedLanguage): Promise<string> => {
  // If text is small enough, send it in one go
  if (text.length < 6000) {
    return retryOperation(async () => {
      try {
        const prompt = `Translate the following transcript into ${targetLanguage}. 
        Strictly maintain the original formatting, including line breaks and speaker labels (e.g., Speaker 1:, Speaker 2:).
        Ensure that different speakers remain separated by empty lines, just like the original text.
        Ensure the tone and nuance of the original text are preserved. 
        Do not add notes or explanations.
        
        Text to translate:
        "${text}"`;

        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt
        });

        return response.text || "";
      } catch (error: any) {
        console.error("Translation error:", error);
        if (error.message?.includes("Rpc failed") || error.toString().includes("500")) {
           throw new Error("Network error during translation. The text might be too long.");
        }
        throw new Error(`Failed to translate text to ${targetLanguage}.`);
      }
    });
  }

  // If text is large, use chunking strategy
  const chunks = splitTextIntoChunks(text, 6000);
  const translatedChunks: string[] = [];
  
  // Process chunks sequentially to maintain order and stability
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const chunkTranslation = await retryOperation(async () => {
        const prompt = `Translate the following transcript segment into ${targetLanguage}. 
        Strictly maintain the original formatting, including line breaks and speaker labels.
        Ensure that different speakers remain separated by empty lines.
        Do not add notes or explanations.
        
        Text to translate:
        "${chunk}"`;

        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt
        });

        return response.text || "";
      });
      
      translatedChunks.push(chunkTranslation);
    } catch (error) {
      console.error(`Failed to translate chunk ${i + 1}/${chunks.length}`, error);
      throw new Error(`Failed to translate part of the text (segment ${i + 1}).`);
    }
  }

  return translatedChunks.join('\n');
};

/**
 * Generates a structured summary (Meeting Minutes) from the text.
 * @param text The text to summarize (usually the translated text).
 * @param language The language to generate the summary in.
 */
export const generateSummary = async (text: string, language: SupportedLanguage): Promise<string> => {
  return retryOperation(async () => {
    try {
      const prompt = `Please provide a structured summary (Meeting Minutes) of the following text in ${language}.
      
      Structure the output with the following sections (use appropriate headers in ${language}):
      1. **Overview/Topic**: A brief 1-2 sentence summary of what was discussed.
      2. **Key Points**: Bullet points of the main arguments or topics.
      3. **Action Items / Conclusions**: If any actions, decisions, or next steps were mentioned.
      
      Keep it professional, concise, and easy to read.
      
      Text to summarize:
      "${text.substring(0, 15000)}"`; // Limit context for summary to avoid huge payloads if text is massive

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt
      });

      return response.text || "";
    } catch (error: any) {
      console.error("Summary error:", error);
      throw new Error("Failed to generate summary.");
    }
  });
};
