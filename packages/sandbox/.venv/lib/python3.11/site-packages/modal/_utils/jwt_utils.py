# Copyright Modal Labs 2025
import base64
import json
from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class DecodedJwt:
    header: Dict[str, Any]
    payload: Dict[str, Any]

    @staticmethod
    def decode_without_verification(token: str) -> "DecodedJwt":
        # Split the JWT into its three parts
        header_b64, payload_b64, _ = token.split(".")

        # Decode Base64 (with padding handling)
        header_json = base64.urlsafe_b64decode(header_b64 + "==").decode("utf-8")
        payload_json = base64.urlsafe_b64decode(payload_b64 + "==").decode("utf-8")

        # Convert JSON strings to dictionaries
        header = json.loads(header_json)
        payload = json.loads(payload_json)

        return DecodedJwt(header, payload)

    @staticmethod
    def _base64url_encode(data: str) -> str:
        """Encodes data to Base64 URL-safe format without padding."""
        return base64.urlsafe_b64encode(data.encode()).rstrip(b"=").decode()

    @staticmethod
    def encode_without_signature(fields: Dict[str, Any]) -> str:
        """Encodes an Unsecured JWT (without a signature)."""
        header_b64 = DecodedJwt._base64url_encode(json.dumps({"alg": "none", "typ": "JWT"}))
        payload_b64 = DecodedJwt._base64url_encode(json.dumps(fields))
        return f"{header_b64}.{payload_b64}."  # No signature
