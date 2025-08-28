from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
import time
from element_simplifier import simplify_html

class TestRecorder:
    def __init__(self):
        chrome_options = Options()
        chrome_options.add_argument("--start-maximized")  

        self.driver = webdriver.Chrome(service=Service(), options=chrome_options)
        self.wait = WebDriverWait(self.driver, 10)
        self.page_clicks_map = {}
        self.page_hovers_map = {}
        self.page_inputs_map = {}
        self.current_url = ""

    def run(self):
        try:
            self.setup_shutdown_hook()
            self.open_initial_page("https://opensource-demo.orangehrmlive.com/")
            self.monitor_user_interactions()
        finally:
            self.clean_up()

    def open_initial_page(self, url):
        self.driver.get(url)
        self.current_url = self.driver.current_url
        self.page_clicks_map[self.current_url] = []
        self.page_hovers_map[self.current_url] = []
        self.page_inputs_map[self.current_url] = []
        self.inject_listeners()

    def monitor_user_interactions(self):
        browser_open = True

        while browser_open:
            try:
                self.handle_url_change()
                self.record_interactions()
                time.sleep(1)
            except WebDriverException:
                browser_open = False

    def handle_url_change(self):
        if self.current_url != self.driver.current_url:
            self.current_url = self.driver.current_url
            self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
            self.inject_listeners()
            self.page_clicks_map.setdefault(self.current_url, [])
            self.page_hovers_map.setdefault(self.current_url, [])
            self.page_inputs_map.setdefault(self.current_url, [])

    def record_interactions(self):
        self.record_clicked_element()
        self.record_hovered_element()
        self.record_input_event()

    def record_clicked_element(self):
        clicked_elements = self.driver.execute_script("return JSON.parse(localStorage.clickedElements || '[]')")
        if clicked_elements is None:
            clicked_elements = []
        for clicked in clicked_elements:
            # clicked is now an object: {html, url}
            page_url = clicked.get("url", self.current_url)
            html = clicked.get("html", "")
            if page_url not in self.page_clicks_map:
                self.page_clicks_map[page_url] = []
            if html not in self.page_clicks_map[page_url]:
                self.page_clicks_map[page_url].append(html)
                print(f"Clicked Element: {html} (URL: {page_url})")
        # Clear after reading
        self.driver.execute_script("localStorage.clickedElements = JSON.stringify([])")

    def record_hovered_element(self):
        hovered_element_html = self.driver.execute_script("return window.hoveredElementHtml;")
        if hovered_element_html and hovered_element_html not in self.page_hovers_map[self.current_url]:
            self.page_hovers_map[self.current_url].append(hovered_element_html)
            print(f"Hovered Element: {hovered_element_html}")

    def inject_listeners(self):
        script = """
        if (!window.__testRecorderInjected) {
            window.__testRecorderInjected = true;
            var hoverTimeout;
            // Initialize localStorage if not present
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
        """
        self.driver.execute_script(script)

    def setup_shutdown_hook(self):
        import atexit
        atexit.register(self.print_recorded_elements)

    def record_input_event(self):
        input_events = self.driver.execute_script("return JSON.parse(localStorage.inputEvents || '[]')")
        for event in input_events:
            # Use tuple (value, html) for uniqueness
            key = (event.get("value", ""), event.get("html", ""))
            already_recorded = any(
                e.get("value", "") == event.get("value", "") and e.get("html", "") == event.get("html", "")
                for e in self.page_inputs_map[self.current_url]
            )
            if not already_recorded:
                self.page_inputs_map[self.current_url].append(event)
                print(f"Input Event: keys sent: {event.get('value', '')}; html element:{event.get('html', '')}")
        # Clear after reading
        self.driver.execute_script("localStorage.inputEvents = JSON.stringify([])")

    def print_recorded_elements(self):
        print("Shutdown hook triggered. Printing recorded elements...")
        self.print_combined_elements("All Clicked Elements by Page:", self.page_clicks_map, self.page_inputs_map)
        self.print_elements("All Hovered Elements by Page:", self.page_hovers_map)

    def print_elements(self, header, elements_map):
        print(header)
        for page_url, elements in elements_map.items():
            if elements:
                print(f"Page URL: {page_url}")
                for element_html in elements:
                    print(f" - {simplify_html(element_html)}")

    def print_combined_elements(self, header, clicks_map, inputs_map):
        print(header)
        for page_url in set(list(clicks_map.keys()) + list(inputs_map.keys())):
            clicked_elements = clicks_map.get(page_url, [])
            input_events = inputs_map.get(page_url, [])
            if not clicked_elements and not input_events:
                continue
            print(f"Page URL: {page_url}")

            # Build a timeline of events: (type, simplified_html, value, original_html)
            timeline = []
            # Add all input events with their index in the original list
            for idx, event in enumerate(input_events):
                html = simplify_html(event.get("html", ""))
                value = event.get("value", "")
                timeline.append({
                    "type": "input",
                    "html": html,
                    "value": value,
                    "original_html": event.get("html", ""),
                    "idx": idx
                })
            # Add all click events with their index in the original list
            for idx, element_html in enumerate(clicked_elements):
                html = simplify_html(element_html)
                timeline.append({
                    "type": "click",
                    "html": html,
                    "value": None,
                    "original_html": element_html,
                    "idx": idx
                })
            # Sort timeline by the order of occurrence in the browser (inputs and clicks are interleaved)
            # Since we can't get the true interleaved order from two separate lists, we will assume that
            # input_events and clicked_elements are appended in the order they happened (if not, this needs browser-side fix)
            # So we merge them by their order of appearance in the lists, using a stable sort by idx and type
            # To preserve the order, we can reconstruct a merged list by walking through both lists in order
            merged = []
            i, j = 0, 0
            total_inputs = len(input_events)
            total_clicks = len(clicked_elements)
            # We need to reconstruct the order: assume that the print order in the browser is input, click, input, click, etc.
            # But since we don't have timestamps, we will just append all input events, then all click events, as before.
            # To improve, we can add a timestamp in the browser-side event capture in the future.
            # For now, let's merge by the order in which they appear in the lists, assuming that's the order of occurrence.
            # But to fix the user's issue, we need to only print the last value for each input at its last occurrence.
            # So, for each input, only print the last occurrence in the timeline.

            # Build a combined list of (event_type, html, value, original_html, idx, source)
            combined = []
            input_idx, click_idx = 0, 0
            while input_idx < total_inputs or click_idx < total_clicks:
                # If both have events left, pick the one with the lower idx
                if input_idx < total_inputs and (click_idx >= total_clicks or input_idx <= click_idx):
                    event = input_events[input_idx]
                    html = simplify_html(event.get("html", ""))
                    value = event.get("value", "")
                    combined.append({
                        "type": "input",
                        "html": html,
                        "value": value,
                        "original_html": event.get("html", ""),
                        "idx": input_idx
                    })
                    input_idx += 1
                elif click_idx < total_clicks:
                    element_html = clicked_elements[click_idx]
                    html = simplify_html(element_html)
                    combined.append({
                        "type": "click",
                        "html": html,
                        "value": None,
                        "original_html": element_html,
                        "idx": click_idx
                    })
                    click_idx += 1

            # Find the last value for each input html
            last_input_value = {}
            for event in combined:
                if event["type"] == "input":
                    last_input_value[event["html"]] = event["value"]
            # Find the last occurrence index for each input html
            last_input_idx = {}
            for idx, event in enumerate(combined):
                if event["type"] == "input":
                    last_input_idx[event["html"]] = idx

            # Print timeline, but for input events, only print at the last occurrence
            for idx, event in enumerate(combined):
                if event["type"] == "input":
                    html = event["html"]
                    if last_input_idx[html] == idx:
                        value = last_input_value[html]
                        print(f" - keys sent: {value}; html element:{html}")
                elif event["type"] == "click":
                    # Only print if this click is not an input element (avoid duplicate input fields)
                    if event["html"] not in last_input_value:
                        print(f" - {event['html']}")

    def clean_up(self):
        try:
            self.driver.quit()
        except WebDriverException:
            pass

if __name__ == "__main__":
    recorder = TestRecorder()
    recorder.run()
