const express = require('express');
const bcrypt = require('bcrypt');
const passport = require('passport');
const pool = require('../config/database');
const router = express.Router();

const allowedRoles = ['Helpdesk Operator', 'IT Technician', 'Office Manager'];
const allowedSpecializations = ['Office Hardware', 'Network Hardware', 'Software'];

// GET Register Page
router.get('/register', async (req, res) => {
    const officeResults = await pool.query('SELECT office_id, office_name FROM offices');
    res.render('register', {
        offices: officeResults.rows,
        allowedRoles,
        allowedSpecializations,
        error: null
    });
});

// GET Login Page
router.get('/login', (req, res) => {
    res.render('login', { error: req.flash('error')[0] || null });
});

// POST Login (Relies on passport config)
router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) return next(err);
        if (!user) return res.render('login', { error: info?.message || 'Invalid email or password.' });

        req.logIn(user, (err) => {
            if (err) return next(err);

            req.session.user = {
                employee_id: user.employee_id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role,
                specialization: user.specialization,
                contact_number: user.contact_number,
                office_id: user.office_id,
                office_name: user.office_name,
                start_date: user.start_date
            };

            return user.role === 'Office Manager'
                ? res.redirect('/office_manager/manager_dashboard')
                : res.redirect('/dashboard');
        });
    })(req, res, next);
});

// POST Register
router.post('/register', async (req, res) => {
    const { first_name, last_name, email, password, role, specialization, contact_number, office_id } = req.body;
    try {
        if (!first_name || !last_name || !email || !password || !role || !contact_number || !office_id) {
            throw new Error('All fields are required.');
        }

        if (!/^\d{10}$/.test(contact_number.trim())) {
            throw new Error('Contact number must be exactly 10 digits.');
        }

        if (role === 'IT Technician' && (!specialization || !allowedSpecializations.includes(specialization))) {
            throw new Error('Specialization is required for IT Technicians.');
        }

        const duplicateCheck = await pool.query(
            `SELECT email, contact_number FROM employees 
             WHERE LOWER(email) = LOWER($1) OR contact_number = $2`,
            [email.trim(), contact_number.trim()]
        );

        if (duplicateCheck.rows.length > 0) {
            const duplicate = duplicateCheck.rows[0];
            if (duplicate.email.toLowerCase() === email.trim().toLowerCase()) {
                throw new Error('Email already registered.');
            } else if (duplicate.contact_number === contact_number.trim()) {
                throw new Error('Contact number already registered.');
            }
        }

        const hashedPassword = await bcrypt.hash(password.trim(), 10);
        const result = await pool.query(
            `INSERT INTO employees 
             (first_name, last_name, email, password, role, contact_number, office_id, start_date, is_active) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, TRUE) RETURNING employee_id`,
            [first_name.trim(), last_name.trim(), email.trim(), hashedPassword, role.trim(), contact_number.trim(), office_id]
        );

        if (role === 'IT Technician' && specialization) {
            await pool.query(
                `INSERT INTO technician_specializations (employee_id, specialization, office_id)
                 VALUES ($1, $2, $3)`,
                [result.rows[0].employee_id, specialization, office_id]
            );
        }

        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');

    } catch (err) {
        console.error("Registration Error:", err.message);
        const officeResults = await pool.query('SELECT office_id, office_name FROM offices');
        res.render('register', {
            offices: officeResults.rows,
            allowedRoles,
            allowedSpecializations,
            error: err.message
        });
    }
});

// POST Fire Employee Route (Manager Only)
router.post('/office_manager/fire-employee/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const employee = await pool.query(`
            SELECT employee_id FROM employees 
            WHERE employee_id = $1
            AND office_id = $2
            AND role IN ('Helpdesk Operator', 'IT Technician')
        `, [id, req.user?.office_id]);

        if (employee.rows.length === 0) {
            req.flash('error', 'Employee not found or unauthorized.');
            return res.redirect('/office_manager/users');
        }

        await pool.query(`UPDATE employees SET is_active = FALSE WHERE employee_id = $1;`, [id]);

        if (req.session.user && req.session.user.employee_id == id) {
            req.logout((err) => {
                if (err) return next(err);
                req.session.destroy(() => res.redirect('/login'));
            });
        } else {
            req.flash('success', 'Employee has been successfully fired.');
            res.redirect('/office_manager/users');
        }

    } catch (err) {
        console.error('Error firing employee:', err);
        req.flash('error', 'Failed to fire employee.');
        res.redirect('/office_manager/users');
    }
});

// GET Logout
router.get('/logout', (req, res, next) => {
    req.logout(err => {
        if (err) return next(err);
        req.session.destroy(() => res.redirect('/login'));
    });
});

module.exports = router;
