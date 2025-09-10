#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script to check if LLM integration is working
"""

import sys
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

try:
    from dossier.client import chat_json
    from core.config import load_config
    print("✅ Imports successful", file=sys.stderr)
    
    # Test config loading
    config = load_config()
    print(f"✅ Config loaded. Model: {config.openai.model}", file=sys.stderr)
    print(f"✅ API Key set: {bool(config.openai.api_key)}", file=sys.stderr)
    
    # Test simple LLM call
    messages = [
        {"role": "system", "content": "You are a helpful assistant. Always respond with valid JSON."},
        {"role": "user", "content": "Return a JSON object with a 'test' field set to 'success': "}
    ]
    
    print("🤖 Testing LLM call...", file=sys.stderr)
    response = chat_json(messages, model=config.openai.model, temperature=0.1, max_tokens=100)
    print(f"✅ LLM Response: {response}", file=sys.stderr)
    print("SUCCESS: LLM integration is working!")
    
except Exception as e:
    print(f"❌ Error: {e}", file=sys.stderr)
    import traceback
    traceback.print_exc(file=sys.stderr)
    print("FAILED: LLM integration not working")
    sys.exit(1)
