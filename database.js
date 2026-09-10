const mysql = require('mysql2/promise');

// const pool = mysql.createPool({
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0
// });

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'srv1790.hstgr.io',
  user: process.env.DB_USER || 'u846110844_atfalna',
  password: process.env.DB_PASSWORD || 'E@:Tw5&A7c',
  database: process.env.DB_NAME || 'u846110844_atfalna',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;