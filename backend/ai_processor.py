import os
import json
import time
from google import genai  # updated import for the google-genai client
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Platform-wide API key from environment (shared across all accounts)
default_api_key = os.getenv("GEMINI_API_KEY")

# Get the Gemini model name (configurable via .env to avoid hard‑coding)
model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
fallback_models = [
    m.strip()
    for m in os.getenv("GEMINI_FALLBACK_MODELS", "gemini-2.5-flash").split(",")
    if m.strip()
]
try:
    max_retries_per_model = max(1, int(os.getenv("AI_MODEL_MAX_RETRIES", "1")))
except ValueError:
    max_retries_per_model = 1


def _get_gemini_client(api_key_override: str | None = None) -> genai.Client:
    """
    Returns a Gemini client using the platform-level GEMINI_API_KEY only.
    The api_key_override argument is intentionally ignored to enforce
    a single shared key for the whole platform.
    """
    _ = api_key_override
    api_key = default_api_key
    if not api_key:
        raise ValueError(
            "No Gemini API key configured. "
            "Set GEMINI_API_KEY in the environment."
        )
    return genai.Client(api_key=api_key)


def _generate_with_retry(client: genai.Client, prompt: str):
    """
    Use primary model then fallback models, with retry for transient 503 errors.
    """
    candidates = [model_name] + [m for m in fallback_models if m != model_name]
    last_error: Exception | None = None

    for candidate_model in candidates:
        for attempt in range(max_retries_per_model):
            try:
                return client.models.generate_content(
                    model=candidate_model,
                    contents=prompt,
                )
            except Exception as e:
                last_error = e
                msg = str(e)
                transient = ("UNAVAILABLE" in msg) or ("503" in msg)
                if transient and attempt < (max_retries_per_model - 1):
                    time.sleep(0.8 * (2 ** attempt))
                    continue
                break

    if last_error:
        raise last_error
    raise RuntimeError("Failed to generate AI response.")

def process_real_estate_text(text: str, api_key: str | None = None) -> dict:
    """
    Analyzes a real estate text using Gemini to extract structured data.

    Args:
        text: The raw real estate listing text.

    Returns:
        A dictionary containing the extracted property information.
    """
    prompt = f"""
    Analyze the following real estate listing text from Saudi Arabia. Your task is to extract the specified entities and return them as a valid JSON object.

    **Text to Analyze:**
    "{text}"

    **Entities to Extract:**
    - "city": The city where the property is located (e.g., "جدة", "الرياض").
    - "neighborhood": The district or neighborhood (e.g., "الفيحاء", "العزيزية").
    - "property_type": The type of property (e.g., "فيلا", "شقة", "أرض").
    - "area": The area of the property in square meters. Must be a number.
    - "price": The price of the property. Must be a number.
    - "details": Any other relevant details (e.g., "دورين", "3 غرف نوم").
    - "owner_name": The name of the owner or contact person.
    - "owner_contact_number": The phone number of the OWNER (for example: رقم المالك).
    - "marketer_contact_number": The phone number of the MARKETER/AGENT (for example: رقم المسوق, الوسيط, المعلن).
    - "formatted_description": A single, well-written Arabic paragraph that describes the property in a professional real-estate style, combining all important information (city, neighborhood, type, area, price, key features, and contact info) in a clear and attractive way for buyers.
    - "region_within_city": OPTIONAL. The rough region of the property inside its city, inferred from the city + neighborhood only.
         Use ONLY one of these exact Arabic strings: "شمال", "جنوب", "شرق", "غرب", "وسط", "غير مذكور".
         Example: حي الروضة في جدة => "شمال". حي البطحاء في الرياض => "وسط".

    **Rules:**
    1.  The output MUST be a single, valid JSON object.
    2.  All keys must be in English as specified above.
    3.  Values should be in Arabic as they appear in the text, except for 'area' and 'price' which must be numbers.
    4.  If a value is not found for a TEXT field (city, neighborhood, property_type, details, owner_name, owner_contact_number, marketer_contact_number, formatted_description, region_within_city), use the Arabic string "غير مذكور".
    5.  If a value is not found for a NUMERIC field (area, price), use a JSON `null` value.
    6.  If there is only ONE phone number in the text and it clearly belongs to the owner, put it in "owner_contact_number" and set "marketer_contact_number" to null.
    7.  Do not include any text, explanations, or markdown formatting before or after the JSON object.

    **Example Output:**
    {{
      "city": "جدة",
      "neighborhood": "الفيحاء",
      "property_type": "فيلا",
      "area": 300,
      "price": 7000000,
      "details": "دورين",
      "owner_name": "محمد أحمد",
      "owner_contact_number": "057894762",
      "marketer_contact_number": null,
      "formatted_description": "فيلا مميزة للبيع في حي الفيحاء بمدينة جدة، بمساحة 300 متر مربع، بسعر 7,000,000 ريال، تتكون من دورين مع تشطيب ممتاز، مناسبة للعائلات الباحثة عن سكن راقٍ، للتواصل مع المالك محمد أحمد على الرقم 057894762.",
      "region_within_city": "شمال"
    }}
    """

    try:
        # Call the Gemini model using the new google-genai client
        client = _get_gemini_client(api_key)
        response = _generate_with_retry(client, prompt)
        # Clean the response to get only the JSON part
        text_response = getattr(response, "text", "")
        json_text = text_response.strip().replace("```json", "").replace("```", "").strip()
        data = json.loads(json_text)
        return data
    except (json.JSONDecodeError, Exception) as e:
        print(f"Error processing text with AI: {e}")
        # In case of an error, return a structured error message or an empty dict
        return {"error": "Failed to process text with AI", "details": str(e)}


def process_search_text(text: str, api_key: str | None = None) -> dict:
    """
    Analyzes a buyer's free-text search request (in Arabic) and converts it
    into structured filters that can be used to query the properties collection.

    Returns a JSON dict with:
      - city: string or null
      - neighborhood: string or null
      - property_type: string or null
      - region_within_city: string or null (one of "شمال", "جنوب", "شرق", "غرب", "وسط", or null)
      - min_area: number or null
      - max_area: number or null
      - min_price: number or null
      - max_price: number or null
      - keywords: array of short Arabic phrases relevant for text search
    """
    prompt = f"""
    You are helping a real-estate platform in Saudi Arabia.
    A real-estate AGENT writes a free-text BUYER REQUEST in Arabic, for example:

    "أبحث عن أرض في الرياض مساحتها 1000 متر وعلى شارعين"

    Your task is to convert this buyer request into structured SEARCH FILTERS
    that can be used to query a database of properties.

    **Buyer Request to Analyze (Arabic):**
    "{text}"

    **Filters to Extract (as JSON):**
    - "city": The requested city (e.g., "الرياض", "جدة"). If not clear, use null.
    - "neighborhood": The requested neighborhood if specified (e.g., "العزيزية"). If not clear, use null.
    - "property_type": The requested type of property (e.g., "أرض", "فيلا", "شقة"). If not clear, use null.
    - "region_within_city": OPTIONAL. If the buyer clearly specifies a region inside the city (like "شمال جدة", "جنوب الرياض"),
          infer one of exactly: "شمال", "جنوب", "شرق", "غرب", "وسط". Otherwise use null.
    - "min_area": Minimum area in square meters (number). If the user mentions one area like 1000m, set min_area a bit lower (e.g., 900). If not clear, use null.
    - "max_area": Maximum area in square meters (number). If the user mentions one area like 1000m, set max_area a bit higher (e.g., 1100). If not clear, use null.
    - "min_price": Minimum price (number) if the buyer mentions a range or minimum. Otherwise null.
    - "max_price": Maximum price (number) if the buyer mentions a range or maximum. Otherwise null.
    - "keywords": An array of IMPORTANT Arabic words or short phrases to match inside property details/raw text.
                  Examples: ["شارعين", "زاوية", "سكني", "تجاري"].

    **Rules:**
    1.  The output MUST be a single, valid JSON object.
    2.  All keys must be EXACTLY: "city", "neighborhood", "property_type",
        "region_within_city", "min_area", "max_area", "min_price", "max_price", "keywords".
    3.  All numeric fields must be numbers or null.
    4.  All text fields must be Arabic strings or null.
    5.  "keywords" must always be an array (possibly empty).
    6.  Do NOT include any extra keys.
    7.  Do NOT include any explanations or text before or after the JSON.

    **Example Output:**
    {{
      "city": "جدة",
      "neighborhood": null,
      "property_type": "أرض",
      "region_within_city": "شمال",
      "min_area": 900,
      "max_area": 1100,
      "min_price": null,
      "max_price": null,
      "keywords": ["شارعين", "زاوية"]
    }}
    """

    try:
        client = _get_gemini_client(api_key)
        response = _generate_with_retry(client, prompt)
        text_response = getattr(response, "text", "")
        json_text = text_response.strip().replace("```json", "").replace("```", "").strip()
        data = json.loads(json_text)
        return data
    except (json.JSONDecodeError, Exception) as e:
        print(f"Error processing search text with AI: {e}")
        return {"error": "Failed to process search text with AI", "details": str(e)}


def process_client_request_text(text: str, api_key: str | None = None) -> dict:
    """
    Parse unstructured buyer request message into structured mini-CRM fields.
    """
    prompt = f"""
    أنت محلل بيانات عقارية للسوق السعودي.
    اقرأ رسالة عميل غير منظمة، وأخرج JSON فقط بدون أي نص إضافي.

    النص:
    "{text}"

    استخرج الحقول التالية:
    - client_name: اسم العميل، وإذا غير مذكور استخدم "غير محدد"
    - phone_number: رقم الجوال أو null
    - property_type: نوع العقار (فيلا/شقة/أرض/عمارة...) أو "غير محدد"
    - city: المدينة أو "غير محدد"
    - neighborhoods: مصفوفة أسماء أحياء (قد تكون فارغة)
    - budget_min: الميزانية من (رقم صحيح) أو null
    - budget_max:الميزانية إلى (رقم صحيح) أو null
    - area_min: المساحة من بالمتر المربع (رقم صحيح) أو null
    - area_max: المساحة إلى بالمتر المربع (رقم صحيح) أو null
    - additional_requirements: نص مختصر للشروط الإضافية، أو ""
    - follow_up_details: نص يصف ما يجب على الموظف عمله في المتابعة القادمة، أو ""
    - suggested_action_plan: جملة استراتيجية عمل قصيرة قابلة للتنفيذ
    - reminder_type: نوع التذكير. إذا ذكر العميل موعد للمعاينة استخدم "viewing"، وإذا يريد متابعة استخدم "follow_up"، وإلا null
    - deadline_at: الموعد النهائي بالتنسيق ISO 8601 (مثال: "2025-05-12T16:00:00") مع YEAR必须是السنةالحالية2025، أو null إذا غير مذكور

    القواعد المهمة:
    1) JSON صالح فقط.
    2) لا تضف مفاتيح إضافية.
    3) neighborhoods يجب أن تكون Array دائمًا (قد تكون فارغة).
    4) budget_min / budget_max أرقام صحيحة أو null.
    5) area_min / area_max أرقام صحيحة أو null.
    6) deadline_at: يجب أن يكون YEAR=2025 (السنةالحالية). إذا ذكر العميل "12 مايو" يجب أن يكون "2025-05-12". استخدم تنسيق 24 ساعة في ISO (مثال: 4 مساء = 16:00).
    7) reminder_type يجب أن يكون null أو "follow_up" أو "viewing" فقط.

    مثال:
    {{
      "client_name": "أبو أحمد",
      "phone_number": "0501234567",
      "property_type": "أرض تجارية",
      "city": "جدة",
      "neighborhoods": ["النعيم", "المحمدية"],
      "budget_min": 2000000,
      "budget_max": 2500000,
      "area_min": 1000,
      "area_max": 1500,
      "additional_requirements": "مستعجل خلال هذا الأسبوع",
      "follow_up_details": "التواصل مع العميل لعرض العقارات المطابقة.",
      "suggested_action_plan": "العميل جاهز للشراء؛ طابق طلبه فورًا مع عروض شمال جدة وحدد موعد معاينة.",
      "reminder_type": "viewing",
      "deadline_at": "2025-05-12T16:00:00"
    }}
    """
    try:
        client = _get_gemini_client(api_key)
        response = _generate_with_retry(client, prompt)
        text_response = getattr(response, "text", "")
        json_text = text_response.strip().replace("```json", "").replace("```", "").strip()
        data = json.loads(json_text)
        return data
    except (json.JSONDecodeError, Exception) as e:
        print(f"Error processing client request text with AI: {e}")
        return {"error": "Failed to process client request text with AI", "details": str(e)}
