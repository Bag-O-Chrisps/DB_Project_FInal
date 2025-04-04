const { Pool } = require('pg');
require('dotenv').config();

// Database connection details
const pool = new Pool({
    user: process.env.DB_USER,      
    host: 'localhost',             
    database: process.env.DB_NAME,  
    password: process.env.DB_PASS,  
    port: 5432                     
});

module.exports = pool;
