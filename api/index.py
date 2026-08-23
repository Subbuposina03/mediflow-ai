import sys
from pathlib import Path

# Add backend directory to Python module search path for Vercel Serverless Function
backend_path = Path(__file__).resolve().parent.parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from app.main import app
