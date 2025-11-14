import { Builder, WebDriver, By, until } from 'selenium-webdriver';
import * as chrome from 'selenium-webdriver/chrome';
import * as fs from 'fs';
import * as path from 'path';
import { simplifyHtml } from './element-simplifier';
import type { Config, ClickedElement, InputEvent, RecordedEvent, PageMap } from './types';

export class TestRecorder {
  private driver!: WebDriver;
  private pageClicksMap: PageMap<string> = {};
  private pageHoversMap: PageMap<string> = {};
  private pageInputsMap: PageMap<InputEvent> = {};
  private pageEventsMap: PageMap<RecordedEvent> = {};
  private currentUrl: string = '';
  private monitoringInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

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
      this.driver = await this.initDriver();
      const baseUrl = this.getBaseUrlFromConfig();
      await this.openInitialPage(baseUrl);
      await this.monitorUserInteractions();
    } finally {
      await this.cleanUp();
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
    if (!this.pageHoversMap[url]) this.pageHoversMap[url] = [];
    if (!this.pageInputsMap[url]) this.pageInputsMap[url] = [];
    if (!this.pageEventsMap[url]) this.pageEventsMap[url] = [];
  }

  /**
   * Record all types of interactions
   */
  private async recordAllInteractions(): Promise<void> {
    await this.recordClickEvents();
    await this.recordHoverEvents();
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
   * Record hover events from window variable
   */
  private async recordHoverEvents(): Promise<void> {
    const hoveredHtml = await this.driver.executeScript<string>(
      'return window.hoveredElementHtml;'
    );
    
    if (hoveredHtml && !this.pageHoversMap[this.currentUrl].includes(hoveredHtml)) {
      this.pageHoversMap[this.currentUrl].push(hoveredHtml);
      console.log(`Hovered Element: ${hoveredHtml}`);
    }
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
        var hoverTimeout;
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
        document.addEventListener('mouseover', function(event) {
          var element = event.target;
          hoverTimeout = setTimeout(function() {
            window.hoveredElementHtml = element.outerHTML;
            if (!window.hoveredElements) window.hoveredElements = [];
            window.hoveredElements.push(element.outerHTML);
          }, 5000);
        }, true);
        document.addEventListener('mouseout', function(event) {
          clearTimeout(hoverTimeout);
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
    console.log('Shutdown hook triggered. Printing recorded elements...');
    this.printCombinedEvents('All Clicked Elements by Page:');
    this.printHoveredElements('All Hovered Elements by Page:');
  }

  /**
   * Print hovered elements
   */
  private printHoveredElements(header: string): void {
    console.log(header);
    
    for (const [pageUrl, elements] of Object.entries(this.pageHoversMap)) {
      if (elements.length > 0) {
        console.log(`Page URL: ${pageUrl}`);
        elements.forEach((elementHtml, idx) => {
          console.log(`${idx + 1}. ${simplifyHtml(elementHtml)}`);
        });
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
   * Print combined events with consolidated output
   */
  private printCombinedEvents(header: string): void {
    console.log(header);
    
    for (const [pageUrl, events] of Object.entries(this.pageEventsMap)) {
      if (events.length === 0) continue;
      
      console.log(`Page URL: ${pageUrl}`);
      
      // Build a map of element identifier to last event
      const lastEventMap = new Map<string, RecordedEvent>();
      const eventOrder: string[] = [];
      
      for (const event of events) {
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