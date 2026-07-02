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
from datetime import datetime, timezone
from os import environ as env
from pathlib import Path
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
from flask import Flask, after_this_request, redirect, request, send_from_directory

load_dotenv()

app = Flask(__name__)
ROOT_DIR = Path(__file__).resolve().parent
AUTH_ACCOUNTS_KEY = "scholarhq-auth-accounts"
AUTH_SESSION_KEY = "scholarhq-auth-session"


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


def build_auth_bootstrap(user):
    """Create a small script that bridges the Auth0 session into the static app."""
    if not user:
        return f"""
            <script>
              window.localStorage.removeItem({json.dumps(AUTH_SESSION_KEY)});
            </script>
        """

    now = datetime.now(timezone.utc).isoformat()
    auth_user = {
        "id": user.get("sub") or user.get("id") or user.get("email") or "auth0-user",
        "name": user.get("name") or user.get("nickname") or user.get("email") or "Student",
        "email": user.get("email") or "",
        "createdAt": now,
        "lastLoginAt": now,
    }

    return f"""
        <script>
          (function () {{
            var accountsKey = {json.dumps(AUTH_ACCOUNTS_KEY)};
            var sessionKey = {json.dumps(AUTH_SESSION_KEY)};
            var authUser = {json.dumps(auth_user)};
            var accounts = [];

            try {{
              accounts = JSON.parse(window.localStorage.getItem(accountsKey) || "[]");
            }} catch (_error) {{
              accounts = [];
            }}

            if (!Array.isArray(accounts)) {{
              accounts = [];
            }}

            var existing = accounts.find(function (account) {{
              return account.id === authUser.id || (authUser.email && account.email === authUser.email);
            }}) || {{}};
            var account = {{
              id: authUser.id,
              name: authUser.name,
              email: authUser.email,
              passwordHash: existing.passwordHash || "auth0-session",
              salt: existing.salt || "auth0-session",
              createdAt: existing.createdAt || authUser.createdAt,
              lastLoginAt: authUser.lastLoginAt,
              school: existing.school || "",
            }};
            var nextAccounts = accounts.filter(function (savedAccount) {{
              return savedAccount.id !== account.id && savedAccount.email !== account.email;
            }});

            nextAccounts.push(account);
            window.localStorage.setItem(accountsKey, JSON.stringify(nextAccounts));
            window.localStorage.setItem(sessionKey, JSON.stringify({{ userId: account.id, savedAt: authUser.lastLoginAt }}));
          }})();
        </script>
    """


async def render_app():
    user = await auth0().get_user({"request": request})
    index_html = (ROOT_DIR / "index.html").read_text(encoding="utf-8")
    bootstrap = build_auth_bootstrap(user)
    return index_html.replace('<script src="./src/app.bundle.js"></script>', f'{bootstrap}\n    <script src="./src/app.bundle.js"></script>')


@app.route("/")
async def home():
    return await render_app()


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


@app.route("/src/<path:filename>")
def src_asset(filename):
    return send_from_directory(ROOT_DIR / "src", filename)


@app.route("/<path:filename>")
async def static_or_app(filename):
    if filename in {"login", "callback", "logout"}:
        return await render_app()

    requested = (ROOT_DIR / filename).resolve()
    if requested.is_file() and ROOT_DIR in requested.parents:
        return send_from_directory(ROOT_DIR, filename)

    return await render_app()


if __name__ == "__main__":
    parsed_url = urlparse(get_required_env("APP_BASE_URL"))
    app.run(host="0.0.0.0", port=int(env.get("PORT") or parsed_url.port or 5000))
