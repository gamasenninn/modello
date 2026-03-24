# Modello

Lightweight CRUD app builder — Build apps from your data model.

Modello lets you create database tables, design forms with a drag-and-drop builder, and instantly get a working CRUD application. Think of it as a modern, web-based alternative to MS Access.

## Features

- **Table Management** — Create and manage SQLite tables via browser UI
- **Auto-generated CRUD** — GET/POST/PUT/DELETE APIs for any table
- **Form Builder** — Drag-and-drop visual form editor
- **Screen Definitions** — JSON-based screen configuration with multiple views per table
- **Parent-Child Relations** — Define and display related records (e.g., Customer → Orders)
- **Search & Pagination** — Real-time search, column sorting, pagination
- **User Authentication** — JWT-based auth with admin/user roles
- **Audit Log** — Track all data changes (who, when, what)
- **CSV/JSON Import/Export** — Bulk data operations
- **App Creation Wizard** — Step-by-step flow: name → table → form design → done

## Quick Start

```bash
# Install dependencies
npm install

# Seed sample data (optional)
node seed.js

# Start server
npm start
```

Open http://localhost:8888 in your browser.

**Default login:** admin / admin (you'll be prompted to change the password on first login)

## Tech Stack

- **Backend:** Node.js + [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **Frontend:** Vanilla JavaScript (no framework)
- **Database:** SQLite (WAL mode)
- **Auth:** bcryptjs + jsonwebtoken

## Project Structure

```
├── server.js      # API server (auth, CRUD, schema, screens, import/export, audit)
├── index.html     # Main application page
├── app.js         # Frontend application logic
├── style.css      # Styles
├── builder.html   # Drag-and-drop form builder
├── login.html     # Login page
├── seed.js        # Sample data seeder (customers + orders)
└── package.json
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Current user info |
| GET | /api/tables | List tables |
| POST | /api/tables | Create table |
| GET | /api/tables/:name/schema | Table schema |
| GET | /api/data/:table | List records (search, sort, pagination) |
| POST | /api/data/:table | Create record |
| PUT | /api/data/:table/:id | Update record |
| DELETE | /api/data/:table/:id | Delete record |
| GET | /api/screens | List screen definitions |
| POST | /api/screens | Create screen definition |
| PUT | /api/screens/:id | Update screen definition |
| POST | /api/generate-screen/:table | Auto-generate screen from schema |
| GET | /api/export/:table/csv | Export as CSV |
| GET | /api/export/:table/json | Export as JSON |
| POST | /api/import/:table | Import data |
| GET | /api/audit | Audit log |

## License

MIT
