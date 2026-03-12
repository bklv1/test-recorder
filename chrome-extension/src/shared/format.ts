import { RecordedEvent, RecordingStage, StageData } from './types';

const STAGES: RecordingStage[] = ['GIVEN', 'WHEN', 'THEN'];

function deduplicateEvents(events: RecordedEvent[]): RecordedEvent[] {
  const seen = new Map<string, RecordedEvent>();
  for (const event of events) {
    const key = `${event.type}::${event.role}::${event.name}`;
    // For type events keep last value; for clicks just keep last occurrence
    seen.set(key, event);
  }
  return Array.from(seen.values());
}

function describeEvent(event: RecordedEvent): string {
  switch (event.type) {
    case 'click':
      return `Clicked ${event.role} "${event.name}"`;
    case 'type':
      return `Typed "${event.value ?? ''}" in ${event.role} "${event.name}"`;
    case 'select':
      return `Selected "${event.value ?? ''}" in ${event.role} "${event.name}"`;
    case 'check':
      return `${event.value === 'true' ? 'Checked' : 'Unchecked'} ${event.role} "${event.name}"`;
    case 'pick':
      return `Selected "${event.value ?? ''}" for ${event.role} "${event.name}"`;
    default:
      return `Interacted with ${event.role} "${event.name}"`;
  }
}

export function formatRecording(stages: Record<RecordingStage, StageData>): string {
  const lines: string[] = ['=== Test Recording ===', ''];

  for (const stage of STAGES) {
    const stageData = stages[stage];
    const urls = Object.keys(stageData);
    if (urls.length === 0) continue;

    lines.push(`=== ${stage} ===`);

    for (const url of urls) {
      const events = deduplicateEvents(stageData[url]);
      if (events.length === 0) continue;

      lines.push(`## ${url}`, '');
      events.forEach((event, i) => {
        lines.push(`${i + 1}. ${describeEvent(event)}`);
      });
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}
