"""Local development runner: forces SQLite + a dev secret, then starts uvicorn.

Sets env defaults BEFORE the app is imported so `load_dotenv()` (which does not
override already-set variables) won't pull in a production DATABASE_URL.
"""
import os
import sys

# Make this runnable from any working directory.
_HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(_HERE)
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

os.environ.setdefault("DATABASE_URL", "sqlite:///./eventpro.db")
os.environ.setdefault("SECRET_KEY", "local-dev-secret")
os.environ.setdefault("CEREBRAS_API_KEY", "")

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8010, reload=False, log_level="warning")
