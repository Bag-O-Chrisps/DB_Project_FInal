
function ensureAuthenticated(req, res, next){
    if (req.session && req.session.user) {
        return next();
    }
    req.flash('error', 'Please log in first.');
    res.redirect('/login');
};


function checkActiveUser(req, res, next) {
    if (req.isAuthenticated()) {
        if (!req.user.is_active) {
            req.logout(err => {
                if (err) {
                    console.error('Error logging out:', err);
                    return res.status(500).send('Error logging out. Please try again.');
                }
                req.flash('error', 'Your account has been deactivated.');
                return res.redirect('/login');
            });
        } else {
            return next(); 
        }
    } else {
        next(); 
    }
}

module.exports = { ensureAuthenticated, checkActiveUser };
