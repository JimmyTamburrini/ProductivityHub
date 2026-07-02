"""Auth0 Python SDK integration entrypoint for ScholarHQ.

Run with:
    uv run python start.py

Required environment variables:
    AUTH0_DOMAIN
    AUTH0_CLIENT_ID
    AUTH0_CLIENT_SECRET
    AUTH0_SECRET
    APP_BASE_URL
    PORT (optional; inferred from APP_BASE_URL or defaults to 5000)
"""

import json
from os import environ as env
from urllib.parse import urlparse

from auth0_server_python.auth_server.server_client import ServerClient
from auth0_server_python.auth_types import (
    LogoutOptions,
    StartInteractiveLoginOptions,
    StateData,
    TransactionData,
)
from auth0_server_python.store.abstract import AbstractDataStore
from dotenv import load_dotenv
from flask import Flask, after_this_request, redirect, request
from markupsafe import escape

load_dotenv()

app = Flask(__name__)


class CookieStore(AbstractDataStore):
    """Encrypted cookie-backed store for Auth0 session and transaction data."""

    def __init__(self, secret, cookie_name, max_age, model):
        super().__init__({"secret": secret})
        self.cookie_name = cookie_name
        self.max_age = max_age
        self.model = model

    async def set(self, identifier, state, **_):
        @after_this_request
        def apply(response):
            data = state.model_dump() if hasattr(state, "model_dump") else state
            response.set_cookie(
                self.cookie_name,
                self.encrypt(identifier, data),
                httponly=True,
                samesite="Lax",
                secure=not env.get("APP_BASE_URL", "").startswith("http://"),
                max_age=self.max_age,
            )
            return response

    async def get(self, identifier, options=None):
        try:
            encrypted = (options or {}).get("request", request).cookies.get(self.cookie_name)
            return self.model.model_validate(self.decrypt(identifier, encrypted)) if encrypted else None
        except Exception:
            app.logger.warning("Failed to decrypt cookie %s", self.cookie_name, exc_info=True)
            return None

    async def delete(self, *_, **__):
        @after_this_request
        def apply(response):
            response.delete_cookie(self.cookie_name)
            return response


def get_required_env(name):
    value = env.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def auth0():
    session_secret = get_required_env("AUTH0_SECRET")
    app_base_url = get_required_env("APP_BASE_URL").rstrip("/")

    return ServerClient(
        domain=get_required_env("AUTH0_DOMAIN"),
        client_id=get_required_env("AUTH0_CLIENT_ID"),
        client_secret=get_required_env("AUTH0_CLIENT_SECRET"),
        redirect_uri=f"{app_base_url}/callback",
        authorization_params={"scope": "openid profile email"},
        secret=session_secret,
        state_store=CookieStore(session_secret, "_a0_session", 259200, StateData),
        transaction_store=CookieStore(session_secret, "_a0_tx", 300, TransactionData),
    )


@app.route("/")
async def home():
    user = await auth0().get_user({"request": request})
    head = "<!DOCTYPE html><title>ScholarHQ Auth0 Login</title>"

    if user:
        return f"""
            {head}
            <p>Logged in as {escape(user.get("email", ""))}</p>
            <h1>User Profile</h1>
            <pre>{escape(json.dumps(user, indent=2))}</pre>
            <a href="/logout">Logout</a>
        """

    return f"""
        {head}
        <a href="/login?screen_hint=signup">Signup</a>
        <a href="/login">Login</a>
    """


@app.route("/login")
async def login():
    url = await auth0().start_interactive_login(
        options=StartInteractiveLoginOptions(
            authorization_params=dict(request.args),
        ),
        store_options={"request": request},
    )
    return redirect(url)


@app.route("/callback")
async def callback():
    try:
        await auth0().complete_interactive_login(
            url=request.url,
            store_options={"request": request},
        )
        return redirect("/")
    except Exception:
        app.logger.exception("Callback error")
        return "Something went wrong. Check server logs for details.", 400


@app.route("/logout")
async def logout():
    return_to = get_required_env("APP_BASE_URL").rstrip("/") + "/"
    url = await auth0().logout(
        options=LogoutOptions(return_to=return_to),
        store_options={"request": request},
    )
    return redirect(url)


if __name__ == "__main__":
    parsed_url = urlparse(get_required_env("APP_BASE_URL"))
    app.run(host="0.0.0.0", port=int(env.get("PORT") or parsed_url.port or 5000))
