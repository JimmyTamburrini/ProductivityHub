# AcademicTILT

AcademicTILT is a local-first student productivity website built to help students log study sessions, track classes, calculate weighted grades and GPA, and review study trends from one clean dashboard.

# Active Demo HTML is uploaded here: https://jimmytamburrini.github.io/productivity-hub-overview/


The core study tracker runs in the browser using HTML, CSS, JavaScript, and `localStorage`. The AI coach and study planner now use a small Render-hosted Node API so the OpenAI key stays on the server.

## What It Does

- Create a local account, log in, and keep each browser user's study data in a separate workspace
- Log study sessions with subject, date, duration, notes, category, and optional assignment or exam details
- Track classes with weighted assignment entries and a running GPA for each class
- View semester GPA across classes with saved weighted grades
- Compare weekly study time by class on the Charts page
- Review `Grade vs Study Time` analytics based on study time leading up to assignments and exams
- Explore summary stats like total study time, average session length, class distribution, and study patterns
- Use a built-in study timer from the Home page
- Connect Google Calendar with OAuth and sync saved study sessions as calendar events

## Current Pages

- `Home`: overview, timer, and quick productivity summary
- `Classes`: manage gradebooks, weighted grades, GPA, and class details
- `Sessions`: add, edit, delete, and sort study sessions
- `Charts`: weekly time charts and grade-vs-study analytics
- `Stats`: study breakdowns and performance insights
- `Calendar`: Google OAuth connection status plus saved-session syncing into Google Calendar

## Key Behaviors

- Account login and signup currently run locally in the browser as a backend-ready prototype
- Study sessions are stored locally in the browser under the signed-in account
- Class gradebooks are stored locally in the browser under the signed-in account
- If a study session includes assignment info and a grade, it can publish into the matching class gradebook automatically
- Grade-vs-study comparisons use:
  - matching subject
  - matching assignment name
  - sessions categorized as `study`
  - a 14-day lookback window before the assignment or exam

## Tech Stack

- `HTML`
- `CSS`
- `JavaScript`
- Browser `localStorage`
- Render Web Service
- Node.js API routes

## Project Structure

```text
index.html
src/
  app.bundle.js
  styles.css
```

## Run Locally

Because this is a static browser app, you can run it very simply. The first screen now asks you to create a local AcademicTILT account before opening the dashboard.

1. Clone or download the repository
2. Find the index.html file in the project folder once downloaded to your desktop
3. Right-click to 'Open-with' and select your desired browser

If you prefer, you can also serve it with the same Node server used on Render:

```bash
npm install
npm start
```

The AcademicTILT command runner also supports the requested command style when the package binary is available:

```bash
scholar start
```

## Main Files

- `index.html` - app entry point
- `src/app.bundle.js` - app logic, rendering, state, storage, and interactivity
- `src/styles.css` - visual design, layout, theme, and responsive styling
- `api/study-coach.js` - Render-hosted AI endpoint for the Home page coach
- `api/study-plan.js` - Render-hosted AI endpoint for the study planner
- `api/google-calendar.js` - Google OAuth, token refresh, connection status, and Calendar event creation endpoint
- `api/accounts.js` - local Node endpoint that records created account names/emails to `created-accounts.json` when running through `npm start`
- `created-accounts.json` - readable local account list for created website accounts; password hashes are intentionally not written here
- `server.js` - Node server that serves the static app and AI/API routes
- `render.yaml` - Render Blueprint configuration

## AI Study Coach Setup on Render

This project now includes AI features on the Home page:

- `AI Study Coach`
- `AI Study Plan` with researched topic guidance from your logged assignments and exams

To enable it on Render:

1. Create a Render Web Service from this repository, or use the included `render.yaml` Blueprint.
2. Set the Render environment variable named `SCHOLARHQ_API` to your OpenAI API key. Do not commit the key to this repository.
3. Optionally add `OPENAI_MODEL` if you want to override the default model (`gpt-4o-mini`).
4. Use the Node runtime. The included Render Blueprint runs `npm install` and starts the app with `npm start`, which launches the AcademicTILT command runner with `scholar start` behavior.
5. Redeploy the service after saving environment variables.

The frontend sends your study data to Render API routes at `/api/study-coach` and `/api/study-plan`, and the Render server calls the OpenAI API securely from the server side.


## Google Calendar Setup

This project now includes the backend pieces needed for Google Calendar event creation. The frontend Calendar page connects the logged-in AcademicTILT browser account to Google OAuth, checks connection status, and syncs up to five saved study sessions into the user's primary Google Calendar.

After creating your Google Cloud project:

1. Enable the Google Calendar API.
2. Configure the OAuth consent screen.
3. Create an OAuth Client ID with type `Web application`.
4. Add this authorized redirect URI for local development:

```text
http://localhost:3000/api/google/callback
```

5. On Render, add the deployed callback URL too, for example:

```text
https://your-render-service.onrender.com/api/google/callback
```

6. Add these environment variables locally or in Render:

```bash
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
PUBLIC_APP_URL=http://localhost:3000
GOOGLE_OAUTH_STATE_SECRET=replace-with-a-long-random-string
GOOGLE_CALENDAR_TIME_ZONE=America/Detroit
```

The app requests the narrow `https://www.googleapis.com/auth/calendar.events` scope so AcademicTILT can create and update calendar events without full calendar access. OAuth token exchange and event creation stay on the Node backend; do not put Google client secrets in browser code.

For this prototype, Google refresh tokens are saved in `.data/google-calendar-tokens.json`, which is ignored by Git. A production launch should move those tokens into an encrypted database tied to real server-side user accounts.

## Design Direction

Goal for the website is to be fully functional study tracker/planner designed to help students eliminate the excuses as to why they arent acheiving their academic goals. Allow students to identify their key weaknesses of their study process and eliminate them to succeed.

## Future Ideas

- Google Calendar two-way sync
- Smart study scheduling around exams and availability
- D2L / Brightspace integration
- Mobile app rebuild with React Native

## Status

This version is currently local-first and browser-based. It now includes a local-only authentication gate so students can create accounts and keep browser data separated, but those accounts are not secure server accounts yet. Do not use real passwords until a backend database and production auth provider are connected. It is designed as a strong foundation for a future full web app or mobile app with authentication, cloud sync, and calendar integrations.
I also have multiple versions saved to my computer for us to eventuallly push to github, but they all require a backend program to use the AI features in. It costs money, which we do not have yet.
In order to do so, we need a solid pitch to get accepted into the launch rogram to get funding.

## Plan

Currently we have a onboarding/account creation method. It is just not secure. We need to adjust this to create a actual usable website to go public. Once done, we can start to find a custom domain, trademark, and brand. Everything will cost money including subscriptions for the AI implementation, google calander implementation, Render hosting subscription, and of course custom domain for the Render site. I have added updated plans for the Render hosting subscription into "Discussions"

WOOHOOO MONEY SPENDING!!

## Auth0 Python SDK Setup

This repository now includes a small Flask entrypoint (`start.py`) that follows the official Auth0 Python SDK quickstart for a Regular Web Application with server-side sessions.

1. Install Python dependencies from the project root:

```bash
uv sync
```

If you are not using `uv`, install the same packages with pip:

```bash
python -m pip install "auth0-server-python>=1.0.0b1,<2" "flask[async]" python-dotenv markupsafe
```

2. Create a local `.env` file from `.env.example` and set the Auth0 values in your server environment. Keep these values server-only and do not commit `.env`.

```bash
AUTH0_DOMAIN=dev-twmic3lvibfngwhb.us.auth0.com
AUTH0_CLIENT_ID=QZwU4ABAPCw5pLh1P2USX5kLlkim9kae
AUTH0_CLIENT_SECRET=replace-with-auth0-client-secret
AUTH0_SECRET=replace-with-64-character-random-hex-string
APP_BASE_URL=https://scholarhq-1.onrender.com
PORT=443
```

Generate `AUTH0_SECRET` with:

```bash
openssl rand -hex 32
```

3. Confirm your Auth0 application URLs match the exact origin where the Python app is running:

```text
Allowed Callback URL: https://scholarhq-1.onrender.com/callback
Allowed Logout URL:   https://scholarhq-1.onrender.com/
```

4. Start the Python Auth0 app:

```bash
uv run python start.py
```

The Auth0 routes are:

- `/login` starts Universal Login.
- `/login?screen_hint=signup` starts Universal Login on the signup screen.
- `/callback` completes the Auth0 login transaction.
- `/logout` clears the SDK session and redirects through Auth0 logout.

The Flask entrypoint also serves the full ScholarHQ web app at `/` and static assets from the repository, so the Auth0 deployment shows the real site instead of a placeholder login page. When Auth0 returns a user, the server injects a small bootstrap script before `src/app.bundle.js` so the browser app opens the signed-in dashboard.
