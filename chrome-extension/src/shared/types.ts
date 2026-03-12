export type RecordingStage = 'GIVEN' | 'WHEN' | 'THEN';

export interface RecordedEvent {
  type: 'click' | 'type' | 'select' | 'check';
  role: string;
  name: string;
  value?: string;
  url: string;
  timestamp: number;
}

export interface StageData {
  [url: string]: RecordedEvent[];
}

export interface RecordingState {
  isRecording: boolean;
  currentStage: RecordingStage;
  stages: Record<RecordingStage, StageData>;
}

export type MessageAction =
  | { action: 'startRecording' }
  | { action: 'stopRecording' }
  | { action: 'switchStage'; stage: RecordingStage }
  | { action: 'recordEvent'; event: RecordedEvent }
  | { action: 'getState' }
  | { action: 'getRecording' }
  | { action: 'getRecordingState' };

export interface MessageResponse {
  success: boolean;
  state?: RecordingState;
  text?: string;
  error?: string;
}
