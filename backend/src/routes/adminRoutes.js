const router = require('express').Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const validate = require('../middleware/validationMiddleware');
const Joi = require('joi');
const { createAdminSchema, updateAdminSchema } = require('../validators/adminValidator');

router.use(auth);
router.use(requireRole('super_admin'));

router.get('/', adminController.list);
router.post('/', validate(createAdminSchema), adminController.create);
router.put('/:id', validate(updateAdminSchema), adminController.update);

const setPasswordSchema = Joi.object({ password: Joi.string().min(8).required() });
router.post('/:id/reset-link', adminController.createResetLink);
router.post('/:id/set-password', validate(setPasswordSchema), adminController.setPassword);
router.post('/:id/reset-2fa', adminController.resetTwoFactor);

module.exports = router;
