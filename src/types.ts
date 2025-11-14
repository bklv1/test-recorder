/**
 * Configuration interface for the test recorder
 */
export interface Config {
  base_url: string;
}

/**
 * Represents a clicked element captured during recording
 */
export interface ClickedElement {
  html: string;
  url: string;
}

/**
 * Represents an input event captured during recording
 */
export interface InputEvent {
  value: string;
  html: string;
}

/**
 * Represents a recorded event (click or input)
 */
export interface RecordedEvent {
  type: 'click' | 'input';
  html: string;
  value?: string;
  url: string;
}

/**
 * Generic type for page-based mapping of elements/events
 */
export type PageMap<T> = Record<string, T[]>;

/**
 * Recording stage for BDD-style test organization
 */
export type RecordingStage = 'GIVEN' | 'WHEN' | 'THEN';

/**
 * Events organized by stage
 */
export interface StageEvents {
  stage: RecordingStage;
  events: RecordedEvent[];
}