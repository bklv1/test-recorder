export interface SetViewportStep {
  type: 'setViewport';
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  isLandscape: boolean;
}

export interface NavigateStep {
  type: 'navigate';
  url: string;
  assertedEvents: Array<{ type: 'navigation'; url: string; title: string }>;
}

export interface ClickStep {
  type: 'click';
  target: 'main';
  selectors: string[][];
  offsetX: number;
  offsetY: number;
  assertedEvents: Array<{ type: 'navigation'; url: string; title: string }>;
}

export interface ChangeStep {
  type: 'change';
  target: 'main';
  selectors: string[][];
  value: string;
}

export interface ScrollStep {
  type: 'scroll';
  target: 'main';
  x: number;
  y: number;
}

export type CdpStep = SetViewportStep | NavigateStep | ClickStep | ChangeStep | ScrollStep;

export interface Recording {
  title: string;
  steps: CdpStep[];
}

export interface RecordingState {
  isRecording: boolean;
  recording: Recording;
}

export type MessageAction =
  | { action: 'startRecording' }
  | { action: 'stopRecording' }
  | { action: 'recordStep'; step: CdpStep }
  | { action: 'getState' }
  | { action: 'getRecording' }
  | { action: 'getRecordingState' };

export interface MessageResponse {
  success: boolean;
  state?: RecordingState;
  text?: string;
  error?: string;
}
