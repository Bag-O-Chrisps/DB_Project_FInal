const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureAuthenticated } = require('../middleware/authMiddleware');

router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const employeeId = req.session?.user?.employee_id;
        const userRole = req.session?.user?.role;
        const officeId = req.session?.user?.office_id;

        if (!employeeId) return res.redirect('/login');

        let ticketStats = { open_tickets: 0 };
        let assignedTickets = [];

        if (userRole === 'Helpdesk Operator') {
            // Helpdesk Operator sees open tickets in their office
            const officeTicketsQuery = `
                SELECT COUNT(*) AS open_tickets
                FROM helpdesk_tickets t
                JOIN employees e ON t.assigned_technician_id = e.employee_id
                WHERE e.office_id = $1 AND t.status = 'Open';
            `;
            const officeTickets = await db.query(officeTicketsQuery, [officeId]);
            ticketStats = officeTickets.rows[0] || { open_tickets: 0 };

            // Tickets assigned by this Helpdesk Operator
            const assignedQuery = `
                SELECT t.ticket_id, t.issue_description, t.status, t.priority, 
                       e.first_name || ' ' || e.last_name AS technician_name
                FROM helpdesk_tickets t
                JOIN employees e ON t.assigned_technician_id = e.employee_id
                WHERE t.created_by = $1;
            `;
            const assignedResults = await db.query(assignedQuery, [employeeId]);
            assignedTickets = assignedResults.rows;
        } 
        else if (userRole === 'IT Technician') {
            // IT Technician sees only their own tickets
            const assignedQuery = `
                SELECT ticket_id, issue_description, status, priority
                FROM helpdesk_tickets
                WHERE assigned_technician_id = $1;
            `;
            const assignedResults = await db.query(assignedQuery, [employeeId]);
            assignedTickets = assignedResults.rows;
        }

        res.render('dashboard', {
            ticketStats,
            assignedTickets,
            employeeInfo: req.session.user,
            user: req.session.user,
            activePage: 'dashboard'
        });

    } catch (err) {
        console.error('Error loading dashboard:', err);
        res.status(500).send('Something went wrong.');
    }
});


module.exports = router;
