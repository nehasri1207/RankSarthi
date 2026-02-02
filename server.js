const express = require('express');
const path = require('path');
const compression = require('compression');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Simplified Session
app.use(session({
    secret: 'ranksaarthi-simple-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
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
