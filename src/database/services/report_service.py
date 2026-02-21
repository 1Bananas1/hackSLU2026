"""
CRUD operations for the 'reports' Firestore collection.

A Report is created when a user formally submits a hazard to city authorities.
PII (name, email, phone) is encrypted before writing via encryption.py.

Typical usage from the Flask backend:

    from src.database.services.report_service import create_report, get_report
    from src.database.services.encryption import encrypt

    report_id = create_report(
        hazard_id=hazard.id,
        submitted_by_uid=g.user["uid"],
        reporter_name=data["reporter_name"],
        reporter_email=data["reporter_email"],
        reporter_phone=data.get("reporter_phone"),
    )
"""

from typing import List, Optional

from ..client import db
from ..models.report import Report
from .encryption import encrypt

COLLECTION = "reports"


def create_report(
    hazard_id: str,
    submitted_by_uid: str,
    reporter_name: str,
    reporter_email: str,
    reporter_phone: Optional[str] = None,
) -> str:
    """
    Encrypt PII fields and write a new Report to Firestore.
    Returns the new document ID.

    Args:
        hazard_id:         Firestore ID of the hazard being reported.
        submitted_by_uid:  Firebase Auth UID of the submitting user.
        reporter_name:     Plaintext full name — encrypted before storage.
        reporter_email:    Plaintext email address — encrypted before storage.
        reporter_phone:    Plaintext phone number — encrypted before storage (optional).
    """
    report = Report(
        hazard_id=hazard_id,
        submitted_by_uid=submitted_by_uid,
        reporter_name_enc=encrypt(reporter_name),
        reporter_email_enc=encrypt(reporter_email),
        reporter_phone_enc=encrypt(reporter_phone) if reporter_phone else None,
    )
    doc_ref = db.collection(COLLECTION).document()
    doc_ref.set(report.to_dict())
    report.id = doc_ref.id
    return doc_ref.id


def get_report(report_id: str) -> Optional[Report]:
    """Fetch a single Report by its document ID. Returns None if not found."""
    doc = db.collection(COLLECTION).document(report_id).get()
    if not doc.exists:
        return None
    return Report.from_dict(doc.to_dict(), doc.id)


def get_reports_by_hazard(hazard_id: str) -> List[Report]:
    """Return all reports linked to a hazard, newest first."""
    from google.cloud.firestore import Query
    docs = (
        db.collection(COLLECTION)
        .where("hazard_id", "==", hazard_id)
        .order_by("submitted_at", direction=Query.DESCENDING)
        .stream()
    )
    return [Report.from_dict(doc.to_dict(), doc.id) for doc in docs]
