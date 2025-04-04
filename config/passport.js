const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const pool = require('./database');

// Local Strategy
passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
        const result = await pool.query(`
            SELECT e.*, o.office_name, COALESCE(t.specialization, 'None') AS specialization
            FROM employees e
            JOIN offices o ON e.office_id = o.office_id
            LEFT JOIN technician_specializations t ON e.employee_id = t.employee_id
            WHERE LOWER(e.email) = LOWER($1) AND e.is_active = TRUE;
        `, [email.trim()]);

        if (result.rows.length === 0) {
            return done(null, false, { message: 'Invalid email or password.' });
        }

        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return done(null, false, { message: 'Invalid email or password.' });
        }

        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

// Serialize user (store employee_id in session)
passport.serializeUser((user, done) => {
    done(null, user.employee_id);
});

// Deserialize user (fetch full user object from DB)
passport.deserializeUser(async (id, done) => {
    try {
        const result = await pool.query(`
            SELECT e.*, o.office_name, COALESCE(t.specialization, 'None') AS specialization
            FROM employees e
            JOIN offices o ON e.office_id = o.office_id
            LEFT JOIN technician_specializations t ON e.employee_id = t.employee_id
            WHERE e.employee_id = $1 AND e.is_active = TRUE;
        `, [id]);

        if (result.rows.length === 0) {
            return done(null, false); // User not found or inactive
        }

        done(null, result.rows[0]);
    } catch (err) {
        done(err);
    }
});

module.exports = passport;
