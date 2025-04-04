-- Offices Table
CREATE TABLE offices (
    office_id SERIAL PRIMARY KEY,
    office_name VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    specialization VARCHAR(100) NOT NULL, 
    contact_phone VARCHAR(10) NOT NULL
);
-- Employees Table
CREATE TABLE employees (
    employee_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    contact_number VARCHAR(10) NOT NULL,
    office_id INT REFERENCES offices(office_id),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT employees_role_check CHECK (
        role IN ('Helpdesk Operator', 'IT Technician', 'Office Manager')
    )
);

-- Technician Specializations Table
CREATE TABLE technician_specializations (
    specialization_id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(employee_id) ON DELETE CASCADE,
    specialization VARCHAR(100) NOT NULL,
    office_id INT REFERENCES offices(office_id),
    CONSTRAINT specialization_check CHECK (
        specialization IN ('Office Hardware', 'Network Hardware', 'Software')
    )
);

-- Equipment Table
CREATE TABLE equipment (
    equipment_id SERIAL PRIMARY KEY,
    equipment_name VARCHAR(100) NOT NULL,  
    equipment_type VARCHAR(50) NOT NULL,   
    purchase_date DATE NULL,               
    warranty_expiry DATE NULL,             
    office_id INT REFERENCES offices(office_id),
    CONSTRAINT equipment_type_check CHECK (
        equipment_type IN ('Office Hardware', 'Network Hardware', 'Software')
    )
);

-- Helpdesk Tickets Table
CREATE TABLE helpdesk_tickets (
    ticket_id SERIAL PRIMARY KEY,
    assigned_technician_id INT REFERENCES employees(employee_id),
    created_by INT REFERENCES employees(employee_id), 
    caller_id VARCHAR(4) NOT NULL,
    equipment_id INT REFERENCES equipment(equipment_id),
    equipment_name VARCHAR(100) NOT NULL,
    issue_description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Open',
    priority VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tickets_status_check CHECK (
        status IN ('Open', 'In Progress', 'Closed')
    ),
    CONSTRAINT tickets_priority_check CHECK (
        priority IN ('Low', 'Medium', 'High')
    )
);
