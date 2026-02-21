"""
Firestore client singleton.

Import `db` anywhere in the codebase to get the Firestore client:

    from src.database.client import db
"""

from __future__ import annotations

from typing import Any, Optional

from .config import initialize_firebase


class _LazyFirestoreClient:
    """Proxy that initializes Firebase/Firestore only when first used."""
    def __init__(self) -> None:
        self._client: Optional[Any] = None

    def _get(self) -> Any:
        if self._client is None:
            initialize_firebase()
            try:
                from firebase_admin import firestore  # type: ignore
            except ModuleNotFoundError as exc:  # pragma: no cover
                raise RuntimeError(
                    "firebase_admin is not installed. Install firebase-admin to use Firestore."
                ) from exc
            self._client = firestore.client()
        return self._client

    def __getattr__(self, name: str) -> Any:
        return getattr(self._get(), name)

    def __repr__(self) -> str:  # pragma: no cover
        return "<LazyFirestoreClient (uninitialized)>" if self._client is None else repr(self._client)


def get_db() -> Any:
    """Explicit getter if you prefer calling instead of importing db."""
    return db._get()  # type: ignore[attr-defined]


db = _LazyFirestoreClient()