const router = require('express').Router();
const analyticsController = require('../controllers/analyticsController');
const auth = require('../middleware/authMiddleware');

router.use(auth);
router.get('/overview', analyticsController.overview);
router.get('/best-performers', analyticsController.bestPerformers);
router.get('/needs-attention', analyticsController.needsAttention);

module.exports = router;
