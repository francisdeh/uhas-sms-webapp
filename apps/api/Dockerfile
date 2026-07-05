# Railway builds this service with Docker if a Dockerfile exists in its
# root, regardless of the `railpack` builder set elsewhere in
# railway.toml — no config changes needed there. Introduced solely
# because WeasyPrint (report-card PDF rendering) needs system libraries
# a bare Nixpacks/Railpack Python build doesn't provide.
FROM python:3.14-slim

# WeasyPrint's text/font shaping depends on Pango/cairo/GDK-PixBuf at
# the OS level — these can't come from PyPI. Package list per
# WeasyPrint's own install docs for Debian/Ubuntu.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
COPY . .

# Matches railway.toml's existing buildCommand exactly — frozen install
# against the committed uv.lock.
RUN uv sync --frozen

EXPOSE 8000

# Matches railway.toml's existing startCommand — migrations apply on
# every boot (no-op when the schema is already current).
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT"]
