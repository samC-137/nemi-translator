from datetime import datetime, timedelta
from typing import Any, Dict

import jwt


def create_token(
    subject: str,
    role: str,
    secret: str,
    algorithm: str,
    expires_minutes: int,
    extra_claims: Dict[str, str] | None = None,
) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": subject,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, secret, algorithm=algorithm)


def decode_token(token: str, secret: str, algorithm: str) -> Dict[str, Any]:
    return jwt.decode(token, secret, algorithms=[algorithm])
