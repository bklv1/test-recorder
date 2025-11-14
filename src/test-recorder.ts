import { Builder, WebDriver, By, until } from 'selenium-webdriver';
import * as chrome from 'selenium-webdriver/chrome';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { simplifyHtml } from './element-simplifier';
import type { Config, ClickedElement, InputEvent, RecordedEvent, PageMap, RecordingStage, StageEvents } from './types';

export class TestRecorder {
  private driver!: WebDriver;
  private pageClicksMap: PageMap<string> = {};
  private pageInputsMap: PageMap<InputEvent> = {};
  private pageEventsMap: PageMap<RecordedEvent> = {};
  private currentUrl: string = '';
  private monitoringInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private currentStage: RecordingStage = 'GIVEN';
  private stageEvents: StageEvents[] = [];

  /**
   * Initialize the Chrome WebDriver with maximized window
   */
  private async initDriver(): Promise<WebDriver> {
    const options = new chrome.Options();
    options.addArguments('--start-maximized');
    
    const driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();
    
    return driver;
  }

  /**
   * Main run method - entry point for the test recorder
   */
  async run(): Promise<void> {
    try {
      this.registerShutdownHooks();
      this.setupStageInput();
      this.driver = await this.initDriver();
      const baseUrl = this.getBaseUrlFromConfig();
      await this.openInitialPage(baseUrl);
      
      console.log('\n=== Test Recorder Started ===');
      console.log('Current Stage: GIVEN');
      console.log('\nPress keys to switch stages:');
      console.log('  G = GIVEN stage');
      console.log('  W = WHEN stage');
      console.log('  T = THEN stage');
      console.log('  Ctrl+C = Stop and generate report\n');
      
      await this.monitorUserInteractions();
    } finally {
      await this.cleanUp();
    }
  }

  /**
   * Set up keyboard input for stage switching
   */
  private setupStageInput(): void {
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      
      process.stdin.on('keypress', (_str, key) => {
        if (key.ctrl && key.name === 'c') {
          // Let the shutdown hooks handle this
          return;
        }
        
        const keyName = key.name?.toUpperCase();
        if (keyName === 'G' || keyName === 'W' || keyName === 'T') {
          this.switchStage(keyName as 'G' | 'W' | 'T');
        }
      });
    }
  }

  /**
   * Switch to a new recording stage
   */
  private switchStage(key: 'G' | 'W' | 'T'): void {
    const stageMap: Record<'G' | 'W' | 'T', RecordingStage> = {
      'G': 'GIVEN',
      'W': 'WHEN',
      'T': 'THEN'
    };
    
    const newStage = stageMap[key];
    if (newStage !== this.currentStage) {
      // Save all events from all pages for current stage before switching
      const allEvents: RecordedEvent[] = [];
      for (const url in this.pageEventsMap) {
        if (this.pageEventsMap[url]?.length > 0) {
          allEvents.push(...this.pageEventsMap[url]);
        }
      }
      
      if (allEvents.length > 0) {
        this.stageEvents.push({
          stage: this.currentStage,
          events: allEvents
        });
      }
      
      // Clear all events for new stage
      this.pageEventsMap = {};
      this.initializePageMaps(this.currentUrl);
      
      this.currentStage = newStage;
      console.log(`\n>>> Switched to ${newStage} stage <<<\n`);
    }
  }

  /**
   * Read and validate the base URL from config.json
   */
  private getBaseUrlFromConfig(): string {
    try {
      const configPath = path.join(process.cwd(), 'config.json');
      const configData = fs.readFileSync(configPath, 'utf-8');
      const config: Config = JSON.parse(configData);
      
      if (!config.base_url) {
        throw new Error("The 'base_url' in config.json is empty.");
      }
      
      return config.base_url;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error("config.json not found. Please create it with a 'base_url' key.");
      }
      if (error instanceof SyntaxError) {
        throw new Error("Invalid JSON in config.json");
      }
      throw error;
    }
  }

  /**
   * Open the initial page and set up event listeners
   */
  private async openInitialPage(url: string): Promise<void> {
    await this.driver.get(url);
    this.currentUrl = await this.driver.getCurrentUrl();
    this.initializePageMaps(this.currentUrl);
    await this.injectEventListeners();
  }

  /**
   * Monitor user interactions in a loop
   */
  private async monitorUserInteractions(): Promise<void> {
    this.isRunning = true;
    
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.handleUrlChange();
        await this.recordAllInteractions();
      } catch (error) {
        // If there's a WebDriver error (browser closed), stop monitoring and print report
        const errorMessage = (error as Error).message || '';
        if (errorMessage.includes('session deleted') || errorMessage.includes('invalid session')) {
          console.log('\nBrowser was closed. Generating final report...\n');
        } else {
          console.error('Error during monitoring:', error);
        }
        this.stopMonitoring();
        await this.printRecordedElements();
        process.exit(0);
      }
    }, 1000); // Poll every 1 second
    
    // Keep the process running
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Stop the monitoring loop
   */
  private stopMonitoring(): void {
    this.isRunning = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }

  /**
   * Handle URL changes and reinject event listeners
   */
  private async handleUrlChange(): Promise<void> {
    const newUrl = await this.driver.getCurrentUrl();
    
    if (this.currentUrl !== newUrl) {
      this.currentUrl = newUrl;
      await this.driver.wait(until.elementLocated(By.tagName('body')), 10000);
      await this.injectEventListeners();
      this.initializePageMaps(this.currentUrl);
    }
  }

  /**
   * Initialize page maps for a given URL
   */
  private initializePageMaps(url: string): void {
    if (!this.pageClicksMap[url]) this.pageClicksMap[url] = [];
    if (!this.pageInputsMap[url]) this.pageInputsMap[url] = [];
    if (!this.pageEventsMap[url]) this.pageEventsMap[url] = [];
  }

  /**
   * Record all types of interactions
   */
  private async recordAllInteractions(): Promise<void> {
    await this.recordClickEvents();
    await this.recordInputEvents();
  }

  /**
   * Record click events from localStorage
   */
  private async recordClickEvents(): Promise<void> {
    const clickedElements = await this.getJsArray<ClickedElement>('localStorage.clickedElements');
    
    for (const clicked of clickedElements) {
      const pageUrl = clicked.url || this.currentUrl;
      const html = clicked.html || '';
      this.appendUnique(this.pageClicksMap, pageUrl, html);
      this.appendEvent(pageUrl, 'click', html);
    }
    
    await this.clearJsArray('localStorage.clickedElements');
  }

  /**
   * Record input events from localStorage
   */
  private async recordInputEvents(): Promise<void> {
    const inputEvents = await this.getJsArray<InputEvent>('localStorage.inputEvents');
    
    for (const event of inputEvents) {
      const value = event.value || '';
      const html = event.html || '';
      
      if (!this.isInputAlreadyRecorded(this.currentUrl, value, html)) {
        this.pageInputsMap[this.currentUrl].push(event);
        console.log(`Input Event: keys sent: ${value}; html element:${html}`);
      }
      
      this.appendEvent(this.currentUrl, 'input', html, value);
    }
    
    await this.clearJsArray('localStorage.inputEvents');
  }

  /**
   * Get a JSON array from JavaScript storage
   */
  private async getJsArray<T>(storageKey: string): Promise<T[]> {
    try {
      const result = await this.driver.executeScript<T[]>(
        `return JSON.parse(${storageKey} || '[]')`
      );
      return result || [];
    } catch {
      return [];
    }
  }

  /**
   * Clear a JSON array in JavaScript storage
   */
  private async clearJsArray(storageKey: string): Promise<void> {
    await this.driver.executeScript(`${storageKey} = JSON.stringify([])`);
  }

  /**
   * Append a unique value to a page map
   */
  private appendUnique(mapping: PageMap<string>, key: string, value: string): void {
    if (!mapping[key]) {
      mapping[key] = [];
    }
    
    if (!mapping[key].includes(value)) {
      mapping[key].push(value);
      console.log(`Clicked Element: ${value} (URL: ${key})`);
    }
  }

  /**
   * Check if an input event is already recorded
   */
  private isInputAlreadyRecorded(url: string, value: string, html: string): boolean {
    return this.pageInputsMap[url].some(
      (e) => e.value === value && e.html === html
    );
  }

  /**
   * Append an event to the events map
   */
  private appendEvent(
    url: string,
    eventType: 'click' | 'input',
    html: string,
    value?: string
  ): void {
    if (!this.pageEventsMap[url]) {
      this.pageEventsMap[url] = [];
    }
    
    const event: RecordedEvent = { type: eventType, html, value };
    this.pageEventsMap[url].push(event);
  }

  /**
   * Inject JavaScript event listeners into the page
   */
  private async injectEventListeners(): Promise<void> {
    await this.driver.executeScript(this.getEventListenerScript());
  }

  /**
   * Get the JavaScript code for event listeners
   */
  private getEventListenerScript(): string {
    return `
      if (!window.__testRecorderInjected) {
        window.__testRecorderInjected = true;
        if (!localStorage.clickedElements) localStorage.clickedElements = JSON.stringify([]);
        if (!localStorage.inputEvents) localStorage.inputEvents = JSON.stringify([]);
        document.addEventListener('click', function(event) {
          var element = event.target;
          var arr = JSON.parse(localStorage.clickedElements);
          arr.push({
            html: element.outerHTML,
            url: window.location.href
          });
          localStorage.clickedElements = JSON.stringify(arr);
        }, true);
        document.addEventListener('input', function(event) {
          var element = event.target;
          if (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea') {
            var arr = JSON.parse(localStorage.inputEvents);
            arr.push({
              value: element.value,
              html: element.outerHTML
            });
            localStorage.inputEvents = JSON.stringify(arr);
          }
        }, true);
      }
    `;
  }

  /**
   * Register shutdown hooks for cleanup
   */
  private registerShutdownHooks(): void {
    const cleanup = async () => {
      this.stopMonitoring();
      await this.printRecordedElements();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);  // Ctrl+C
    process.on('SIGTERM', cleanup); // Kill signal
    process.on('exit', () => {
      this.stopMonitoring();
    });
  }

  /**
   * Print all recorded elements on shutdown
   */
  private async printRecordedElements(): Promise<void> {
    // Save final stage events from all pages
    const allEvents: RecordedEvent[] = [];
    for (const url in this.pageEventsMap) {
      if (this.pageEventsMap[url]?.length > 0) {
        allEvents.push(...this.pageEventsMap[url]);
      }
    }
    
    if (allEvents.length > 0) {
      this.stageEvents.push({
        stage: this.currentStage,
        events: allEvents
      });
    }
    
    console.log('\n=== Test Recording Complete ===\n');
    this.printEventsByStage();
  }

  /**
   * Print events organized by Given-When-Then stages
   */
  private printEventsByStage(): void {
    const stages: RecordingStage[] = ['GIVEN', 'WHEN', 'THEN'];
    
    for (const stage of stages) {
      const stageEventsList = this.stageEvents.filter(se => se.stage === stage);
      
      if (stageEventsList.length === 0) continue;
      
      console.log(`\n=== ${stage} ===`);
      
      // Combine all events for this stage
      const allEvents: RecordedEvent[] = [];
      for (const se of stageEventsList) {
        allEvents.push(...se.events);
      }
      
      // Build a map of element identifier to last event
      const lastEventMap = new Map<string, RecordedEvent>();
      const eventOrder: string[] = [];
      
      for (const event of allEvents) {
        const elementId = this.getElementIdentifier(event.html);
        
        // If this element hasn't been seen, track its order
        if (!lastEventMap.has(elementId)) {
          eventOrder.push(elementId);
        }
        
        // Always update with the latest event for this element
        lastEventMap.set(elementId, event);
      }
      
      // Print only the last event for each unique element in order
      let number = 1;
      for (const elementId of eventOrder) {
        const event = lastEventMap.get(elementId)!;
        const html = simplifyHtml(event.html);
        
        if (event.type === 'input') {
          const value = event.value || '';
          // Only print if there's actually a value
          if (value) {
            console.log(`${number}. keys sent: ${value}; html element:${html}`);
            number++;
          }
        } else if (event.type === 'click') {
          console.log(`${number}. ${html}`);
          number++;
        }
      }
    }
  }

  /**
   * Extract a stable identifier from HTML for element comparison
   */
  private getElementIdentifier(html: string): string {
    // Try to extract id, name, or a combination of attributes
    const idMatch = html.match(/id="([^"]+)"/);
    if (idMatch) return `id:${idMatch[1]}`;
    
    const nameMatch = html.match(/name="([^"]+)"/);
    if (nameMatch) return `name:${nameMatch[1]}`;
    
    const placeholderMatch = html.match(/placeholder="([^"]+)"/);
    const typeMatch = html.match(/type="([^"]+)"/);
    if (placeholderMatch && typeMatch) {
      return `type-placeholder:${typeMatch[1]}-${placeholderMatch[1]}`;
    }
    
    // Fallback to simplified HTML
    return simplifyHtml(html);
  }

  /**
   * Clean up resources
   */
  private async cleanUp(): Promise<void> {
    try {
      if (this.driver) {
        await this.driver.quit();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}