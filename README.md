# onlineQuizz

Lightweight real-time quiz web app (Node.js + Express + Socket.IO + vanilla JS).

## Run

```bash
npm install
npm start
```

Server listens on `0.0.0.0:3000` and prints local network links.

## Pages

- `/admin`
- `/team`
- `/leaderboard`
- `/qr` (QR code that links to the team page)

## Excel format

Upload `.xls` file on admin page with these columns:

- `type`
- `questionText`
- `options`
- `correctAnswers`
- `mediaURL`

Semicolon (`;`) separated values are supported for multi-value fields.

## QR Join

Open `/qr` to display a QR code that points to the team page (`/team`).
If you visit `/qr?teamId=<TEAM_ID>` (or `/qr?tid=<TEAM_ID>`), the Team page will
auto-store that identity in `localStorage` and reconnect without re-registering.
