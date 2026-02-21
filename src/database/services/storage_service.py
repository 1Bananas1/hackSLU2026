"""
Firebase Storage helpers.

Handles uploading captured frame images and returning their public URLs.
Images are stored under:

    frames/<session_id>/<filename>

Requires FIREBASE_STORAGE_BUCKET to be set in .env (see config.py).

Usage:
    from src.database.services.storage_service import upload_frame

    photo_url = upload_frame(
        image_bytes=jpeg_bytes,
        session_id=session.id,
        filename="frame_0050.jpg",
    )
"""

from firebase_admin import storage


def upload_frame(image_bytes: bytes, session_id: str, filename: str) -> str:
    """
    Upload a JPEG frame to Firebase Storage and return its public URL.

    Stores the blob at:  frames/<session_id>/<filename>

    Args:
        image_bytes: Raw JPEG bytes of the captured frame.
        session_id:  Firestore document ID of the parent session.
        filename:    Filename for the blob (e.g. "frame_0050.jpg").

    Returns:
        Public HTTPS URL of the uploaded image.
    """
    bucket = storage.bucket()
    blob = bucket.blob(f"frames/{session_id}/{filename}")
    blob.upload_from_string(image_bytes, content_type="image/jpeg")
    blob.make_public()
    return blob.public_url
