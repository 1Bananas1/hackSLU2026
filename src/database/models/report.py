"""
Report document model.

Represents a formal pothole/hazard report submitted to city authorities.
Maps 1-to-1 with a document in the Firestore 'reports' collection.

PII fields (reporter_name, reporter_email, reporter_phone) are stored
as Fernet-encrypted ciphertext — never plaintext in Firestore.
Decryption requires the ENCRYPTION_KEY environment variable.

Fields:
    hazard_id          — Firestore document ID of the parent Hazard
    submitted_by_uid   — Firebase Auth UID of the submitting user
    submitted_at       — UTC datetime the report was created
    status             — "submitted" | "acknowledged" | "resolved"
    reporter_name_enc  — encrypted reporter full name
    reporter_email_enc — encrypted reporter email address
    reporter_phone_enc — encrypted reporter phone number (optional)
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class Report:
    hazard_id: str
    submitted_by_uid: str
    reporter_name_enc: str  # Fernet ciphertext
    reporter_email_enc: str  # Fernet ciphertext
    submitted_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "submitted"  # "submitted" | "acknowledged" | "resolved"
    reporter_phone_enc: Optional[str] = None  # Fernet ciphertext, optional
    id: Optional[str] = None  # populated after Firestore write

    def to_dict(self) -> dict:
        """Serialize to a plain dict suitable for Firestore."""
        return {
            "hazard_id": self.hazard_id,
            "submitted_by_uid": self.submitted_by_uid,
            "submitted_at": self.submitted_at,
            "status": self.status,
            "reporter_name_enc": self.reporter_name_enc,
            "reporter_email_enc": self.reporter_email_enc,
            "reporter_phone_enc": self.reporter_phone_enc,
        }

    @classmethod
    def from_dict(cls, data: dict, doc_id: Optional[str] = None) -> "Report":
        """Deserialize from a Firestore document dict."""
        return cls(
            hazard_id=data["hazard_id"],
            submitted_by_uid=data["submitted_by_uid"],
            reporter_name_enc=data["reporter_name_enc"],
            reporter_email_enc=data["reporter_email_enc"],
            submitted_at=data.get("submitted_at", datetime.now(timezone.utc)),
            status=data.get("status", "submitted"),
            reporter_phone_enc=data.get("reporter_phone_enc"),
            id=doc_id,
        )
