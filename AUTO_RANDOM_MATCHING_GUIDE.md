# Auto Random Matching — JDBC Battle Arena

## Included
- Random pairings for every active student in one selected section (default BSIT-2A)
- Preview before writing to database; Shuffle Again; explicit confirmation
- 5 questions and 30 seconds per question by default; optional topic and difficulty filters
- No student repeated within a generated batch; an odd student count leaves one unmatched
- Each battle gets its own randomized questions; all generated matches start in Waiting
- Existing manual matching, student management, question bank, reports, rematches, and scheduled matches are preserved

## Installation (existing working project)
1. Stop Node with Ctrl+C.
2. Back up your working project folder and export `jdbc_arena` via phpMyAdmin.
3. Extract this ZIP. Copy ONLY `server.js`, `public/index.html`, `public/app.js`, and `public/style.css` into your existing project, replacing those four files.
4. Keep your existing `.env`, `package.json`, `package-lock.json`, `db.js`, and MySQL database.
5. **No database migration is required.** This builds on the already installed Battle Management Upgrade schema.
6. Run `npm start`; open `http://localhost:3000`; press Ctrl+F5.
7. Instructor > Matches > Auto Random Matching > BSIT-2A > 5 questions > 30 seconds > Preview Random Pairings.
8. Review the pairings, use Shuffle Again if desired, then click Create All Matches (Confirm). Confirm the browser prompt.
9. Open Matches / Battle History. Each created match is Waiting; click Start for the relevant match when students are ready.

## Behavior and limitations
- Only **active** student accounts in the selected section are eligible.
- The section name must match the student account's section exactly (e.g., BSIT-2A).
- Pairings are random each time; this is not a tournament bracket and does not guarantee that pairs will never repeat across separate batches.
- Preview expires after 15 minutes. Changing settings invalidates the on-screen preview.
- Confirming creates all matches in a **single MySQL transaction**. If an error occurs, the transaction rolls back; check Matches before retrying if a network error occurs.
- The batch is intended for instructor-led classroom use, not simultaneous automatic starts. The instructor manually starts each match.
- If a section has an odd number of active students, one student remains unmatched and can be paired separately using Manual Matching.
- Question selection is random separately for each match, from currently active questions matching the selected filters.
- No new npm dependencies or database tables are needed.
- If student roster changes between preview and confirmation, the server refuses confirmation and asks for a fresh preview.

## Testing checklist
- [ ] Original manual matching still works
- [ ] BSIT-2A active student count is correct
- [ ] Preview generates unique pairs
- [ ] Shuffle Again changes pairings (may occasionally repeat by chance)
- [ ] Confirm creates all matches as Waiting
- [ ] Generated battles have 5 questions and 30-second timers
- [ ] Odd class size leaves one unmatched student
- [ ] Student login, real-time battle, leaderboard, reports still work
