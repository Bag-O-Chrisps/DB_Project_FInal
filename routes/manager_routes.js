const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureManager } = require('../middleware/managerMiddleware');

router.get('/manager_dashboard', ensureManager, async (req, res) => {
    const { location } = req.query;

    try {
        // Fetch list of locations
        const locationsResult = await db.query(`SELECT office_id, office_name FROM offices ORDER BY office_name ASC;`);
        const locations = locationsResult.rows;

        // SQL query to fetch dashboard statistics
        const query = `
            SELECT 
                COALESCE(COUNT(t.ticket_id), 0) AS total_calls,
                COALESCE(SUM(CASE WHEN t.status = 'Open' THEN 1 ELSE 0 END), 0) AS open_cases,
                COALESCE(SUM(CASE WHEN t.status = 'Closed' THEN 1 ELSE 0 END), 0) AS closed_cases,
                COALESCE(SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END), 0) AS in_progress_cases,
                COALESCE(ROUND(SUM(
                    CASE 
                        WHEN t.status = 'Closed' AND t.resolved_at IS NOT NULL 
                            THEN EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600
                        WHEN t.resolved_at IS NULL 
                            THEN EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 3600
                        ELSE 0
                    END
                )::numeric, 2), 0) AS total_hours_spent
            FROM offices o
            LEFT JOIN employees e ON o.office_id = e.office_id
            LEFT JOIN helpdesk_tickets t ON e.employee_id = t.assigned_technician_id
            WHERE ($1::int IS NULL OR o.office_id = $1);
        `;

        const params = location ? [location] : [null];
        const statsResult = await db.query(query, params);
        const stats = statsResult.rows[0] || {};

        res.render('office_manager/manager_dashboard', {
            stats,
            locations,
            selectedLocation: location || '',
            activePage: 'manager_dashboard'
        });
    } catch (err) {
        console.error('Error loading dashboard data:', err);
        res.render('office_manager/manager_dashboard', {
            error: 'Failed to load dashboard data.',
            stats: {},
            locations: [],
            selectedLocation: '',
            activePage: 'manager_dashboard'
        });
    }
});

// Users Page
router.get('/users', ensureManager, async (req, res) => {
    try {
        if (!req.user || !req.user.office_id) {
            throw new Error('User session error: Office ID not found.');
        }

        const usersResult = await db.query(`
            SELECT 
                e.employee_id,
                CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
                e.role,
                e.is_active,
                COUNT(t.ticket_id) AS assigned_tickets
            FROM employees e
            LEFT JOIN helpdesk_tickets t ON e.employee_id = t.assigned_technician_id
            WHERE e.role IN ('Helpdesk Operator', 'IT Technician')
            AND e.office_id = $1
            GROUP BY e.employee_id
            ORDER BY e.first_name;
        `, [req.user.office_id]);

        res.render('office_manager/users', { users: usersResult.rows, activePage: 'users' });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.render('office_manager/users', { users: [], error: 'Failed to load users.', activePage: 'users' });
    }
});

// Fire Employee
router.post('/fire-employee/:id', ensureManager, async (req, res) => {
    const { id } = req.params;
    try {
        if (!req.user || !req.user.office_id) {
            throw new Error('Unauthorized access: Office ID not found.');
        }

        const checkResult = await db.query(`
            SELECT employee_id FROM employees
            WHERE employee_id = $1 AND office_id = $2
            AND role IN ('Helpdesk Operator', 'IT Technician');
        `, [id, req.user.office_id]);

        if (checkResult.rows.length === 0) {
            req.flash('error', 'Unauthorized or employee not found.');
            return res.redirect('/office_manager/users');
        }

        await db.query(`UPDATE employees SET is_active = FALSE WHERE employee_id = $1;`, [id]);
        req.flash('success', 'Employee successfully fired.');
        res.redirect('/office_manager/users');
    } catch (err) {
        console.error('Error firing employee:', err);
        req.flash('error', 'Failed to fire employee.');
        res.redirect('/office_manager/users');
    }
});

// Reports Page
router.get('/reports', ensureManager, async (req, res) => {
    try {
        if (!req.user || !req.user.office_id) {
            throw new Error('User session error: Office ID not found.');
        }

        const monthlySummary = await db.query(`
            SELECT 
                DATE_TRUNC('month', t.created_at) AS month,
                COUNT(t.ticket_id) AS total_calls,
                SUM(CASE WHEN t.status = 'Open' THEN 1 ELSE 0 END) AS open_cases,
                SUM(CASE WHEN t.status = 'Closed' THEN 1 ELSE 0 END) AS closed_cases,
                ROUND(SUM(
                    CASE
                        WHEN t.resolved_at IS NOT NULL 
                            THEN EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600
                        ELSE EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 3600
                    END
                )::numeric, 2) AS total_hours_spent
            FROM helpdesk_tickets t
            JOIN employees e ON t.assigned_technician_id = e.employee_id
            JOIN offices o ON e.office_id = o.office_id 
            WHERE e.office_id = $1  
            GROUP BY month
            ORDER BY month DESC;
        `, [req.user.office_id]);

        const technicianSummary = await db.query(`
            SELECT 
                e.first_name || ' ' || e.last_name AS technician_name,
                COUNT(t.ticket_id) AS total_jobs,
                SUM(CASE WHEN t.status = 'Open' THEN 1 ELSE 0 END) AS open_cases,
                SUM(CASE WHEN t.status = 'Closed' THEN 1 ELSE 0 END) AS closed_cases,
                ROUND(SUM(
                    CASE 
                        WHEN t.resolved_at IS NOT NULL 
                            THEN EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600
                        ELSE EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 3600
                    END
                )::numeric, 2) AS total_hours_spent
            FROM employees e
            JOIN offices o ON e.office_id = o.office_id  
            LEFT JOIN helpdesk_tickets t ON e.employee_id = t.assigned_technician_id
            WHERE e.role = 'IT Technician' AND o.office_id = $1
            GROUP BY e.employee_id
            ORDER BY total_jobs DESC;
        `, [req.user.office_id]);

        const officeSummary = await db.query(`
            SELECT 
                o.office_name,
                SUM(CASE WHEN eq.equipment_type = 'Office Hardware' THEN 1 ELSE 0 END) AS hardware_faults,
                SUM(CASE WHEN eq.equipment_type = 'Software' THEN 1 ELSE 0 END) AS software_faults,
                ROUND(SUM(
                    CASE 
                        WHEN t.resolved_at IS NOT NULL 
                            THEN EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600
                        ELSE EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 3600
                    END
                )::numeric, 2) AS total_hours_spent,
                COUNT(DISTINCT t.assigned_technician_id) AS unique_technicians
            FROM offices o
            LEFT JOIN equipment eq ON o.office_id = eq.office_id
            LEFT JOIN helpdesk_tickets t ON eq.equipment_id = t.equipment_id
            WHERE o.office_id = $1
            GROUP BY o.office_name;
        `, [req.user.office_id]);

        res.render('office_manager/reports', {
            monthlySummary: monthlySummary.rows,
            technicianSummary: technicianSummary.rows,
            officeSummary: officeSummary.rows,
            activePage: 'reports'
        });
    } catch (err) {
        console.error('Error loading reports:', err);
        res.render('office_manager/reports', {
            monthlySummary: [],
            technicianSummary: [],
            officeSummary: [],
            error: 'Failed to load reports.',
            activePage: 'reports'
        });
    }
});

module.exports = router;

