from bs4 import BeautifulSoup

ALLOWED_ATTRS = {"id", "class", "name", "type", "href", "placeholder", "role"}
MAX_ATTR_LENGTH = 40

def simplify_html(html):
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(True):
        attrs = dict(tag.attrs)
        for attr in list(attrs):
            if attr not in ALLOWED_ATTRS or len(str(attrs[attr])) > MAX_ATTR_LENGTH:
                del tag.attrs[attr]
    return str(soup)