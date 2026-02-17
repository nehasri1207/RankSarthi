const express = require('express');
const path = require('path');
const compression = require('compression');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;

// Persistent Session with SQLite
app.use(session({
    store: new SQLiteStore({ db: 'sessions.db', dir: './database' }),
    secret: 'ranksaarthi-simple-secret',
    resave: false,
    saveUninitialized: false, // Better for compliance
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true in production
        maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week
    }
}));

// Basic Middleware
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database initialization
const db = require('./database/db');

// Routes
const indexRoutes = require('./routes/index');
const calculatorRoutes = require('./routes/calculator');
const resultRoutes = require('./routes/result');
const adminRoutes = require('./routes/admin');

app.use('/', indexRoutes);
app.use('/calculator', calculatorRoutes);
app.use('/result', resultRoutes);
app.use('/admin', adminRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).render('404', { title: 'Page Not Found' });
});

app.listen(PORT, () => {
    console.log(`RankSaarthi Server running on http://localhost:${PORT}`);
});
