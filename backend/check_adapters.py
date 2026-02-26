#!/usr/bin/env python3
"""
Check if adapter directories are properly configured before starting the server.
"""
import os
import sys

def check_adapter(name, path):
    """Check if adapter directory is valid"""
    print(f"\n🔍 Checking {name} adapter at: {path}")
    
    if not os.path.exists(path):
        print(f"❌ ERROR: Directory not found: {path}")
        return False
    
    print(f"✅ Directory exists")
    
    # Check for required files
    required_files = ["adapter_config.json"]
    model_files = ["adapter_model.safetensors", "adapter_model.bin"]
    
    for file in required_files:
        file_path = os.path.join(path, file)
        if os.path.exists(file_path):
            print(f"✅ Found: {file}")
        else:
            print(f"❌ Missing: {file}")
            return False
    
    # Check for model weights (either format)
    has_model = False
    for model_file in model_files:
        file_path = os.path.join(path, model_file)
        if os.path.exists(file_path):
            print(f"✅ Found: {model_file}")
            has_model = True
            break
    
    if not has_model:
        print(f"❌ Missing model weights. Expected one of: {', '.join(model_files)}")
        return False
    
    print(f"✅ {name} adapter is valid!")
    return True

def main():
    print("=" * 60)
    print("🏥 SurgicalCopilot Adapter Validation")
    print("=" * 60)
    
    # Get adapter paths from environment or defaults
    adapters = {
        "phase1b": os.getenv("ADAPTER_PHASE1B_PATH", "/mnt/fresh/adapter2/phase1b"),
        "phase2": os.getenv("ADAPTER_PHASE2_PATH", "/mnt/fresh/adapter2/phase2"),
        "onco": os.getenv("ADAPTER_ONCO_PATH", "/mnt/fresh/adapter2/onco"),
    }
    
    all_valid = True
    for name, path in adapters.items():
        if not check_adapter(name, path):
            all_valid = False
    
    print("\n" + "=" * 60)
    if all_valid:
        print("✅ All adapters are valid and ready!")
        print("=" * 60)
        print("\n🚀 You can now start the server:")
        print("   python -m app.main")
        return 0
    else:
        print("❌ Some adapters are invalid or missing!")
        print("=" * 60)
        print("\n📝 To fix:")
        print("1. Check that adapter paths are correct in your .env file:")
        print("   ADAPTER_PHASE1B_PATH=/path/to/phase1b")
        print("   ADAPTER_PHASE2_PATH=/path/to/phase2")
        print("   ADAPTER_ONCO_PATH=/path/to/onco")
        print("\n2. Each adapter directory must contain:")
        print("   - adapter_config.json")
        print("   - adapter_model.safetensors (or adapter_model.bin)")
        print("\n3. If you trained adapters with train_27b.py, they should be at:")
        print("   /mnt/fresh/27dataset/adapters/phase1b_27b/final_adapter")
        print("   /mnt/fresh/27dataset/adapters/phase2_27b/final_adapter")
        print("   /mnt/fresh/27dataset/adapters/onco_27b/final_adapter")
        return 1

if __name__ == "__main__":
    sys.exit(main())
