const express = require('express');
const session = require('express-session');
const passport = require('./config/passport');
const flash = require('connect-flash');
const path = require('path');
const db = require('./config/database');
const authRoutes = require('./routes/auth');
const dashRoutes = require('./routes/dash');
const ticketRoutes = require('./routes/ticket_routes');
const managerRoutes = require('./routes/manager_routes');

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'Kratos', 
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 // 1 hour
    }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Global Flash Messages and User
app.use((req, res, next) => {
    res.locals.error = req.flash('error')[0] || null;
    res.locals.success = req.flash('success')[0] || null;
    res.locals.user = req.user || null;
    next();
});

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Home Redirect
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        return req.user.role === 'Office Manager'
            ? res.redirect('/office_manager/manager_dashboard')
            : res.redirect('/dashboard');
    }
    res.redirect('/login');
});

// Routes
app.use('/', authRoutes);
app.use('/dashboard', dashRoutes);
app.use('/tickets', ticketRoutes);
app.use('/office_manager', managerRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).render('error', { message: 'Page not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).render('error', { message: 'Something went wrong. Please try again.' });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
