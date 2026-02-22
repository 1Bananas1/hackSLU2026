"""
Symmetric encryption helpers using Fernet (AES-128-CBC + HMAC-SHA256).

Reads the encryption key from the ENCRYPTION_KEY environment variable.
The key must be a valid URL-safe base64-encoded 32-byte Fernet key.

Generate a new key (run once, save to .env):
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Usage:
    from src.database.services.encryption import encrypt, decrypt

    ciphertext = encrypt("user@example.com")
    plaintext  = decrypt(ciphertext)
"""

import os
from functools import lru_cache

from cryptography.fernet import Fernet


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    """Return a cached Fernet instance built from ENCRYPTION_KEY.

    The instance is constructed once and reused — avoids repeated env lookups
    and key parsing on every encrypt/decrypt call.
    Raises RuntimeError if the env var is missing.
    """
    key = os.getenv("ENCRYPTION_KEY")
    if not key:
        raise RuntimeError(
            "ENCRYPTION_KEY environment variable is not set. "
            "Generate one with: "
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode())


def validate_encryption_key() -> None:
    """Call at application startup to fail fast if ENCRYPTION_KEY is missing.

    Raises RuntimeError if the env var is absent so the problem surfaces
    immediately at boot rather than on the first city-report request.
    """
    _fernet()  # raises if key is missing or invalid


def encrypt(plaintext: str) -> str:
    """Encrypt a UTF-8 string. Returns a URL-safe base64 ciphertext string."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Decrypt a ciphertext produced by encrypt(). Returns the original string."""
    return _fernet().decrypt(ciphertext.encode()).decode()
