# JDBC Battle Arena — Student Accounts Upgrade

## Backup first
Back up the entire working project and export the `jdbc_arena` database using phpMyAdmin. Stop Node with Ctrl+C.

## Installation
Copy `server.js`, `public/index.html`, `public/app.js`, and `public/style.css` from this package into your existing **Question Bank upgraded** project, replacing only those files. Keep your existing `.env`, `package.json`, `package-lock.json`, `db.js`, and database. **No SQL migration is required.** Restart with `npm start` and hard-refresh the browser (Ctrl+F5).

## CSV import
Create a UTF-8 CSV with columns `student_id,full_name,section` (see `sql/students_sample.csv`). Max 100 records per import. Use the Instructor → Student Accounts → Bulk Import control. The server validates rows and rejects repeated IDs within the CSV. Existing student IDs are skipped (not overwritten). New student accounts receive random 20-character temporary passwords, and users must change passwords on first login.

A CSV containing **only newly created accounts** and their one-time passwords is downloaded after a successful import. Treat this as confidential: save it privately, distribute credentials individually, and delete it when no longer needed. There is no existing-password export (passwords are stored as hashes).

## Other features
Search by student ID or name, filter by section and status, deactivate/reactivate accounts, and reset temporary passwords individually. Existing match history is retained.

## Test checklist
1. Confirm original student accounts still exist.
2. Import sample CSV, verify created count and credential download.
3. Import same CSV again; all should be skipped, with no new passwords generated.
4. Log in as one imported student and change temporary password.
5. Search/filter and deactivate/reactivate a test student.
6. Create a match with imported accounts and confirm multiplayer behavior.

## Notes
Use this only on a trusted LAN; the current app uses HTTP, so credentials are not encrypted in transit. Avoid sending temporary passwords in group chats. A dedicated TLS setup is recommended for broader/untrusted networks. If your project differs from the Question Bank upgrade, do not overwrite your customized files without merging changes.
