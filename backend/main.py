import asyncio
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request

from config import CORS_ORIGIN_REGEX, CORS_ORIGINS, UPLOAD_DIR, ensure_stripe_env_or_raise
from routers import (
    admin,
    appointments,
    auth,
    billing,
    client_offers,
    client_profiles,
    clients,
    dashboard,
    marketing,
    notifications,
    properties,
    public,
    settings,
    uploads,
)
from services.email_reminder_service import run_email_reminders_scheduler
from services.audit_service import ensure_audit_indexes

os.makedirs(UPLOAD_DIR, exist_ok=True)
ensure_stripe_env_or_raise()

app = FastAPI(
    title="Akare Real Estate AI API",
    description="API for managing and filtering real estate listings.",
    version="1.0.0",
)
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(CORS_ORIGINS),
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_upload_security_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/uploads/"):
        # Prevent content type sniffing for publicly served files.
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.on_event("startup")
async def startup_email_scheduler() -> None:
    await ensure_audit_indexes()
    app.state.email_scheduler_stop_event = asyncio.Event()
    app.state.email_scheduler_task = asyncio.create_task(
        run_email_reminders_scheduler(app.state.email_scheduler_stop_event)
    )
    logger.info("Email reminder scheduler task created")


@app.on_event("shutdown")
async def shutdown_email_scheduler() -> None:
    stop_event = getattr(app.state, "email_scheduler_stop_event", None)
    task = getattr(app.state, "email_scheduler_task", None)
    if stop_event:
        stop_event.set()
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

app.include_router(public.router)
app.include_router(auth.router)
app.include_router(properties.router)
app.include_router(clients.router)
app.include_router(client_offers.router)
app.include_router(client_profiles.router)
app.include_router(appointments.router)
app.include_router(dashboard.router)
app.include_router(billing.router)
app.include_router(settings.router)
app.include_router(uploads.router)
app.include_router(admin.router)
app.include_router(marketing.router)
app.include_router(notifications.router)
