import { Builder, WebDriver, By, until } from "selenium-webdriver";
import * as chrome from "selenium-webdriver/chrome";
import * as fs from "fs";
import * as path from "path";
import type {
  Config,
  Step,
  Recording,
  RawClickEvent,
  RawChangeEvent,
} from "./types";

export class TestRecorder {
  private driver!: WebDriver;
  private steps: Step[] = [];
  private currentUrl: string = "";
  private monitoringInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  /**
   * Initialize the Chrome WebDriver with maximized window
   */
  private async initDriver(): Promise<WebDriver> {
    const options = new chrome.Options();
    options.addArguments("--start-maximized");

    const driver = await new Builder()
      .forBrowser("chrome")
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

      // Add setViewport step using actual window size
      const rect = await this.driver.manage().window().getRect();
      this.steps.push({
        type: "setViewport",
        width: rect.width,
        height: rect.height,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: false,
      });

      const baseUrl = this.getBaseUrlFromConfig();
      await this.driver.get(baseUrl);
      this.currentUrl = await this.driver.getCurrentUrl();
      this.steps.push({
        type: "navigate",
        url: this.currentUrl,
        assertedEvents: [{ type: "navigation", url: this.currentUrl }],
      });
      console.log(`[navigate] ${this.currentUrl}`);

      await this.injectEventListeners();
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
      const configPath = path.join(process.cwd(), "config.json");
      const configData = fs.readFileSync(configPath, "utf-8");
      const config: Config = JSON.parse(configData);

      if (!config.base_url) {
        throw new Error("The 'base_url' in config.json is empty.");
      }

      return config.base_url;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          "config.json not found. Please create it with a 'base_url' key."
        );
      }
      if (error instanceof SyntaxError) {
        throw new Error("Invalid JSON in config.json");
      }
      throw error;
    }
  }

  /**
   * Monitor user interactions in a loop
   */
  private async monitorUserInteractions(): Promise<void> {
    this.isRunning = true;

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.handleUrlChange();
        await this.drainEvents();
      } catch (error) {
        const errorMessage = (error as Error).message || "";
        if (
          errorMessage.includes("session deleted") ||
          errorMessage.includes("invalid session")
        ) {
          console.error("\nBrowser was closed. Generating output...\n");
        } else {
          console.error("Error during monitoring:", error);
        }
        this.stopMonitoring();
        this.outputRecording();
        process.exit(0);
      }
    }, 1000);

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
   * Handle URL changes: add navigate step and reinject listeners
   */
  private async handleUrlChange(): Promise<void> {
    const newUrl = await this.driver.getCurrentUrl();

    if (this.currentUrl !== newUrl) {
      this.currentUrl = newUrl;
      await this.driver.wait(until.elementLocated(By.tagName("body")), 10000);
      await this.injectEventListeners();
      this.steps.push({
        type: "navigate",
        url: newUrl,
        assertedEvents: [{ type: "navigation", url: newUrl }],
      });
      console.log(`[navigate] ${newUrl}`);
    }
  }

  /**
   * Drain click and change events from localStorage into steps
   */
  private async drainEvents(): Promise<void> {
    try {
      const clicks = await this.driver.executeScript<RawClickEvent[]>(
        `var v = localStorage.recorderClicks; localStorage.recorderClicks = '[]'; return JSON.parse(v || '[]');`
      );
      for (const click of clicks || []) {
        const label = click.selectors[0]?.[0] ?? "(unknown)";
        this.steps.push({
          type: "click",
          target: "main",
          selectors: click.selectors,
          offsetX: click.offsetX,
          offsetY: click.offsetY,
        });
        console.log(`[click] ${label}`);
      }

      const changes = await this.driver.executeScript<RawChangeEvent[]>(
        `var v = localStorage.recorderChanges; localStorage.recorderChanges = '[]'; return JSON.parse(v || '[]');`
      );
      for (const change of changes || []) {
        const label = change.selectors[0]?.[0] ?? "(unknown)";
        this.steps.push({
          type: "change",
          target: "main",
          selectors: change.selectors,
          value: change.value,
        });
        console.log(`[change] ${label} = "${change.value}"`);
      }
    } catch {
      // Silently ignore errors (page navigation, etc.)
    }
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
        if (!localStorage.recorderClicks) localStorage.recorderClicks = '[]';
        if (!localStorage.recorderChanges) localStorage.recorderChanges = '[]';

        function getSelectors(el) {
          var sels = [];

          if (el.id) {
            sels.push(['#' + el.id]);
          }

          var testAttrs = ['data-testid', 'data-test', 'data-qa', 'data-cy'];
          for (var i = 0; i < testAttrs.length; i++) {
            var v = el.getAttribute(testAttrs[i]);
            if (v) { sels.push(['[' + testAttrs[i] + '="' + v + '"]']); break; }
          }

          var ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) {
            sels.push(['aria/' + ariaLabel]);
          }

          sels.push([getCSSPath(el)]);
          sels.push([getXPath(el)]);

          return sels;
        }

        function getCSSPath(el) {
          var parts = [];
          var current = el;
          while (current && current.nodeType === 1 && current.tagName !== 'HTML') {
            var selector = current.tagName.toLowerCase();
            if (current.id) {
              selector = '#' + current.id;
              parts.unshift(selector);
              break;
            }
            var classes = Array.prototype.slice.call(current.classList).join('.');
            if (classes) selector += '.' + classes;
            var parent = current.parentElement;
            if (parent) {
              var siblings = Array.prototype.slice.call(parent.children).filter(function(c) { return c.tagName === current.tagName; });
              if (siblings.length > 1) {
                selector += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
              }
            }
            parts.unshift(selector);
            current = parent;
          }
          return parts.join(' > ');
        }

        function getXPath(el) {
          var parts = [];
          var current = el;
          while (current && current.nodeType === 1) {
            var idx = 1;
            var sib = current.previousSibling;
            while (sib) {
              if (sib.nodeType === 1 && sib.tagName === current.tagName) idx++;
              sib = sib.previousSibling;
            }
            parts.unshift(current.tagName.toLowerCase() + '[' + idx + ']');
            current = current.parentElement;
          }
          return '//' + parts.join('/');
        }

        document.addEventListener('click', function(e) {
          var el = e.target;
          var arr = JSON.parse(localStorage.recorderClicks);
          arr.push({ selectors: getSelectors(el), offsetX: Math.round(e.offsetX), offsetY: Math.round(e.offsetY) });
          localStorage.recorderClicks = JSON.stringify(arr);
        }, true);

        document.addEventListener('change', function(e) {
          var el = e.target;
          if (el.tagName && (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'select')) {
            var arr = JSON.parse(localStorage.recorderChanges);
            arr.push({ selectors: getSelectors(el), value: el.value });
            localStorage.recorderChanges = JSON.stringify(arr);
          }
        }, true);
      }
    `;
  }

  /**
   * Output the recording as Chrome DevTools Recorder JSON
   */
  private outputRecording(): void {
    const recording: Recording = { title: "Recording", steps: this.steps };
    console.log(JSON.stringify(recording, null, 2));
  }

  /**
   * Register shutdown hooks for cleanup
   */
  private registerShutdownHooks(): void {
    const cleanup = async () => {
      this.stopMonitoring();
      this.outputRecording();
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", () => {
      this.stopMonitoring();
    });
  }

  /**
   * Clean up resources
   */
  private async cleanUp(): Promise<void> {
    try {
      if (this.driver) {
        await this.driver.quit();
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
