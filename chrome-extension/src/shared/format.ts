import { Recording } from './types';

export function formatRecording(recording: Recording): string {
  return JSON.stringify(recording, null, 2);
}
