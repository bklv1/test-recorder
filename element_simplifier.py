from bs4 import BeautifulSoup

ALLOWED_ATTRS = {"id", "class", "name", "type", "href", "placeholder", "role"}
MAX_ATTR_LENGTH = 40

def simplify_html(html):
    soup = BeautifulSoup(html, "html.parser")
    # If the input is just text, return as is
    if not soup.find(True):
        return soup.get_text(strip=True)
    # If the input is a single tag
    if len(soup.contents) == 1 and getattr(soup.contents[0], "name", None):
        tag = soup.contents[0]
        attrs = []
        for attr, value in tag.attrs.items():
            if attr in ALLOWED_ATTRS and len(str(value)) <= MAX_ATTR_LENGTH:
                attrs.append(f'{attr}="{value}"')
        attr_str = " " + " ".join(attrs) if attrs else ""
        inner_text = tag.get_text(strip=True)
        return f"<{tag.name}{attr_str}>{inner_text}</{tag.name}>"
    # If the input is a fragment, process each tag at the top level
    simplified = []
    for node in soup.contents:
        if getattr(node, "name", None):
            attrs = []
            for attr, value in node.attrs.items():
                if attr in ALLOWED_ATTRS and len(str(value)) <= MAX_ATTR_LENGTH:
                    attrs.append(f'{attr}="{value}"')
            attr_str = " " + " ".join(attrs) if attrs else ""
            inner_text = node.get_text(strip=True)
            simplified.append(f"<{node.name}{attr_str}>{inner_text}</{node.name}>")
        else:
            # It's a NavigableString (text node)
            text = str(node).strip()
            if text:
                simplified.append(text)
    return " ".join(simplified)
