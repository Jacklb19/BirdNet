"""ASGI entry point for the configured Vercel Python function."""
from backend.app import app

__all__ = ["app"]
