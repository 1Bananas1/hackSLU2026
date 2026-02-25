"""
Entry point for the HackSLU2026 backend API.

Run from the repo root:
    python -m src.main

Or with Flask dev server:
    flask --app src.main:app run --debug
"""

from src.api import create_app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
