// サンプルデータ投入スクリプト
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "rakubase.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// 管理テーブル
db.exec(`CREATE TABLE IF NOT EXISTS _screens (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, table_name TEXT NOT NULL,
  definition TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
)`);

// 顧客テーブル
db.exec(`CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  address TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);

// 注文テーブル
db.exec(`CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  price REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  order_date TEXT DEFAULT (date('now')),
  note TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
)`);

// サンプル顧客データ
var customers = [
  { name: "田中太郎", email: "tanaka@example.com", phone: "03-1234-5678", company: "田中商事", address: "東京都千代田区1-1-1" },
  { name: "鈴木花子", email: "suzuki@example.com", phone: "06-9876-5432", company: "鈴木工業", address: "大阪府大阪市2-2-2" },
  { name: "佐藤一郎", email: "sato@example.com", phone: "052-111-2222", company: "佐藤電機", address: "愛知県名古屋市3-3-3" },
  { name: "高橋美咲", email: "takahashi@example.com", phone: "011-333-4444", company: "高橋物産", address: "北海道札幌市4-4-4" },
  { name: "伊藤健二", email: "ito@example.com", phone: "092-555-6666", company: "伊藤建設", address: "福岡県福岡市5-5-5" },
];

var insertCustomer = db.prepare("INSERT OR IGNORE INTO customers (name, email, phone, company, address) VALUES (?, ?, ?, ?, ?)");
customers.forEach(function(c) { insertCustomer.run(c.name, c.email, c.phone, c.company, c.address); });

// サンプル注文データ
var orders = [
  { customer_id: 1, product: "ノートPC", quantity: 2, price: 150000, status: "shipped" },
  { customer_id: 1, product: "モニター", quantity: 1, price: 45000, status: "delivered" },
  { customer_id: 2, product: "キーボード", quantity: 5, price: 8000, status: "pending" },
  { customer_id: 3, product: "サーバー", quantity: 1, price: 500000, status: "processing" },
  { customer_id: 3, product: "UPS", quantity: 2, price: 80000, status: "shipped" },
  { customer_id: 4, product: "プリンター", quantity: 3, price: 35000, status: "delivered" },
  { customer_id: 5, product: "ルーター", quantity: 10, price: 12000, status: "pending" },
];

var insertOrder = db.prepare("INSERT OR IGNORE INTO orders (customer_id, product, quantity, price, status) VALUES (?, ?, ?, ?, ?)");
orders.forEach(function(o) { insertOrder.run(o.customer_id, o.product, o.quantity, o.price, o.status); });

// 画面定義: 顧客
db.prepare("INSERT OR REPLACE INTO _screens (id, name, table_name, definition) VALUES (?, ?, ?, ?)").run(
  "screen-customers", "Customers", "customers",
  JSON.stringify({
    list: { columns: ["id", "name", "email", "company", "phone"], searchFields: ["name", "email", "company"] },
    layout: [
      { field: "name", label: "Name", type: "text", required: true },
      { field: "email", label: "Email", type: "email" },
      { field: "phone", label: "Phone", type: "text" },
      { field: "company", label: "Company", type: "text" },
      { field: "address", label: "Address", type: "text" },
      { field: "note", label: "Note", type: "textarea" },
    ],
    relations: [
      { table: "orders", foreignKey: "customer_id", title: "Orders" }
    ]
  })
);

// 画面定義: 注文
db.prepare("INSERT OR REPLACE INTO _screens (id, name, table_name, definition) VALUES (?, ?, ?, ?)").run(
  "screen-orders", "Orders", "orders",
  JSON.stringify({
    list: { columns: ["id", "customer_id", "product", "quantity", "price", "status", "order_date"] },
    layout: [
      { field: "customer_id", label: "Customer ID", type: "number", required: true },
      { field: "product", label: "Product", type: "text", required: true },
      { field: "quantity", label: "Quantity", type: "number" },
      { field: "price", label: "Price", type: "number", required: true },
      { field: "status", label: "Status", type: "select", options: ["pending", "processing", "shipped", "delivered", "cancelled"] },
      { field: "order_date", label: "Order Date", type: "date" },
      { field: "note", label: "Note", type: "textarea" },
    ],
    relations: []
  })
);

console.log("Seed data inserted successfully!");
console.log("- 5 customers");
console.log("- 7 orders");
console.log("- 2 screen definitions (customers, orders)");
db.close();
