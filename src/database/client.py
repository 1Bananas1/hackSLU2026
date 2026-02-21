"""
Firestore client singleton.

Import `db` anywhere in the codebase to get the Firestore client:

    from src.database.client import db
"""

from firebase_admin import firestore

from .config import initialize_firebase

initialize_firebase()

db = firestore.client()
