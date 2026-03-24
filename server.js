const http = require("http");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const PORT = 8888;
const DB_PATH = path.join(__dirname, "modello.db");
const JWT_SECRET = "modello-secret-" + Date.now();
const TOKEN_EXPIRY = "24h";

// DB初期化
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// 管理テーブル作成
db.exec(`
  CREATE TABLE IF NOT EXISTS _screens (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    table_name TEXT NOT NULL,
    definition TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS _users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT DEFAULT 'user',
    must_change_password INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS _audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    table_name TEXT,
    record_id TEXT,
    action TEXT,
    old_data TEXT,
    new_data TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// CSVライン解析（引用符対応）
function parseCSVLine(line) {
  var result = [];
  var current = "";
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i+1] === '"') { current += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { current += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { result.push(current); current = ""; }
      else { current += c; }
    }
  }
  result.push(current);
  return result;
}

// 監査ログ記録
function auditLog(userId, username, tableName, recordId, action, oldData, newData) {
  db.prepare("INSERT INTO _audit_log (user_id, username, table_name, record_id, action, old_data, new_data) VALUES (?,?,?,?,?,?,?)")
    .run(userId, username, tableName, String(recordId || ""), action, oldData ? JSON.stringify(oldData) : null, newData ? JSON.stringify(newData) : null);
}

// 初期adminユーザー作成
var adminExists = db.prepare("SELECT id FROM _users WHERE username = 'admin'").get();
if (!adminExists) {
  var hash = bcrypt.hashSync("admin", 10);
  db.prepare("INSERT INTO _users (username, password_hash, display_name, role, must_change_password) VALUES (?, ?, ?, ?, ?)").run("admin", hash, "Administrator", "admin", 1);
  console.log("Initial admin user created (admin/admin)");
}

// === 認証関連 ===
function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function verifyToken(req) {
  // Cookieからトークン取得
  var cookies = (req.headers.cookie || "").split(";").reduce(function(acc, c) {
    var parts = c.trim().split("=");
    if (parts.length === 2) acc[parts[0]] = parts[1];
    return acc;
  }, {});
  var token = cookies.token;
  // Authorizationヘッダーからも取得
  if (!token) {
    var auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) token = auth.substring(7);
  }
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); }
  catch (e) { return null; }
}

function requireAuth(req, res) {
  var user = verifyToken(req);
  if (!user) { json(res, { error: "Unauthorized" }, 401); return null; }
  return user;
}

function requireAdmin(req, res) {
  var user = requireAuth(req, res);
  if (user && user.role !== "admin") { json(res, { error: "Admin required" }, 403); return null; }
  return user;
}

// リクエストボディ読み取り
function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on("data", function (c) { chunks.push(c); });
    req.on("end", function () {
      var body = Buffer.concat(chunks).toString("utf-8");
      if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1);
      try { resolve(JSON.parse(body)); }
      catch (e) { resolve({}); }
    });
    req.on("error", reject);
  });
}

// URLパス解析
function parsePath(pathname) {
  var parts = pathname.replace(/^\/+|\/+$/g, "").split("/");
  return parts;
}

// 静的ファイル配信
function serveStatic(res, filePath, contentType) {
  try {
    var content = fs.readFileSync(filePath, "utf-8");
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch (e) {
    res.writeHead(404);
    res.end("Not Found");
  }
}

// JSON応答
function json(res, data, status) {
  res.writeHead(status || 200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

// エラー応答
function error(res, msg, status) {
  json(res, { error: msg }, status || 400);
}

// テーブル名バリデーション（SQLインジェクション対策）
function isValidTableName(name) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !name.startsWith("_");
}

// SQLiteのカラム型をHTML input typeに変換
function sqliteTypeToFieldType(sqlType) {
  var t = (sqlType || "TEXT").toUpperCase();
  if (t.includes("INT")) return "number";
  if (t.includes("REAL") || t.includes("FLOAT") || t.includes("DOUBLE")) return "number";
  if (t.includes("DATE")) return "date";
  if (t.includes("BOOL")) return "checkbox";
  return "text";
}

// === APIルーティング ===
const server = http.createServer(async (req, res) => {
  var url = new URL(req.url, "http://localhost:" + PORT);
  var parts = parsePath(url.pathname);
  var method = req.method;

  try {
    // --- 静的ファイル ---
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return serveStatic(res, path.join(__dirname, "index.html"), "text/html; charset=utf-8");
    }
    if (url.pathname === "/login.html") {
      return serveStatic(res, path.join(__dirname, "login.html"), "text/html; charset=utf-8");
    }
    if (url.pathname === "/builder.html") {
      return serveStatic(res, path.join(__dirname, "builder.html"), "text/html; charset=utf-8");
    }
    if (url.pathname === "/app.js") {
      return serveStatic(res, path.join(__dirname, "app.js"), "application/javascript; charset=utf-8");
    }
    if (url.pathname === "/style.css") {
      return serveStatic(res, path.join(__dirname, "style.css"), "text/css; charset=utf-8");
    }

    // --- Auth API ---
    if (parts[0] === "api" && parts[1] === "auth") {
      // POST /api/auth/login
      if (parts[2] === "login" && method === "POST") {
        var body = await readBody(req);
        if (!body.username || !body.password) return error(res, "Username and password required");
        var user = db.prepare("SELECT * FROM _users WHERE username = ?").get(body.username);
        if (!user || !bcrypt.compareSync(body.password, user.password_hash)) {
          return error(res, "Invalid credentials", 401);
        }
        var token = generateToken(user);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": "token=" + token + "; Path=/; HttpOnly; Max-Age=86400"
        });
        res.end(JSON.stringify({ ok: true, token: token, user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role, must_change_password: user.must_change_password } }));
        return;
      }

      // POST /api/auth/logout
      if (parts[2] === "logout" && method === "POST") {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": "token=; Path=/; HttpOnly; Max-Age=0"
        });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // GET /api/auth/me
      if (parts[2] === "me" && method === "GET") {
        var user = verifyToken(req);
        if (!user) return json(res, { authenticated: false });
        var dbUser = db.prepare("SELECT id, username, display_name, role, must_change_password FROM _users WHERE id = ?").get(user.id);
        return json(res, { authenticated: true, user: dbUser });
      }

      // POST /api/auth/change-password
      if (parts[2] === "change-password" && method === "POST") {
        var user = requireAuth(req, res);
        if (!user) return;
        var body = await readBody(req);
        if (!body.newPassword || body.newPassword.length < 4) return error(res, "Password must be at least 4 characters");
        var hash = bcrypt.hashSync(body.newPassword, 10);
        db.prepare("UPDATE _users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(hash, user.id);
        return json(res, { ok: true });
      }
    }

    // --- 認証チェック（以降の全APIエンドポイント）---
    var currentUser = verifyToken(req);
    if (!currentUser && parts[0] === "api") {
      return json(res, { error: "Unauthorized" }, 401);
    }

    // --- Schema API: /api/tables ---
    if (parts[0] === "api" && parts[1] === "tables") {
      var tableName = parts[2];

      // GET /api/tables — テーブル一覧
      if (!tableName && method === "GET") {
        var tables = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name != 'sqlite_sequence' ORDER BY name"
        ).all();
        return json(res, tables.map(function (t) {
          var info = db.prepare("PRAGMA table_info(" + t.name + ")").all();
          var count = db.prepare("SELECT COUNT(*) as count FROM [" + t.name + "]").get();
          return { name: t.name, columns: info.length, rows: count.count };
        }));
      }

      // POST /api/tables — テーブル作成（admin only）
      if (!tableName && method === "POST") {
        if (!currentUser || currentUser.role !== "admin") return error(res, "Admin required", 403);
        var body = await readBody(req);
        if (!body.name || !isValidTableName(body.name)) return error(res, "Invalid table name");
        if (!body.columns || !Array.isArray(body.columns) || body.columns.length === 0) return error(res, "Columns required");

        var cols = body.columns.map(function (c) {
          var def = '"' + c.name + '" ' + (c.type || "TEXT");
          if (c.primary) def += " PRIMARY KEY AUTOINCREMENT";
          if (c.required) def += " NOT NULL";
          if (c.default !== undefined) def += " DEFAULT " + JSON.stringify(c.default);
          return def;
        });
        var sql = 'CREATE TABLE IF NOT EXISTS "' + body.name + '" (' + cols.join(", ") + ")";
        db.exec(sql);
        return json(res, { ok: true, table: body.name });
      }

      // GET /api/tables/:name/schema
      if (tableName && parts[3] === "schema" && method === "GET") {
        var info = db.prepare("PRAGMA table_info([" + tableName + "])").all();
        if (info.length === 0) return error(res, "Table not found", 404);
        var fks = db.prepare("PRAGMA foreign_key_list([" + tableName + "])").all();
        return json(res, { name: tableName, columns: info, foreignKeys: fks });
      }

      // POST /api/tables/:name/columns — カラム追加 (admin only)
      if (tableName && parts[3] === "columns" && method === "POST") {
        if (!currentUser || currentUser.role !== "admin") return error(res, "Admin required", 403);
        var body = await readBody(req);
        if (!body.name) return error(res, "Column name required");
        var colType = body.type || "TEXT";
        try {
          db.exec('ALTER TABLE "' + tableName + '" ADD COLUMN "' + body.name + '" ' + colType);
          return json(res, { ok: true, column: body.name, type: colType });
        } catch (e) {
          return error(res, e.message, 400);
        }
      }

      // DELETE /api/tables/:name (admin only)
      if (tableName && !parts[3] && method === "DELETE") {
        if (!currentUser || currentUser.role !== "admin") return error(res, "Admin required", 403);
        if (!isValidTableName(tableName)) return error(res, "Invalid table name");
        db.exec('DROP TABLE IF EXISTS "' + tableName + '"');
        return json(res, { ok: true, dropped: tableName });
      }
    }

    // --- CRUD API: /api/data/:table[/:id] ---
    if (parts[0] === "api" && parts[1] === "data" && parts[2]) {
      var table = parts[2];
      var recordId = parts[3];

      // テーブル存在チェック
      var tableExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table);
      if (!tableExists) return error(res, "Table not found: " + table, 404);

      // テーブル情報取得
      var columns = db.prepare("PRAGMA table_info([" + table + "])").all();
      var pkCol = columns.find(function (c) { return c.pk > 0; });
      var pkName = pkCol ? pkCol.name : "rowid";

      // GET /api/data/:table — 一覧取得
      if (!recordId && method === "GET") {
        var page = parseInt(url.searchParams.get("page")) || 1;
        var limit = Math.min(parseInt(url.searchParams.get("limit")) || 50, 500);
        var offset = (page - 1) * limit;
        var sort = url.searchParams.get("sort") || pkName;
        var order = (url.searchParams.get("order") || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
        var search = url.searchParams.get("search") || "";

        // ソートカラムチェック
        var validCol = columns.find(function (c) { return c.name === sort; });
        if (!validCol && sort !== "rowid") sort = pkName;

        var whereClauses = [];
        var whereParams = [];
        if (search) {
          var textCols = columns.filter(function (c) { return !c.type || c.type.toUpperCase().includes("TEXT") || c.type.toUpperCase().includes("CHAR"); });
          if (textCols.length > 0) {
            whereClauses.push("(" + textCols.map(function (c) { return '"' + c.name + '" LIKE ?'; }).join(" OR ") + ")");
            textCols.forEach(function () { whereParams.push("%" + search + "%"); });
          }
        }

        // フィルター: ?filter_colname=value
        columns.forEach(function (c) {
          var filterVal = url.searchParams.get("filter_" + c.name);
          if (filterVal !== null) {
            whereClauses.push('"' + c.name + '" = ?');
            whereParams.push(filterVal);
          }
        });

        var whereSQL = whereClauses.length > 0 ? " WHERE " + whereClauses.join(" AND ") : "";
        var countResult = db.prepare("SELECT COUNT(*) as total FROM [" + table + "]" + whereSQL).get(whereParams);
        var rows = db.prepare(
          "SELECT * FROM [" + table + "]" + whereSQL + ' ORDER BY "' + sort + '" ' + order + " LIMIT ? OFFSET ?"
        ).all([...whereParams, limit, offset]);

        return json(res, {
          data: rows,
          pagination: { page: page, limit: limit, total: countResult.total, pages: Math.ceil(countResult.total / limit) }
        });
      }

      // GET /api/data/:table/:id — 1件取得
      if (recordId && method === "GET") {
        var row = db.prepare("SELECT * FROM [" + table + '] WHERE "' + pkName + '" = ?').get(recordId);
        if (!row) return error(res, "Record not found", 404);
        return json(res, row);
      }

      // POST /api/data/:table — 新規作成
      if (!recordId && method === "POST") {
        var body = await readBody(req);
        var keys = Object.keys(body).filter(function (k) { return columns.some(function (c) { return c.name === k; }); });
        if (keys.length === 0) return error(res, "No valid fields");

        var placeholders = keys.map(function () { return "?"; });
        var values = keys.map(function (k) { return body[k]; });
        var result = db.prepare(
          "INSERT INTO [" + table + '] ("' + keys.join('","') + '") VALUES (' + placeholders.join(",") + ")"
        ).run(values);

        if (currentUser) auditLog(currentUser.id, currentUser.username, table, result.lastInsertRowid, "INSERT", null, body);
        return json(res, { ok: true, id: result.lastInsertRowid, changes: result.changes }, 201);
      }

      // PUT /api/data/:table/:id — 更新
      if (recordId && method === "PUT") {
        var oldRecord = db.prepare("SELECT * FROM [" + table + '] WHERE "' + pkName + '" = ?').get(recordId);
        var body = await readBody(req);
        var keys = Object.keys(body).filter(function (k) { return columns.some(function (c) { return c.name === k; }) && k !== pkName; });
        if (keys.length === 0) return error(res, "No valid fields");

        var sets = keys.map(function (k) { return '"' + k + '" = ?'; });
        var values = keys.map(function (k) { return body[k]; });
        values.push(recordId);
        var result = db.prepare(
          "UPDATE [" + table + "] SET " + sets.join(", ") + ' WHERE "' + pkName + '" = ?'
        ).run(values);

        if (currentUser) auditLog(currentUser.id, currentUser.username, table, recordId, "UPDATE", oldRecord, body);
        return json(res, { ok: true, changes: result.changes });
      }

      // DELETE /api/data/:table/:id — 削除
      if (recordId && method === "DELETE") {
        var oldRecord = db.prepare("SELECT * FROM [" + table + '] WHERE "' + pkName + '" = ?').get(recordId);
        var result = db.prepare("DELETE FROM [" + table + '] WHERE "' + pkName + '" = ?').run(recordId);
        if (currentUser) auditLog(currentUser.id, currentUser.username, table, recordId, "DELETE", oldRecord, null);
        return json(res, { ok: true, changes: result.changes });
      }
    }

    // --- Screen API: /api/screens ---
    if (parts[0] === "api" && parts[1] === "screens") {
      var screenId = parts[2];

      // GET /api/screens — 一覧
      if (!screenId && method === "GET") {
        var screens = db.prepare("SELECT id, name, table_name, created_at, updated_at FROM _screens ORDER BY name").all();
        return json(res, screens);
      }

      // POST /api/screens — 作成
      if (!screenId && method === "POST") {
        var body = await readBody(req);
        if (!body.name || !body.table_name) return error(res, "name and table_name required");
        var id = Date.now() + "-" + Math.random().toString(36).substring(2, 8);
        db.prepare(
          "INSERT INTO _screens (id, name, table_name, definition) VALUES (?, ?, ?, ?)"
        ).run(id, body.name, body.table_name, JSON.stringify(body.definition || {}));
        return json(res, { ok: true, id: id }, 201);
      }

      // GET /api/screens/:id
      if (screenId && method === "GET") {
        var screen = db.prepare("SELECT * FROM _screens WHERE id = ?").get(screenId);
        if (!screen) return error(res, "Screen not found", 404);
        screen.definition = JSON.parse(screen.definition);
        return json(res, screen);
      }

      // PUT /api/screens/:id
      if (screenId && method === "PUT") {
        var body = await readBody(req);
        var updates = [];
        var params = [];
        if (body.name) { updates.push("name = ?"); params.push(body.name); }
        if (body.table_name) { updates.push("table_name = ?"); params.push(body.table_name); }
        if (body.definition) { updates.push("definition = ?"); params.push(JSON.stringify(body.definition)); }
        updates.push("updated_at = datetime('now')");
        params.push(screenId);
        db.prepare("UPDATE _screens SET " + updates.join(", ") + " WHERE id = ?").run(params);

        // layoutにあるがDBカラムにないフィールドを自動追加（ALTER TABLE）
        if (body.definition && body.definition.layout) {
          var screenRow = db.prepare("SELECT table_name FROM _screens WHERE id = ?").get(screenId);
          if (screenRow) {
            var existingCols = db.prepare("PRAGMA table_info([" + screenRow.table_name + "])").all().map(function(c) { return c.name; });
            body.definition.layout.forEach(function(fieldDef) {
              if (existingCols.indexOf(fieldDef.field) < 0) {
                var sqlType = "TEXT";
                if (fieldDef.type === "number") sqlType = "REAL";
                else if (fieldDef.type === "checkbox") sqlType = "INTEGER";
                try {
                  db.exec('ALTER TABLE "' + screenRow.table_name + '" ADD COLUMN "' + fieldDef.field + '" ' + sqlType);
                } catch (e) { /* column may already exist */ }
              }
            });
          }
        }

        return json(res, { ok: true });
      }

      // DELETE /api/screens/:id
      if (screenId && method === "DELETE") {
        db.prepare("DELETE FROM _screens WHERE id = ?").run(screenId);
        return json(res, { ok: true });
      }
    }

    // --- Auto-generate screen definition ---
    if (parts[0] === "api" && parts[1] === "generate-screen" && parts[2] && method === "POST") {
      if (!currentUser || currentUser.role !== "admin") return error(res, "Admin required", 403);
      var table = parts[2];
      var tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!tableExists) return error(res, "Table not found", 404);

      var columns = db.prepare("PRAGMA table_info([" + table + "])").all();
      var fks = db.prepare("PRAGMA foreign_key_list([" + table + "])").all();

      var listCols = columns.map(function(c) { return c.name; });
      var layout = columns.filter(function(c) { return !c.pk; }).map(function(c) {
        var fieldType = sqliteTypeToFieldType(c.type);
        // FK detection -> lookup
        var fk = fks.find(function(f) { return f.from === c.name; });
        if (fk) fieldType = "number"; // keep as number for now, lookup handled by relations
        var label = c.name.replace(/_/g, " ").replace(/\b\w/g, function(l) { return l.toUpperCase(); });
        var field = { field: c.name, label: label, type: fieldType };
        if (c.notnull) field.required = true;
        return field;
      });

      var relations = [];
      // Find child tables that reference this table
      var allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name != 'sqlite_sequence'").all();
      allTables.forEach(function(t) {
        var childFks = db.prepare("PRAGMA foreign_key_list([" + t.name + "])").all();
        childFks.forEach(function(fk) {
          if (fk.table === table) {
            relations.push({ table: t.name, foreignKey: fk.from, title: t.name.replace(/_/g, " ").replace(/\b\w/g, function(l) { return l.toUpperCase(); }) });
          }
        });
      });

      // relationsは候補として返すが、定義には含めない（ユーザー選択式）
      var definition = { list: { columns: listCols }, layout: layout, relations: [], scripts: {} };

      // Save screen
      var id = "screen-" + table + "-" + Date.now();
      db.prepare("INSERT INTO _screens (id, name, table_name, definition) VALUES (?, ?, ?, ?)").run(id, table, table, JSON.stringify(definition));

      return json(res, { ok: true, id: id, definition: definition, relationCandidates: relations });
    }

    // --- Export API ---
    if (parts[0] === "api" && parts[1] === "export" && parts[2]) {
      var table = parts[2];
      var format = parts[3] || "csv"; // csv or json
      var tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!tableExists) return error(res, "Table not found", 404);

      var rows = db.prepare("SELECT * FROM [" + table + "]").all();

      if (format === "json") {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"" + table + ".json\""
        });
        return res.end(JSON.stringify(rows, null, 2));
      }

      // CSV
      if (rows.length === 0) {
        var cols = db.prepare("PRAGMA table_info([" + table + "])").all();
        var header = cols.map(function(c) { return c.name; }).join(",");
        res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"" + table + ".csv\"" });
        return res.end(header + "\n");
      }
      var keys = Object.keys(rows[0]);
      var csv = keys.join(",") + "\n";
      rows.forEach(function(row) {
        csv += keys.map(function(k) {
          var v = row[k];
          if (v === null) return "";
          v = String(v);
          if (v.includes(",") || v.includes('"') || v.includes("\n")) return '"' + v.replace(/"/g, '""') + '"';
          return v;
        }).join(",") + "\n";
      });
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"" + table + ".csv\"" });
      return res.end(csv);
    }

    // --- Import API ---
    if (parts[0] === "api" && parts[1] === "import" && parts[2] && method === "POST") {
      var table = parts[2];
      var tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!tableExists) return error(res, "Table not found", 404);
      var columns = db.prepare("PRAGMA table_info([" + table + "])").all();
      var body = await readBody(req);

      // body.data = array of objects, body.format = "csv" or "json"
      var records = body.data || [];
      if (body.csv) {
        // Parse CSV string
        var lines = body.csv.split("\n").filter(function(l) { return l.trim(); });
        if (lines.length < 2) return error(res, "CSV must have header + at least 1 row");
        var headers = lines[0].split(",").map(function(h) { return h.trim().replace(/^"|"$/g, ""); });
        records = [];
        for (var i = 1; i < lines.length; i++) {
          var vals = parseCSVLine(lines[i]);
          var obj = {};
          headers.forEach(function(h, j) { obj[h] = vals[j] || ""; });
          records.push(obj);
        }
      }

      var inserted = 0;
      var errors = [];
      var validCols = columns.map(function(c) { return c.name; });

      var insertMany = db.transaction(function(recs) {
        recs.forEach(function(rec, idx) {
          try {
            var keys = Object.keys(rec).filter(function(k) { return validCols.includes(k); });
            if (keys.length === 0) { errors.push({ row: idx + 1, error: "No valid columns" }); return; }
            var placeholders = keys.map(function() { return "?"; });
            var values = keys.map(function(k) { return rec[k]; });
            db.prepare("INSERT INTO [" + table + '] ("' + keys.join('","') + '") VALUES (' + placeholders.join(",") + ")").run(values);
            inserted++;
          } catch (e) {
            errors.push({ row: idx + 1, error: e.message });
          }
        });
      });
      insertMany(records);

      return json(res, { ok: true, inserted: inserted, errors: errors, total: records.length });
    }

    // --- Audit Log API ---
    if (parts[0] === "api" && parts[1] === "audit") {
      if (method === "GET") {
        var page = parseInt(url.searchParams.get("page")) || 1;
        var limit = Math.min(parseInt(url.searchParams.get("limit")) || 50, 200);
        var offset = (page - 1) * limit;
        var where = [];
        var params = [];
        var filterTable = url.searchParams.get("table");
        var filterUser = url.searchParams.get("user_id");
        var filterAction = url.searchParams.get("action");
        if (filterTable) { where.push("table_name = ?"); params.push(filterTable); }
        if (filterUser) { where.push("user_id = ?"); params.push(filterUser); }
        if (filterAction) { where.push("action = ?"); params.push(filterAction); }
        var whereSQL = where.length > 0 ? " WHERE " + where.join(" AND ") : "";
        var total = db.prepare("SELECT COUNT(*) as c FROM _audit_log" + whereSQL).get(params).c;
        var logs = db.prepare("SELECT * FROM _audit_log" + whereSQL + " ORDER BY created_at DESC LIMIT ? OFFSET ?").all([...params, limit, offset]);
        return json(res, { data: logs, pagination: { page: page, limit: limit, total: total, pages: Math.ceil(total / limit) } });
      }
    }

    // 404
    res.writeHead(404);
    res.end("Not Found");
  } catch (e) {
    console.error(e);
    error(res, e.message, 500);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Modello running at http://0.0.0.0:" + PORT);
});
