# onlineQuizz

Lightweight real-time quiz web app (Node.js + Express + Socket.IO + vanilla JS).

## Run

```bash
npm install
npm start
```

Server listens on `0.0.0.0:3000` and prints local network links.

## Multiple quiz sessions

One server can host **many independent quizzes** at the same time. Each session has its own questions, teams, scores, and timer.

1. Open `/admin` and log in (default password: `admin`, or set `ADMIN_PASSWORD`).
2. Click **New session** — you are taken to that session’s admin panel.
3. Share session-specific links (team page, leaderboard, QR) with participants.

Session URLs use the path prefix `/s/<sessionId>/`:

- `/s/<sessionId>/admin` — host controls
- `/s/<sessionId>/team` — team play
- `/s/<sessionId>/leaderboard` — public scoreboard
- `/s/<sessionId>/results` — final results (with `?teamId=`)

Legacy `/team` and `/leaderboard` redirect to the session list at `/admin`.

Session data is stored under `data/sessions/<sessionId>.json`. An older single-quiz `data/session.json` is migrated to `data/sessions/default.json` on first use.

## Pages

- `/admin` — session list (create / open / delete sessions)
- `/s/<sessionId>/admin` — quiz control for one session
- `/s/<sessionId>/team` — team play
- `/s/<sessionId>/leaderboard` — leaderboard
- `/qr` — redirects to session admin QR (use `?session=<sessionId>`)

## Excel / CSV format

Upload a `.xls` / `.xlsx` / `.csv` file on the admin page with these columns:

- `type`
- `questionText`
- `options`
- `correctAnswers`
- `mediaURL`

Semicolon (`;`) separated values are supported for multi-value fields.

For CSV, the first row must be the header with the column names exactly as above.

## QR Join

On the session admin page, click **Team join QR** to open a popup with a QR code for `/s/<sessionId>/team`.
Optional `?teamId=<TEAM_ID>` (or `tid`) encodes that team id in the link so the Team page can reconnect without re-registering.
