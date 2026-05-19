import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import CORS_ORIGINS, UPLOAD_DIR
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

os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="Akare Real Estate AI API",
    description="API for managing and filtering real estate listings.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(CORS_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

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
