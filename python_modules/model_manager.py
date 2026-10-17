"""
python_modules/model_manager.py

Handles saving, loading, and listing BullWiser AI models.
Models are stored under saved_models/ with metadata JSON sidecars.
"""

import os
import joblib
import json
from datetime import datetime, timezone

MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', 'saved_models')


def _ensure_models_dir():
    """
    Create the saved_models/ directory if it does not already exist.

    Called lazily inside each function instead of at module import time,
    so that merely importing this module does not attempt to create
    directories on read-only filesystems (CI, Lambda, etc.).
    """
    os.makedirs(MODELS_DIR, exist_ok=True)


def save_bullwiser_model(model, model_name, accuracy=None, description=None,
                         created_by=None, notes=None):
    """
    Save a trained scikit-learn model to disk with metadata.

    Parameters
    ----------
    model       : trained sklearn estimator
    model_name  : str — used as the file stem
    accuracy    : float | None — accuracy to record in metadata
    description : str | None
    created_by  : str | None
    notes       : str | None

    Returns
    -------
    dict with keys: success (bool), model_path (str), error (str)
    """
    try:
        _ensure_models_dir()

        model_path = os.path.join(MODELS_DIR, f"{model_name}.pkl")
        meta_path  = os.path.join(MODELS_DIR, f"{model_name}.json")

        joblib.dump(model, model_path)

        # Fix: datetime.utcnow() is deprecated in Python 3.12+.
        # Use datetime.now(timezone.utc) for a timezone-aware UTC timestamp.
        now = datetime.now(timezone.utc)
        metadata = {
            'model_name':  model_name,
            'version':     now.strftime('%Y%m%d_%H%M%S'),
            'accuracy':    accuracy,
            'description': description,
            'created_by':  created_by,
            'notes':       notes,
            'created_at':  now.isoformat(),
        }
        with open(meta_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        return {'success': True, 'model_path': model_path}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def load_bullwiser_model(model_name):
    """
    Load a previously saved model and its metadata.

    Returns
    -------
    dict with keys: success (bool), model, metadata (dict), error (str)
    """
    try:
        _ensure_models_dir()

        model_path = os.path.join(MODELS_DIR, f"{model_name}.pkl")
        meta_path  = os.path.join(MODELS_DIR, f"{model_name}.json")

        model = joblib.load(model_path)

        metadata = {}
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                metadata = json.load(f)

        return {'success': True, 'model': model, 'metadata': metadata}
    except Exception as e:
        return {'success': False, 'model': None, 'metadata': {}, 'error': str(e)}


class BullWiserModelManager:
    """High-level interface for managing the BullWiser model registry."""

    def list_models(self):
        """Return metadata dicts for all saved models."""
        _ensure_models_dir()
        models = []
        for fname in sorted(os.listdir(MODELS_DIR)):
            if fname.endswith('.json'):
                with open(os.path.join(MODELS_DIR, fname)) as f:
                    models.append(json.load(f))
        return models

