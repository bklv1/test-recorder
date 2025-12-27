# Test Recorder

A TypeScript-based Selenium test recorder that captures user interactions and organizes them into Given-When-Then stages for BDD-style testing. The idea is to provide those recordings to the LLMs so they get the context of the UI and generate automated test scripts inside current frameworks.

## Quick Start

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Create config.json:**

   ```json
   {
     "base_url": "https://your-website.com"
   }
   ```

3. **Start recording:**
   ```bash
   npm start
   ```

## How to Use

### UI Popup Control (Primary Method)

When the browser opens, you'll see a draggable popup in the top-right corner:

- **Click GIVEN/WHEN/THEN buttons** to switch recording stages
- **Drag the header** to reposition the popup anywhere on screen
- **Position persists** across page navigations

### Terminal Shortcuts (Backup Method)

Press keys while the terminal is focused:

- **G** = Switch to GIVEN stage
- **W** = Switch to WHEN stage
- **T** = Switch to THEN stage
- **Ctrl+C** = Stop recording and generate report

> Both control methods work simultaneously and stay synchronized.

## Recording Stages

- **GIVEN**: Setup actions (navigation, initial state)
- **WHEN**: Main test actions (clicks, inputs, interactions)
- **THEN**: Verification actions (assertions, checks)

Switch between stages anytime using the UI popup or keyboard shortcuts.

## Output

When you stop recording (Ctrl+C or close browser), you'll get a report grouped by stages:

```
=== GIVEN ===
##Page: https://example.com/login
1. <input id="username">
2. keys sent: testuser; html element:<input id="username">

=== WHEN ===
##Page: https://example.com/dashboard
1. <button id="submit-btn">
2. <a href="/profile">

=== THEN ===
##Page: https://example.com/profile
1. <div class="success-message">
```

## Requirements

- Node.js (v16+)
- Chrome browser (installed and accessible)
- ChromeDriver (automatically managed by Selenium)

## Tips

- **Reposition popup** if it blocks important UI elements
- **Use terminal shortcuts** when popup isn't accessible
- **Switch stages frequently** to organize your test scenarios
- **Close browser or press Ctrl+C** to generate the final report

## License

MIT
