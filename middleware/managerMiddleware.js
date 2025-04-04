function ensureManager(req, res, next) {
    if (req.isAuthenticated()) {
        if (!req.user.is_active) {
            req.flash('error', 'Your account has been deactivated.');
            return req.logout(err => {
                if (err) console.error('Error logging out:', err);
                return res.redirect('/login');
            });
        } else if (req.user.role === 'Office Manager') {
            return next();
        } else {
            req.flash('error', 'Unauthorized Access: Managers only.');
            return res.redirect('/login');
        }
    }

    req.flash('error', 'Unauthorized Access: Managers only.');
    return res.redirect('/login');
};


module.exports = {ensureManager};