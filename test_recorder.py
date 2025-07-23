from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
import time

class TestRecorder:
    def __init__(self):
        chrome_options = Options()
        chrome_options.add_argument("--start-maximized")  

        self.driver = webdriver.Chrome(service=Service(), options=chrome_options)
        self.wait = WebDriverWait(self.driver, 10)
        self.page_clicks_map = {}
        self.page_hovers_map = {}
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

    def record_interactions(self):
        self.record_clicked_element()
        self.record_hovered_element()

    def record_clicked_element(self):
        clicked_elements = self.driver.execute_script("return JSON.parse(localStorage.clickedElements || '[]')")
        for clicked_element_html in clicked_elements:
            if clicked_element_html not in self.page_clicks_map[self.current_url]:
                self.page_clicks_map[self.current_url].append(clicked_element_html)
                print(f"Clicked Element: {clicked_element_html}")
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
            document.addEventListener('click', function(event) {
                var element = event.target;
                var arr = JSON.parse(localStorage.clickedElements);
                arr.push(element.outerHTML);
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
        }
        """
        self.driver.execute_script(script)

    def setup_shutdown_hook(self):
        import atexit
        atexit.register(self.print_recorded_elements)

    def print_recorded_elements(self):
        print("Shutdown hook triggered. Printing recorded elements...")
        self.print_elements("All Clicked Elements by Page:", self.page_clicks_map)
        self.print_elements("All Hovered Elements by Page:", self.page_hovers_map)

    def print_elements(self, header, elements_map):
        print(header)
        for page_url, elements in elements_map.items():
            if elements:
                print(f"Page URL: {page_url}")
                for element_html in elements:
                    print(f" - {element_html}")

    def clean_up(self):
        try:
            self.driver.quit()
        except WebDriverException:
            pass

if __name__ == "__main__":
    recorder = TestRecorder()
    recorder.run()