from bs4 import BeautifulSoup
from typing import Optional

ALLOWED_ATTRS = {"id", "class", "name", "type", "href", "placeholder", "role"}
MAX_ATTR_LENGTH = 40

def filter_attributes(attrs: dict) -> str:
    """
    Filter and format allowed attributes for an HTML tag.
    Includes attributes in ALLOWED_ATTRS and any attribute starting with 'data'.
    """
    filtered = [
        f'{attr}="{value}"'
        for attr, value in attrs.items()
        if (
            attr in ALLOWED_ATTRS
            or attr.startswith("data")
            or attr.startswith("test")
        ) and len(str(value)) <= MAX_ATTR_LENGTH
    ]
    return " " + " ".join(filtered) if filtered else ""

def simplify_tag(tag) -> str:
    """
    Simplify a BeautifulSoup tag: keep allowed attributes and inner text.
    """
    attr_str = filter_attributes(tag.attrs)
    inner_text = tag.get_text(strip=True)
    return f"<{tag.name}{attr_str}>{inner_text}</{tag.name}>"

def simplify_html(html: str) -> str:
    """
    Simplify HTML by keeping only allowed attributes and always preserving inner text.
    Handles single tags, fragments, and plain text.
    """
    soup = BeautifulSoup(html, "html.parser")
    # If the input is just text, return as is
    if not soup.find(True):
        return soup.get_text(strip=True)
    # If the input is a single tag
    if len(soup.contents) == 1 and getattr(soup.contents[0], "name", None):
        return simplify_tag(soup.contents[0])
    # If the input is a fragment, process each tag at the top level
    simplified = []
    for node in soup.contents:
        if getattr(node, "name", None):
            simplified.append(simplify_tag(node))
        else:
            text = str(node).strip()
            if text:
                simplified.append(text)
    return " ".join(simplified)