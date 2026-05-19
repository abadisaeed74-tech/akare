from typing import Dict

from ai_processor import process_client_request_text, process_real_estate_text


def process_property_text_service(raw_text: str) -> Dict:
    return process_real_estate_text(raw_text, api_key=None)


def process_client_request_text_service(raw_text: str) -> Dict:
    return process_client_request_text(raw_text, api_key=None)
