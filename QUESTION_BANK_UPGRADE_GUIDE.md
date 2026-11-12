# JDBC Battle Arena — Question Bank Upgrade

## IMPORTANT: Upgrade your working project, do not replace your database
1. Stop Node server (Ctrl+C). Back up the entire existing project directory, including your .env and package-lock.json, and export jdbc_arena from phpMyAdmin.
2. This ZIP contains upgraded source code, not your local database or .env. Copy **server.js**, **public/index.html**, **public/app.js**, **public/style.css** and **package.json** from this ZIP over the corresponding files in your existing project. Keep your existing .env and all existing MySQL data.
3. In phpMyAdmin, select jdbc_arena, click SQL, and run the contents of `sql/upgrade_question_bank.sql` ONCE. If difficulty already exists, do not run it again.
4. In VS Code terminal run `npm install`, then `npm audit`, then `npm start`. Do NOT rerun `npm run seed` just to apply this upgrade.
5. Login as INSTRUCTOR and open Questions. Confirm 20 existing questions, all Medium difficulty. Add a question, edit a newly created unused question, disable and enable a question, search/filter, and import `sql/questions_sample.csv`.
6. Create a new battle and confirm that active questions are selected randomly and both devices receive the same question. Historical battles should remain visible.

## CSV headers
`topic,question,option_a,option_b,option_c,option_d,correct_answer,difficulty`

Difficulty must be `Easy`, `Medium`, or `Hard`. Correct answer must be A/B/C/D. Use standard CSV quoting for commas or newlines inside fields. Maximum 200 questions per upload, 500 KB file limit.

## Historical match protection
Questions already referenced by any match cannot be edited in place. Disable the old question and create a revised one, so prior match references remain meaningful. The app does not hard-delete questions.

## Troubleshooting
- `Unknown column difficulty`: run the migration once in jdbc_arena.
- `Duplicate column name difficulty`: migration was already applied; do not run it again.
- `Not enough active questions`: enable more questions or lower match question count.
- After changes to JS, hard-refresh the browser (Ctrl+F5).
- Preserve the existing .env with a 32+ character SESSION_SECRET.
- Existing ongoing matches are cancelled on server restart by the original design. Complete or cancel them before upgrading.
