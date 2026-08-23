import sys
from pathlib import Path

# Add backend directory to Python module search path for Vercel Serverless Function
backend_path = Path(__file__).resolve().parent.parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from app.main import app as fastapi_app, seed_database

# Guarantee database tables and initial demo user accounts exist on Vercel serverless cold starts
try:
    seed_database()
except Exception as e:
    print("Vercel cold start database initialization info:", e)

async def app(scope, receive, send):
    if scope["type"] == "http":
        path = scope.get("path", "")
        headers = dict(scope.get("headers", []))
        
        matched_path = headers.get(b"x-matched-path", b"").decode("utf-8")
        forwarded_uri = headers.get(b"x-forwarded-uri", b"").decode("utf-8")
        
        target_path = matched_path or forwarded_uri or path
        
        if target_path.startswith("/api/index.py"):
            target_path = target_path.replace("/api/index.py", "")
            if not target_path:
                target_path = "/"

        if not target_path.startswith("/api"):
            if target_path.startswith("/v1"):
                target_path = "/api" + target_path
            elif not target_path.startswith("/"):
                target_path = "/api/v1/" + target_path
            else:
                target_path = "/api/v1" + target_path
                
        scope["path"] = target_path

    await fastapi_app(scope, receive, send)
