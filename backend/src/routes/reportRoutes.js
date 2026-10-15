const router = require('express').Router();
const reportController = require('../controllers/reportController');
const auth = require('../middleware/authMiddleware');

router.use(auth);
router.get('/attendance', reportController.attendanceReport);
router.get('/salary', reportController.salaryReport);

module.exports = router;
