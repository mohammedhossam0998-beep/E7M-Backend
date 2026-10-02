const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {

    // Make sure user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    // Check user's role
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You don't have permission"
      });
    }

    next();
  };
};

module.exports = {
  authorizeRoles
};
