# `apps/api` — FastAPI backend (placeholder)

Empty in this PR. The FastAPI skeleton lands in **Phase 0 PR #2** with:

- `uv` for environment + dependency management
- `pyproject.toml` + `uv.lock`
- `app/` source tree following the feature-self-contained layout in [`v2/UHAS_Backend_Architecture_v1.1.md`](../../v2/UHAS_Backend_Architecture_v1.1.md) §4
- Health-check endpoint
- `ruff` lint + format
- `mypy` type checking
- `pytest` + `pytest-asyncio` + `httpx`
- Pre-commit hooks shared with `apps/web`
- Railway service definition added to `railway.toml`

See [v2/UHAS_Migration_Execution_Plan.md](../../v2/UHAS_Migration_Execution_Plan.md) for the full phase plan.
