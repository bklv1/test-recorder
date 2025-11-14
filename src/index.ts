import { TestRecorder } from './test-recorder';

/**
 * Main entry point for the test recorder application
 */
async function main(): Promise<void> {
  const recorder = new TestRecorder();
  await recorder.run();
}

// Run the application
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});