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

## Excel format

Upload `.xls` file on admin page with these columns:

- `type`
- `questionText`
- `options`
- `correctAnswers`
- `mediaURL`

Semicolon (`;`) separated values are supported for multi-value fields.
