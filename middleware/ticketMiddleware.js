function ensureHelpdeskOperator(req, res, next) {
    if (req.session?.user?.role === 'Helpdesk Operator') {
        return next();
    }

    return res.render('error', {
        errorMessage: 'Unauthorized: Helpdesk Operator Only'
    });
}

function ensureAuthenticated(req, res, next) {
    if (req.session?.user) return next();
    return res.redirect('/login');
}

function ensureITTechnician(req, res, next) {
    if (req.session?.user?.role === 'IT Technician') {
        return next();
    }

    return res.render('error', {
        errorMessage: 'Unauthorized: IT Technician Only'
    });
}


module.exports = { ensureHelpdeskOperator, ensureAuthenticated, ensureITTechnician };
