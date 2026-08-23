from datetime import datetime
from zoneinfo import ZoneInfo

# Centralized IST Timezone definition
IST = ZoneInfo("Asia/Kolkata")

def now() -> datetime:
    """
    Returns the current datetime in Indian Standard Time (IST - Asia/Kolkata).
    The returned datetime object is timezone-aware.
    """
    return datetime.now(IST)

def to_ist(dt: datetime) -> datetime:
    """
    Converts a datetime to Asia/Kolkata (IST) timezone.
    If the datetime is naive, localizes it directly to IST.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=IST)
    return dt.astimezone(IST)
