import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.abspath(os.path.expanduser(os.getenv("UPLOAD_DIR", "").strip() or os.path.join(BASE_DIR, "uploads")))

SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_ME_IN_PRODUCTION")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "").strip()
CLOUDINARY_FOLDER = os.getenv("CLOUDINARY_FOLDER", "akare").strip() or "akare"
CLOUDINARY_ENABLED = bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)

STRIPE_PRICE_IDS = {
    "starter": os.getenv("STRIPE_PRICE_STARTER_MONTHLY", "").strip(),
    "business": os.getenv("STRIPE_PRICE_BUSINESS_MONTHLY", "").strip(),
    "enterprise": os.getenv("STRIPE_PRICE_ENTERPRISE_MONTHLY", "").strip(),
}
PRICE_ID_TO_PLAN_KEY = {price_id: plan_key for plan_key, price_id in STRIPE_PRICE_IDS.items() if price_id}

try:
    AI_DAILY_ANALYSIS_LIMIT = int(os.getenv("AI_DAILY_ANALYSIS_LIMIT", "30"))
except ValueError:
    AI_DAILY_ANALYSIS_LIMIT = 30

FREE_TRIAL_PLAN_KEY = "starter"
PLATFORM_ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("PLATFORM_ADMIN_EMAILS", "abadi.saeed@bynh.sa").split(",")
    if email.strip()
}

CORS_ORIGINS = {
    FRONTEND_BASE_URL,
    "https://akare-five.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}
CORS_ORIGINS.update(origin.strip().rstrip("/") for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip())
