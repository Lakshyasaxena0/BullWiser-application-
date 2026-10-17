"""
python_modules/training_bridge.py

Provides BullWiserTrainingBridge: trains a RandomForest model from structured
training data, stores it via model_manager, and serves predictions.

CLI usage (called from Node.js via spawn):
  python training_bridge.py train  <data_json_file>
  python training_bridge.py predict <model_name> <features_json>
  python training_bridge.py list
"""

import sys
import json
import os
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from .model_manager import save_bullwiser_model, load_bullwiser_model, BullWiserModelManager

DIRECTION_MAP = {0: 'bearish', 1: 'neutral', 2: 'bullish'}


class BullWiserTrainingBridge:
    """Bridge between BullWiser's training data format and scikit-learn models."""

    def __init__(self):
        self._manager = BullWiserModelManager()

    def train_from_data(self, training_data):
        """
        Train a RandomForest from the standard BullWiser training_data dict.

        Parameters
        ----------
        training_data : dict with keys 'features', 'targets', 'metadata'

        Returns
        -------
        dict with keys: success, train_accuracy, test_accuracy, model_path,
                        feature_count, feature_importance, error
        """
        try:
            X = np.array(training_data['features'])
            y = np.array(training_data['targets'])
            meta = training_data.get('metadata', {})
            model_name = meta.get('model_name', 'bullwiser_model')

            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42, stratify=y
            )

            model = RandomForestClassifier(n_estimators=100, random_state=42)
            model.fit(X_train, y_train)

            train_acc = accuracy_score(y_train, model.predict(X_train))
            test_acc  = accuracy_score(y_test,  model.predict(X_test))

            save_result = save_bullwiser_model(
                model, model_name,
                accuracy=test_acc,
                description=meta.get('training_period', ''),
                created_by='training_bridge',
            )

            return {
                'success':            True,
                'train_accuracy':     float(train_acc),
                'test_accuracy':      float(test_acc),
                'model_path':         save_result.get('model_path', ''),
                'feature_count':      X.shape[1],
                'feature_importance': model.feature_importances_.tolist(),
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def predict_with_model(self, model_name, features):
        """
        Load a saved model and return a prediction for the given feature vector.
        """
        try:
            load_result = load_bullwiser_model(model_name)
            if not load_result['success']:
                return {'success': False, 'error': load_result.get('error', 'Load failed')}

            model = load_result['model']
            X = np.array(features).reshape(1, -1)
            raw = int(model.predict(X)[0])
            proba = model.predict_proba(X)[0].tolist()
            confidence = float(max(proba)) * 100.0

            return {
                'success': True,
                'prediction': {
                    'direction':      DIRECTION_MAP.get(raw, 'unknown'),
                    'raw_prediction': raw,
                    'confidence':     confidence,
                    'probabilities':  proba,
                },
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def list_available_models(self):
        """Return a list of all saved model metadata dicts."""
        try:
            models = self._manager.list_models()
            return {'success': True, 'models': models}
        except Exception as e:
            return {'success': False, 'models': [], 'error': str(e)}


# ── CLI entry point (called by Node.js via spawn) ─────────────────────────────
# Commands:
#   train   <json_data_file>           — train model, print JSON result
#   predict <model_name> <features>    — predict, print JSON result
#   list                               — list models, print JSON result
# ─────────────────────────────────────────────────────────────────────────────
def main():
    bridge = BullWiserTrainingBridge()

    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'No command provided. Use: train | predict | list'}))
        sys.exit(1)

    command = sys.argv[1].lower()

    try:
        # ── train <data_json_file> ──────────────────────────────────────────
        if command == 'train':
            if len(sys.argv) < 3:
                print(json.dumps({'success': False, 'error': 'train requires a data JSON file path'}))
                sys.exit(1)

            data_file = sys.argv[2]
            if not os.path.exists(data_file):
                print(json.dumps({'success': False, 'error': f'Data file not found: {data_file}'}))
                sys.exit(1)

            with open(data_file, 'r') as f:
                training_data = json.load(f)

            result = bridge.train_from_data(training_data)
            print(json.dumps(result))

        # ── predict <model_name> <features_json> ───────────────────────────
        elif command == 'predict':
            if len(sys.argv) < 4:
                print(json.dumps({'success': False, 'error': 'predict requires model_name and features JSON'}))
                sys.exit(1)

            model_name = sys.argv[2]
            features   = json.loads(sys.argv[3])
            result     = bridge.predict_with_model(model_name, features)
            print(json.dumps(result))

        # ── list ───────────────────────────────────────────────────────────
        elif command == 'list':
            result = bridge.list_available_models()
            print(json.dumps(result))

        else:
            print(json.dumps({'success': False, 'error': f'Unknown command: {command}. Use: train | predict | list'}))
            sys.exit(1)

    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
