#!/usr/bin/env python3
"""
Start the packaging worker process.

This worker runs in the background and processes packaging jobs.
Run with: python start_packaging_worker.py
"""

import asyncio
import sys
from pathlib import Path

# Add khipu-cloud-api to path
sys.path.insert(0, str(Path(__file__).parent))

from services.packaging.worker import run_packaging_worker


if __name__ == "__main__":
    print("🚀 Starting Khipu Cloud Packaging Worker")
    print("   Press Ctrl+C to stop")
    print()
    
    try:
        asyncio.run(run_packaging_worker())
    except KeyboardInterrupt:
        print("\n✅ Packaging worker stopped")
        sys.exit(0)
