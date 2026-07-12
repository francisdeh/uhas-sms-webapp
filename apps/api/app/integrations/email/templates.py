"""Shared HTML email rendering.

One Jinja2 `Environment` for every outbound email template — mirrors
the `FileSystemLoader` idiom already used for the report-card PDF
template (`app.features.exams.report_card_pdf`), minus the WeasyPrint
step: this renders straight to an HTML string for `EmailMessage.html`,
it never becomes a PDF.
"""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_env = Environment(
    loader=FileSystemLoader(_TEMPLATES_DIR),
    autoescape=select_autoescape(["html"]),
)


def render_email_template(name: str, **context: object) -> str:
    """`name` is a template filename under `templates/`, e.g.
    `"appointment_requested.html"`."""
    return _env.get_template(name).render(**context)
