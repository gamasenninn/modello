# Modello — Development Guide

## Project
- **Name:** Modello
- **GitHub:** https://github.com/gamasenninn/modello
- **Description:** Lightweight CRUD app builder — Build apps from your data model
- **License:** MIT
- **Port:** 8888

## Tech Stack
- Backend: Node.js + better-sqlite3 (WAL mode, foreign keys ON)
- Frontend: Vanilla JavaScript (no framework)
- Auth: bcryptjs + jsonwebtoken
- Default login: admin / admin

## File Structure
- server.js — API server (auth, CRUD, schema, screens, import/export, audit)
- app.js — Frontend application logic
- index.html — Main application page
- builder.html — Drag-and-drop form builder
- login.html — Login page
- style.css — Styles
- seed.js — Sample data seeder
- package.json — Dependencies and scripts

## Development Workflow

### Issue-Driven Development
1. Issues are created on GitHub (translated to English)
2. Create branch: `issue-N/short-description`
3. Implement, commit with `Fixes #N`
4. Push branch, create PR via `gh pr create`
5. Senpai reviews and merges
6. Leave design/implementation comments on the Issue

### Git Commands
```bash
# Start work on an issue
git fetch origin && git checkout main && git pull origin main
git checkout -b issue-N/description

# Commit and push
git add .
git commit -m "Description of change (Fixes #N)"
git push -u origin issue-N/description

# Create PR
gh pr create --title "Title (Fixes #N)" --body "Summary of changes"
```

### Code Style
- Keep it simple — minimal dependencies
- Use HTML entities for icons (not emoji) to avoid rendering issues
- Parameterized queries only (SQL injection prevention)
- All user-facing text and GitHub content in English
- Comments in code can be English or Japanese

## Running
```bash
npm install
node seed.js   # Optional: seed sample data
npm start       # Starts on port 8888
```
