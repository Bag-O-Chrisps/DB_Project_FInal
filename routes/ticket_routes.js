const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureHelpdeskOperator, ensureAuthenticated, ensureITTechnician } = require('../middleware/ticketMiddleware');
const pool = require('../config/database')


// Render New Ticket Page
router.get('/new', ensureHelpdeskOperator, async (req, res) => {
    try {
        const offices = await db.query(`SELECT office_id, office_name FROM offices`);
        res.render('new_ticket', {
            offices: offices.rows,
            error: null,
            activePage: 'new_ticket',
            user: req.session.user
        });
    } catch (err) {
        console.error("Error loading new ticket page:", err);
        res.render('new_ticket', {
            offices: [],
            error: "Failed to load data.",
            activePage: 'new_ticket',
            user: req.session.user
        });
    }
});

// Fetch Technicians 
router.get('/getTechnicians', ensureHelpdeskOperator, async (req, res) => {
    const { category } = req.query;
    const helpdeskOfficeId = req.session.user.office_id;
    if (!category) return res.status(400).json({ error: "Category is required." });

    try {
        const technicians = await pool.query(`SELECT e.employee_id, e.first_name, e.last_name, e.ticket_count
            FROM employees e
            INNER JOIN technician_specializations ts ON e.employee_id = ts.employee_id
            WHERE ts.specialization = $1
            AND e.role = 'IT Technician'
            AND e.is_active = TRUE
            AND e.office_id = $2
            ORDER BY e.ticket_count ASC, e.first_name ASC
            LIMIT 5;`, [category, helpdeskOfficeId]);
   

        if (technicians.rows.length === 0) {
            return res.json([{ employee_id: null, first_name: "No", last_name: "Technicians Available" }]);
        }
        res.json(technicians.rows);
    } catch (err) {
        console.error("Error fetching technicians:", err);
        res.status(500).json({ error: "Failed to fetch technicians." });
    }
});


// Create Ticket
router.post('/new', ensureHelpdeskOperator, async (req, res) => {
    const {
        issue_description,
        priority,
        category,
        equipment_name,
        purchase_date,
        warranty_expiry,
        office_id,
        assigned_technician_id,
        caller_id
    } = req.body;

    const createdBy = req.session.user.employee_id;
    const helpdeskOfficeId = req.session.user.office_id;
    const currentDate = new Date().toISOString().split('T')[0];
    // Validate Required Fields
    try {
        // Validate caller_id (must be exactly 4 digits)
        if (!/^\d{4}$/.test(caller_id.trim())) {
            const offices = await db.query('SELECT office_id, office_name FROM offices');
            return res.render('new_ticket', {
                error: "Invalid caller ID. It should be exactly 4 digits.",
                offices: offices.rows,
                activePage: 'new_ticket',
                user: req.session.user
            });
        }

        // Validate purchase_date 
        if (purchase_date > currentDate) {
            const offices = await db.query('SELECT office_id, office_name FROM offices');
            return res.render('new_ticket', {
                error: "Purchase date cannot be in the future.",
                offices: offices.rows,
                activePage: 'new_ticket',
                user: req.session.user
            });
        }

        // Check for missing required fields
        if (!category || !equipment_name || !issue_description || !assigned_technician_id || !office_id) {
            const offices = await db.query('SELECT office_id, office_name FROM offices');
            return res.render('new_ticket', {
                error: "All fields are required. Please fill in all fields.",
                offices: offices.rows,
                activePage: 'new_ticket',
                user: req.session.user
            });
        }

        // Insert Equipment
        const equipmentInsert = await db.query(`
            INSERT INTO equipment (equipment_name, equipment_type, purchase_date, warranty_expiry, office_id)
            VALUES ($1, $2, $3, $4, $5) RETURNING equipment_id;
        `, [equipment_name, category, purchase_date, warranty_expiry, office_id]);

        const equipment_id = equipmentInsert.rows[0].equipment_id;

        // Check if Technician is Available and Valid
        const techCheck = await db.query(`
            SELECT e.employee_id FROM employees e
            INNER JOIN technician_specializations ts ON e.employee_id = ts.employee_id
            WHERE e.employee_id = $1
            AND ts.specialization = $2
            AND e.is_active = TRUE
            AND e.office_id = $3;
        `, [assigned_technician_id, category, helpdeskOfficeId]);

        if (techCheck.rows.length === 0) {
            const offices = await db.query('SELECT office_id, office_name FROM offices');
            return res.render('new_ticket', {
                error: "Invalid or unavailable technician for the selected category.",
                offices: offices.rows,
                activePage: 'new_ticket',
                user: req.session.user
            });
        }

        // Create Ticket
        await db.query(`
            INSERT INTO helpdesk_tickets 
            (assigned_technician_id, created_by, caller_id, equipment_id, equipment_name, issue_description, status, priority, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, 'Open', $7, NOW());
        `, [assigned_technician_id, createdBy, caller_id, equipment_id, equipment_name, issue_description, priority]);

        // Increment the ticket_count of the assigned technician
        await db.query(`
            UPDATE employees 
            SET ticket_count = ticket_count + 1
            WHERE employee_id = $1;
        `, [assigned_technician_id]);

        // Redirect to Tickets
        res.redirect('/tickets');
    } catch (err) {
        console.error('Ticket creation error:', err);
        const offices = await db.query('SELECT office_id, office_name FROM offices');
        res.render('new_ticket', {
            error: "Failed to create the ticket. Please try again.",
            offices: offices.rows,
            activePage: 'new_ticket',
            user: req.session.user
        });
    }
});


router.get('/', ensureAuthenticated, async (req, res) => {
    const searchQuery = req.query.search ? req.query.search.trim() : "";
    const statusFilter = req.query.status || "";
    const priorityFilter = req.query.priority || "";
    const userRole = req.session.user.role;
    const userId = req.session.user.employee_id; // Get logged-in user's ID

    try {
        console.log("Fetching tickets..."); //used to test if tickets are fetched

        const offices = await db.query(`SELECT office_id, office_name FROM offices`);
        console.log("Fetched Offices:", JSON.stringify(offices.rows, null, 2));

        let query = `
            SELECT 
                t.ticket_id, 
                t.caller_id,  
                t.issue_description, 
                t.status, 
                t.priority, 
                t.resolution_notes, 
                t.created_at,
                t.resolved_at,
                e.equipment_name,
                e.purchase_date,
                e.warranty_expiry,
                o.office_name,
                COALESCE(emp.first_name || ' ' || emp.last_name, 'Unassigned') AS technician_name,
                t.assigned_technician_id
            FROM helpdesk_tickets t
            LEFT JOIN equipment e ON t.equipment_id = e.equipment_id
            LEFT JOIN offices o ON e.office_id = o.office_id
            LEFT JOIN employees emp ON t.assigned_technician_id = emp.employee_id
        `;

        let queryParams = [];
        let conditions = [];

        // If the user is an IT Technician, only show their assigned tickets
        if (userRole === 'IT Technician') {
            conditions.push(`t.assigned_technician_id = $${queryParams.length + 1}`);
            queryParams.push(userId);
        }

        // If there is a search query, split it into keywords and search in issue_description
        if (searchQuery) {
            const keywords = searchQuery.split(/\s+/);
            keywords.forEach((keyword, index) => {
                if (index === 0) {
                    conditions.push(`(t.issue_description ILIKE $${queryParams.length + 1})`);
                } else {
                    conditions.push(`OR t.issue_description ILIKE $${queryParams.length + 1}`);
                }
                queryParams.push(`%${keyword}%`);
            });
        }

        // Filter by status 
        if (statusFilter) {
            conditions.push(`t.status = $${queryParams.length + 1}`);
            queryParams.push(statusFilter);
        }

        // Filter by priority 
        if (priorityFilter) {
            conditions.push(`t.priority = $${queryParams.length + 1}`);
            queryParams.push(priorityFilter);
        }

        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(" ");
        }

        query += ` ORDER BY t.created_at DESC`;

        console.log("Executing Query:", query);
        console.log("Query Params:", queryParams);

        const tickets = await db.query(query, queryParams);

        console.log("Fetched Tickets:", JSON.stringify(tickets.rows, null, 2));

        res.render('ticket', {
            tickets: tickets.rows,
            offices: offices.rows,
            user: req.session.user,
            userRole,
            activePage: 'tickets',
            searchQuery,
            filters: { status: statusFilter, priority: priorityFilter }
        });

    } catch (err) {
        console.error('Failed to load tickets:', err);

        res.render('ticket', {
            tickets: [],
            offices: [],
            user: req.session.user,
            activePage: 'tickets',
            searchQuery,
            filters: { status: statusFilter, priority: priorityFilter },
            error: 'Failed to load tickets.'
        });
    }
});



// Delete ticket route
router.post('/delete/:ticketId', ensureHelpdeskOperator, async (req, res) => {
    try {
        const ticketId = req.params.ticketId;
        const userId = req.session.user.employee_id;

        console.log(`Delete request received for ticket ID: ${ticketId} by User ID: ${userId}`);

        // Check if the ticket exists
        const ticketQuery = await db.query('SELECT * FROM helpdesk_tickets WHERE ticket_id = $1', [ticketId]);
        if (ticketQuery.rows.length === 0) {
            console.error(`Error: Ticket ID ${ticketId} not found.`);
            return res.status(404).render('error', {
                errorMessage: 'Ticket not found.'
            });
        }
        const ticket = ticketQuery.rows[0];
        console.log(`Ticket found:`, ticket);

        // Check if the user is authorized to delete
        if (ticket.created_by !== userId) {
            console.error(`Unauthorized delete attempt by User ID: ${userId}`);
            return res.status(403).render('error', {
                errorMessage: 'You are not authorized to delete this ticket.'
            });
        }

        // Decrement the technician's ticket count
        await db.query(`
            UPDATE employees 
            SET ticket_count = ticket_count - 1
            WHERE employee_id = $1 AND ticket_count > 0;
        `, [ticket.assigned_technician_id]);
        console.log(`Technician ID ${ticket.assigned_technician_id}: Ticket count decremented.`);

        // Delete the ticket FIRST
        await db.query('DELETE FROM helpdesk_tickets WHERE ticket_id = $1', [ticketId]);
        console.log(`Ticket ID ${ticketId} successfully deleted.`);

        // Now delete the associated equipment
        await db.query('DELETE FROM equipment WHERE equipment_id = $1', [ticket.equipment_id]);
        console.log(`Equipment ID ${ticket.equipment_id} successfully deleted.`);

        res.redirect('/tickets');
    } catch (err) {
        console.error('Error deleting ticket:', err);
        res.status(500).render('error', {
            errorMessage: 'An error occurred while deleting the ticket.'
        });
    }
});



//Edit Ticket Route
router.get('/edit/:id', ensureITTechnician, async (req, res) => {
    try {
        const ticketId = req.params.id;
        const ticket = await db.query(
            `SELECT ticket_id, issue_description, status, resolution_notes 
             FROM helpdesk_tickets WHERE ticket_id = $1`,
            [ticketId]
        );

        if (ticket.rows.length === 0) {
            return res.status(404).send('Ticket not found');
        }

        res.render('edit_ticket', {
            ticket: ticket.rows[0],
            user: req.session.user,
            activePage: 'ticket s'
        });
    } catch (err) {
        console.error("Error loading edit ticket page:", err);
        res.status(500).send("Internal Server Error");
    }
});

//Update Ticket Route
router.post('/update/:id', ensureITTechnician, async (req, res) => {
    try {
        const ticketId = req.params.id;
        const { status, resolution_notes } = req.body;

        console.log(`Received update for ticket ${ticketId}: status = ${status}, resolution_notes = ${resolution_notes}`);

        // Ensure status is being changed to closed
        if (status === 'Closed') {
            const currentTimestamp = new Date(); // Current timestamp for resolved_at field

            console.log('Updating ticket as Closed...');

            // Update the ticket's status, resolution_notes, and resolved_at date
            await pool.query(
                'UPDATE helpdesk_tickets SET status = $1, resolution_notes = $2, resolved_at = $3 WHERE ticket_id = $4',
                [status, resolution_notes, currentTimestamp, ticketId]
            );

            // Ensure the technician's ticket count is decremented when closing the ticket
            console.log('Decrementing technician ticket count...');
            await pool.query(
                'UPDATE employees SET ticket_count = ticket_count - 1 WHERE employee_id = (SELECT assigned_technician_id FROM helpdesk_tickets WHERE ticket_id = $1)',
                [ticketId]
            );
        } else {
            // If not closing the ticket, just update the status and resolution notes
            console.log('Updating ticket with new status and resolution notes...');
            await pool.query(
                'UPDATE helpdesk_tickets SET status = $1, resolution_notes = $2 WHERE ticket_id = $3',
                [status, resolution_notes, ticketId]
            );
        }

        console.log(`Ticket ${ticketId} updated successfully`);
        res.redirect('/tickets');
    } catch (err) {
        console.error('Error updating ticket:', err);
        res.status(500).send(`Internal Server Error: ${err.message}`);
    }
});






module.exports = router;
