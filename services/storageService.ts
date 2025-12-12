import { ArchiveRecord, SupportedLanguage } from "../types";

const STORAGE_KEY = "audioglot_archive_v1";
const MAX_RECORDS = 50;

/**
 * Generates a unique ID for a file based on its metadata.
 * This serves as a composite key for "Same File" detection.
 */
export const generateFileSignature = (file: File): string => {
  return `${file.name}-${file.size}-${file.lastModified}`;
};

export const getArchive = (): ArchiveRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Failed to load archive", error);
    return [];
  }
};

export const saveRecord = (record: ArchiveRecord): void => {
  try {
    const archive = getArchive();
    // Remove existing record with same ID if exists (update)
    const filtered = archive.filter(r => r.id !== record.id);
    
    // Add new record at the beginning
    const newArchive = [record, ...filtered].slice(0, MAX_RECORDS);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newArchive));
  } catch (error) {
    console.error("Failed to save record", error);
  }
};

export const deleteRecord = (id: string): ArchiveRecord[] => {
  try {
    const archive = getArchive();
    const newArchive = archive.filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newArchive));
    return newArchive;
  } catch (error) {
    console.error("Failed to delete record", error);
    return [];
  }
};

/**
 * Attempts to find a matching record for a specific file based on metadata.
 */
export const findRecordForFile = (file: File): ArchiveRecord | undefined => {
  const archive = getArchive();
  // We match loosely on name and size to be safe, or exact timestamp if possible
  return archive.find(r => 
    r.fileName === file.name && 
    r.fileSize === file.size && 
    Math.abs(r.lastModified - file.lastModified) < 1000 // Allow small time diff
  );
};