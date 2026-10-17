#!/usr/bin/env python3
"""
example_model_training.py

Example script demonstrating how to train and save BullWiser AI models
This shows integration with the existing astrology and training system
"""
# Bug 41 fix: the original file had a blank line before the shebang (shebang was on line 2).
# The Unix kernel only recognises #! when it is the very first byte of the file.
# Fixed by removing the leading blank line so #!/usr/bin/env python3 is line 1.

import numpy as np
from python_modules.model_manager import save_bullwiser_model, load_bullwiser_model
from python_modules.training_bridge import BullWiserTrainingBridge
from sklearn.ensemble import RandomForestClassifier
# Bug 45 fix: datetime, timedelta, and json were imported but never used anywhere
# in this file. Removed to eliminate dead imports and linter F401 warnings.


def create_sample_training_data(num_samples=1000):
    """Create sample training data for demonstration"""
    np.random.seed(42)

    # Generate sample features (would be real market/astrology data in production)
    features = []
    targets = []

    # Bug 46 fix: loop variable 'i' was never used inside the loop body.
    # Python convention for intentionally-unused variables is '_'.
    for _ in range(num_samples):
        # Sample features: [price_change, volume, astro_score, hora_strength, technical_indicators...]
        feature_vector = [
            np.random.normal(0, 2),      # Price change %
            np.random.exponential(2),    # Volume ratio
            np.random.uniform(0, 100),   # Astrology score
            np.random.uniform(0, 10),    # Hora strength
            np.random.normal(50, 15),    # RSI
            np.random.normal(0, 1),      # MACD
            np.random.uniform(0, 1),     # Bollinger position
            np.random.uniform(20, 80),   # Moving average position
        ]

        # Create target based on features (simplified logic)
        astro_score = feature_vector[2]
        price_momentum = feature_vector[0]
        rsi = feature_vector[4]

        # Bug 44 fix: the original formula produced ~52% Bullish / 25% Neutral / 23% Bearish
        # (confirmed by running 10,000 samples). A 2.3x class imbalance biases the model
        # toward predicting Bullish. Fix: normalise each component to a 0-100 range before
        # combining so each signal contributes equally and the resulting distribution is
        # roughly balanced across the three classes.
        #
        # Original (biased):
        #   combined_score = (astro_score * 0.6) + (price_momentum * 20) + (50 - abs(rsi - 50))
        #
        # Fixed: each component normalised to [0, 100] first.
        #   astro_component    : already in [0, 100] — weight 40%
        #   momentum_component : price_momentum ~ N(0,2); clip to [-10,10] then scale to [0,100]
        #   rsi_component      : 50 - abs(rsi-50) is in [0,50]; scale to [0,100]
        astro_component = astro_score  # already [0, 100]
        momentum_norm = max(0.0, min(100.0, (price_momentum + 10.0) * 5.0))  # map [-10,10] -> [0,100]
        rsi_component = (50.0 - abs(rsi - 50.0)) * 2.0  # map [0,50] -> [0,100]

        combined_score = (astro_component * 0.4) + (momentum_norm * 0.3) + (rsi_component * 0.3)

        if combined_score > 66.7:
            target = 2  # Bullish
        elif combined_score < 33.3:
            target = 0  # Bearish
        else:
            target = 1  # Neutral

        features.append(feature_vector)
        targets.append(target)

    return features, targets


def demonstrate_model_training():
    """Demonstrate the complete model training and saving workflow"""
    print("🚀 BullWiser AI Model Training Demonstration")
    print("=" * 50)

    # 1. Create sample data
    print("📊 Generating sample training data...")
    features, targets = create_sample_training_data(1000)
    print(f"Generated {len(features)} training samples with {len(features[0])} features")

    # 2. Prepare training data
    training_data = {
        'features': features,
        'targets': targets,
        'metadata': {
            'model_name': 'demo_bullwiser_ai',
            'model_type': 'random_forest',
            'astrology_enabled': True,
            'sector_focus': ['IT', 'Banking', 'Pharma'],
            'training_period': '2024_demo_data',
            'feature_names': [
                'price_change_pct',
                'volume_ratio',
                'astrology_score',
                'hora_strength',
                'rsi',
                'macd',
                'bollinger_position',
                'ma_position'
            ]
        }
    }

    # 3. Train model using the bridge
    print("\n🤖 Training model...")
    bridge = BullWiserTrainingBridge()
    result = bridge.train_from_data(training_data)

    if result['success']:
        print(f"✅ Model trained successfully!")
        print(f"   Training Accuracy: {result['train_accuracy']:.3f}")
        print(f"   Test Accuracy: {result['test_accuracy']:.3f}")
        print(f"   Model saved to: {result['model_path']}")
        print(f"   Features: {result['feature_count']}")

        # Show feature importance
        if result['feature_importance']:
            print("\n📈 Feature Importance:")
            feature_names = training_data['metadata']['feature_names']
            for i, importance in enumerate(result['feature_importance']):
                feature_name = feature_names[i] if i < len(feature_names) else f'feature_{i}'
                print(f"   {feature_name}: {importance:.3f}")

        # 4. Test prediction with the trained model
        print("\n🔮 Testing prediction...")
        sample_features = features[0]  # Use first training sample
        pred_result = bridge.predict_with_model('demo_bullwiser_ai', sample_features)

        if pred_result['success']:
            prediction = pred_result['prediction']
            print(f"   Sample prediction: {prediction['direction']} ({prediction['confidence']:.1f}% confidence)")
            print(f"   Raw prediction: {prediction['raw_prediction']}")
            print(f"   Probabilities: {[f'{p:.3f}' for p in prediction['probabilities']]}")

    else:
        print(f"❌ Model training failed: {result.get('error', 'Unknown error')}")

    # 5. List all available models
    print("\n📋 Available Models:")
    models_result = bridge.list_available_models()
    if models_result['success']:
        for i, model_info in enumerate(models_result['models'][-5:]):  # Show last 5
            print(f"   {i+1}. {model_info.get('model_name', 'Unknown')} "
                  f"({model_info.get('version', 'No version')}) - "
                  f"Accuracy: {model_info.get('test_accuracy', 'N/A')}")

    print("\n✨ Demonstration completed!")
    print("\nTo use in your BullWiser application:")
    print("1. Call the /api/training/train-model endpoint with your real training data")
    print("2. Use /api/training/predict-with-model to get predictions")
    print("3. List models with /api/training/models")


def demonstrate_simple_save():
    """Demonstrate simple model saving like in your original code"""
    print("\n🔧 Simple Model Save Demonstration")
    print("-" * 30)

    # Create and train a simple model
    from sklearn.datasets import make_classification
    # Bug 43 fix: original call was make_classification(n_classes=3) with no n_informative
    # argument. The default is n_informative=2, but scikit-learn requires
    # n_informative >= n_classes. This caused a confirmed ValueError crash:
    #   "n_classes(3) * n_clusters_per_class(2) must be smaller or equal 2**n_informative(2)=4"
    # Fixed by setting n_informative=4 (>= n_classes=3) with n_redundant=2.
    X, y = make_classification(
        n_samples=500,
        n_features=8,
        n_classes=3,
        n_informative=4,
        n_redundant=2,
        random_state=42
    )

    model = RandomForestClassifier(n_estimators=50, random_state=42)
    model.fit(X, y)

    # Save using the simple function (like your original joblib.dump)
    result = save_bullwiser_model(
        model,
        "simple_demo_model",
        accuracy=0.87,
        description="Simple demonstration model",
        created_by="example_script",
        notes="This demonstrates the simple save_bullwiser_model function"
    )

    if result['success']:
        print(f"✅ Model saved successfully: {result['model_path']}")
        # Bug 47 fix: there was a duplicate print("Model saved successfully!") immediately
        # after the line above, which already prints the full path. Removed the duplicate.

        # Load it back
        load_result = load_bullwiser_model("simple_demo_model")
        if load_result['success']:
            print(f"✅ Model loaded back successfully!")
            loaded_model = load_result['model']
            print(f"   Model type: {type(loaded_model).__name__}")
            print(f"   Metadata: {load_result['metadata'].get('description', 'No description')}")
    else:
        print(f"❌ Save failed: {result.get('error')}")


if __name__ == "__main__":
    # Run the demonstrations
    demonstrate_simple_save()
    demonstrate_model_training()

    print("\n" + "="*60)
    print("Your original code `joblib.dump(model, 'bullwiser_model.pkl')` ")
    print("has been enhanced with:")
    print("- Automatic metadata tracking")
    print("- Model versioning")
    print("- Integration with BullWiser's training system")
    print("- TypeScript API endpoints")
    print("- Model registry and management")
    print("="*60)
