# JDBC Battle Arena — Battle Management Upgrade

Built on the Student Account Management + Question Bank release.

## What is new
- Topic and difficulty filters when creating a battle.
- Optional scheduled start time; the instructor still clicks **Start** at or after the scheduled time (no automatic scheduler).
- Server-driven 3-second countdown before question 1.
- One-click rematch of a finished/cancelled battle, using fresh random questions and the same players/settings.
- Match history with topic, difficulty, schedule and status.

## Installation
1. Stop Node server with Ctrl+C. Back up your working project folder AND export `jdbc_arena` in phpMyAdmin.
2. Copy only `server.js`, `public/index.html`, `public/app.js`, and `public/style.css` from this ZIP over the existing project. **Do not replace `.env`, `package.json`, or your database.**
3. In phpMyAdmin, select `jdbc_arena`, open SQL and run `sql/upgrade_battle_management.sql` **once**. The migration adds 3 columns to `matches` without deleting any data.
4. Run `npm start`; refresh the browser using Ctrl+F5.
5. In Matches, select players, question count, seconds, topic/difficulty and optional local scheduled start.

## Tests
- Existing matches, student accounts, questions and reports remain intact.
- All topics + Mixed produces a random match.
- Topic + Hard selects only active Hard questions for that topic; if insufficient, creation is rejected.
- Schedule a match 5 minutes ahead: Start should be rejected until the time. After time, instructor manually starts.
- Both student devices see the 3-second countdown and first question.
- Finish a match; click Rematch; a new waiting match appears with the same players/settings and newly randomized questions.
- Check match history and reports.

## Notes
- The countdown is initiated by the server; it is not a separate SQL status.
- Active matches are cancelled on server restart, as in the existing version.
- Scheduled times are interpreted in the server computer's local time zone. Keep the instructor laptop clock accurate.
- If you need automatic scheduled start or tournament brackets, those require a later upgrade.
