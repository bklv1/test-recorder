export interface Config { base_url: string; }

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
  assertedEvents: Array<{ type: 'navigation'; url: string }>;
}

export interface ClickStep {
  type: 'click';
  target: 'main';
  selectors: string[][];
  offsetX: number;
  offsetY: number;
}

export interface ChangeStep {
  type: 'change';
  target: 'main';
  selectors: string[][];
  value: string;
}

export type Step = SetViewportStep | NavigateStep | ClickStep | ChangeStep;

export interface Recording {
  title: string;
  steps: Step[];
}

// Raw events captured by injected JS
export interface RawClickEvent {
  selectors: string[][];
  offsetX: number;
  offsetY: number;
}

export interface RawChangeEvent {
  selectors: string[][];
  value: string;
}
