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
        self.page_events_map = {}  # New: unified event list per page
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
        self.page_events_map[self.current_url] = []  # New: initialize unified event list
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
            self.page_events_map.setdefault(self.current_url, [])  # New: ensure unified event list

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
            # --- Unified event list ---
            if page_url not in self.page_events_map:
                self.page_events_map[page_url] = []
            self.page_events_map[page_url].append({
                "type": "click",
                "html": html,
                "value": None
            })
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
            # --- Unified event list ---
            if self.current_url not in self.page_events_map:
                self.page_events_map[self.current_url] = []
            self.page_events_map[self.current_url].append({
                "type": "input",
                "html": event.get("html", ""),
                "value": event.get("value", "")
            })
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
                for idx, element_html in enumerate(elements, 1):
                    print(f"{idx}. {simplify_html(element_html)}")

    def print_combined_elements(self, header, clicks_map, inputs_map):
        print(header)
        # Use the unified event list for true chronological order
        for page_url, events in self.page_events_map.items():
            if not events:
                continue
            print(f"Page URL: {page_url}")
            # Find the last index for each input html
            last_input_idx = {}
            for idx, event in enumerate(events):
                if event["type"] == "input":
                    html = simplify_html(event["html"])
                    last_input_idx[html] = idx
            number = 1
            for idx, event in enumerate(events):
                if event["type"] == "input":
                    html = simplify_html(event["html"])
                    value = event["value"]
                    # Only print the last occurrence for each input html
                    if last_input_idx[html] == idx:
                        print(f"{number}. keys sent: {value}; html element:{html}")
                        number += 1
                elif event["type"] == "click":
                    html = simplify_html(event["html"])
                    print(f"{number}. {html}")
                    number += 1

    def clean_up(self):
        try:
            self.driver.quit()
        except WebDriverException:
            pass

if __name__ == "__main__":
    recorder = TestRecorder()
    recorder.run()
