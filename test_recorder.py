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
        self.driver = self._init_driver()
        self.wait = WebDriverWait(self.driver, 10)
        self.page_clicks_map = {}
        self.page_hovers_map = {}
        self.page_inputs_map = {}
        self.page_events_map = {}
        self.current_url = ""

    def _init_driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--start-maximized")
        return webdriver.Chrome(service=Service(), options=chrome_options)

    def run(self):
        try:
            self._register_shutdown_hook()
            self._open_initial_page("https://opensource-demo.orangehrmlive.com/")
            self._monitor_user_interactions()
        finally:
            self._clean_up()

    def _open_initial_page(self, url):
        self.driver.get(url)
        self.current_url = self.driver.current_url
        self._initialize_page_maps(self.current_url)
        self._inject_event_listeners()

    def _monitor_user_interactions(self):
        while True:
            try:
                self._handle_url_change()
                self._record_all_interactions()
                time.sleep(1)
            except WebDriverException:
                break

    def _handle_url_change(self):
        if self.current_url != self.driver.current_url:
            self.current_url = self.driver.current_url
            self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
            self._inject_event_listeners()
            self._initialize_page_maps(self.current_url)

    def _initialize_page_maps(self, url):
        self.page_clicks_map.setdefault(url, [])
        self.page_hovers_map.setdefault(url, [])
        self.page_inputs_map.setdefault(url, [])
        self.page_events_map.setdefault(url, [])

    def _record_all_interactions(self):
        self._record_click_events()
        self._record_hover_events()
        self._record_input_events()

    def _record_click_events(self):
        clicked_elements = self._get_js_array("localStorage.clickedElements")
        for clicked in clicked_elements:
            page_url = clicked.get("url", self.current_url)
            html = clicked.get("html", "")
            self._append_unique(self.page_clicks_map, page_url, html)
            self._append_event(page_url, "click", html)
        self._clear_js_array("localStorage.clickedElements")

    def _record_hover_events(self):
        hovered_html = self.driver.execute_script("return window.hoveredElementHtml;")
        if hovered_html and hovered_html not in self.page_hovers_map[self.current_url]:
            self.page_hovers_map[self.current_url].append(hovered_html)
            print(f"Hovered Element: {hovered_html}")

    def _record_input_events(self):
        input_events = self._get_js_array("localStorage.inputEvents")
        for event in input_events:
            value = event.get("value", "")
            html = event.get("html", "")
            if not self._is_input_already_recorded(self.current_url, value, html):
                self.page_inputs_map[self.current_url].append(event)
                print(f"Input Event: keys sent: {value}; html element:{html}")
            self._append_event(self.current_url, "input", html, value)
        self._clear_js_array("localStorage.inputEvents")

    def _get_js_array(self, storage_key):
        result = self.driver.execute_script(f"return JSON.parse({storage_key} || '[]')")
        return result if result is not None else []

    def _clear_js_array(self, storage_key):
        self.driver.execute_script(f"{storage_key} = JSON.stringify([])")

    def _append_unique(self, mapping, key, value):
        if key not in mapping:
            mapping[key] = []
        if value not in mapping[key]:
            mapping[key].append(value)
            print(f"Clicked Element: {value} (URL: {key})")

    def _is_input_already_recorded(self, url, value, html):
        return any(
            e.get("value", "") == value and e.get("html", "") == html
            for e in self.page_inputs_map[url]
        )

    def _append_event(self, url, event_type, html, value=None):
        if url not in self.page_events_map:
            self.page_events_map[url] = []
        event = {"type": event_type, "html": html, "value": value}
        self.page_events_map[url].append(event)

    def _inject_event_listeners(self):
        self.driver.execute_script(self._get_event_listener_script())

    def _get_event_listener_script(self):
        return """
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
        """

    def _register_shutdown_hook(self):
        import atexit
        atexit.register(self._print_recorded_elements)

    def _print_recorded_elements(self):
        print("Shutdown hook triggered. Printing recorded elements...")
        self._print_combined_events("All Clicked Elements by Page:")
        self._print_hovered_elements("All Hovered Elements by Page:")

    def _print_hovered_elements(self, header):
        print(header)
        for page_url, elements in self.page_hovers_map.items():
            if elements:
                print(f"Page URL: {page_url}")
                for idx, element_html in enumerate(elements, 1):
                    print(f"{idx}. {simplify_html(element_html)}")

    def _print_combined_events(self, header):
        print(header)
        for page_url, events in self.page_events_map.items():
            if not events:
                continue
            print(f"Page URL: {page_url}")
            number = 1
            n = len(events)
            idx = 0
            while idx < n:
                event = events[idx]
                html = simplify_html(event["html"])
                # Look ahead to see if the next event is for the same html
                next_idx = idx + 1
                while next_idx < n and simplify_html(events[next_idx]["html"]) == html:
                    idx = next_idx
                    event = events[idx]
                    next_idx += 1
                # Print only the last event in the consecutive run
                if event["type"] == "input":
                    value = event["value"]
                    print(f"{number}. keys sent: {value}; html element:{html}")
                elif event["type"] == "click":
                    print(f"{number}. {html}")
                number += 1
                idx += 1

    def _get_last_input_indices(self, events):
        last_input_idx = {}
        for idx, event in enumerate(events):
            if event["type"] == "input":
                html = simplify_html(event["html"])
                last_input_idx[html] = idx
        return last_input_idx

    def _clean_up(self):
        try:
            self.driver.quit()
        except WebDriverException:
            pass

if __name__ == "__main__":
    recorder = TestRecorder()
    recorder.run()
