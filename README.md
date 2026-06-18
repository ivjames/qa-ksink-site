# QA KSink Site

Target application for the QA Kitchen Sink demo.

This repo contains the system under test.

Initial stack:

- Frontend: React + Vite + TypeScript
- Backend: FastAPI + SQLite
- QA bot: separate repo, ivjames/qa-ksink-bot

## Local backend

Run from the backend folder:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Local frontend

Run from the frontend folder:

```bash
npm install
npm run dev
```
