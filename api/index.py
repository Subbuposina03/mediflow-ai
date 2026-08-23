import sys
from pathlib import Path

# Add backend directory to Python module search path for Vercel Serverless Function
backend_path = Path(__file__).resolve().parent.parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from app.main import app, seed_database

# Guarantee database tables and initial demo user accounts exist on Vercel serverless cold starts
try:
    seed_database()
except Exception as e:
    print("Vercel cold start database initialization info:", e)

