import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { config } from '../config.js';
import { badRequest } from './http.js';

/**
 * Files are stored under an opaque random key outside any public directory and are only
 * served through an authorised endpoint that checks task access first.
 */

const DOCUMENT_TYPES: Record<string, string[]> = {
  // detected mime → allowed original extensions
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'image/heic': ['heic'],
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'application/x-cfb': ['doc', 'xls', 'ppt'],
};

const TEXT_EXTENSIONS: Record<string, string> = { txt: 'text/plain', csv: 'text/csv' };

const AUDIO_TYPES = new Set(['audio/webm', 'video/webm', 'audio/ogg', 'audio/mp4', 'video/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/wav', 'audio/x-wav']);

export const ALLOWED_UPLOAD_LABEL = 'images, PDF, Word, Excel, PowerPoint, TXT or CSV';

function extensionOf(name: string): string {
  return path.extname(name).slice(1).toLowerCase();
}

function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 4096);
  for (const byte of sample) if (byte === 0) return false;
  return true;
}

/** Validates content by magic bytes (not the client-supplied mime type) and returns the trusted mime type. */
export async function validateDocument(file: Express.Multer.File): Promise<string> {
  if (!file.size) throw badRequest('The selected file is empty.');
  if (file.size > config.maxUploadBytes) throw badRequest('File upload failed. Maximum file size is 10 MB.');
  const ext = extensionOf(file.originalname);
  const detected = await fileTypeFromBuffer(file.buffer);

  if (detected) {
    const allowedExt = DOCUMENT_TYPES[detected.mime];
    if (allowedExt && allowedExt.includes(ext)) {
      if (detected.mime === 'application/x-cfb') {
        return ext === 'doc' ? 'application/msword' : ext === 'xls' ? 'application/vnd.ms-excel' : 'application/vnd.ms-powerpoint';
      }
      return detected.mime;
    }
  } else if (TEXT_EXTENSIONS[ext] && looksLikeText(file.buffer)) {
    return TEXT_EXTENSIONS[ext];
  }
  throw badRequest(`This file type is not supported. Allowed: ${ALLOWED_UPLOAD_LABEL}.`);
}

export async function validateAudio(file: Express.Multer.File): Promise<string> {
  if (!file.size) throw badRequest('The recording is empty.');
  if (file.size > config.maxVoiceBytes) throw badRequest('Voice note is too long. Please keep it under 5 MB.');
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !AUDIO_TYPES.has(detected.mime)) throw badRequest('Voice note format is not supported.');
  // Browsers record audio-only WebM/MP4 which is sometimes sniffed as video; serve it as audio.
  return detected.mime.replace(/^video\//, 'audio/');
}

export async function saveFile(buffer: Buffer): Promise<string> {
  await fs.mkdir(config.storageDir, { recursive: true });
  const key = crypto.randomBytes(20).toString('hex');
  await fs.writeFile(path.join(config.storageDir, key), buffer, { flag: 'wx' });
  return key;
}

export function filePath(key: string): string {
  if (!/^[a-f0-9]{40}$/.test(key)) throw new Error('Invalid storage key');
  return path.join(config.storageDir, key);
}

export async function deleteFile(key: string): Promise<void> {
  await fs.rm(filePath(key), { force: true });
}

/** Strip path components and control characters from a user-supplied file name. */
export function safeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim();
  return (cleaned || 'file').slice(0, 200);
}
