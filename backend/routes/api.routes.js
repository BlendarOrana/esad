import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import { mapUploadMiddleware,pinPhotosUploadMiddleware } from '../middleware/upload.middleware.js';

// Controller imports
import * as authCtrl from '../controllers/auth.controller.js';
import * as projectCtrl from '../controllers/project.controller.js';
import * as mapCtrl from '../controllers/map.controller.js';
import * as pinCtrl from '../controllers/pin.controller.js';
import * as mediaCtrl from '../controllers/media.controller.js';
import * as shareCtrl from '../controllers/share.controller.js';
import * as clientController from '../controllers/clientController.js'

const router = express.Router();

// ============ AUTH ============ 
router.post('/auth/login', authCtrl.login);
router.post('/auth/logout', protectRoute, authCtrl.logout);
router.get('/auth/me', protectRoute, authCtrl.getMe);

// ============ SHARE & REPORTS (UNPROTECTED) ============ 
router.get('/share/:token/client-view', shareCtrl.getClientView);

// ALL FOLLOWING ROUTES EXPECT JWT:

// ============ PROJECTS ============ 
router.get('/projects', projectCtrl.getProjects);
router.post('/projects', projectCtrl.createProject);
router.put('/projects/:id', projectCtrl.updateProject);
router.delete('/projects/:id', projectCtrl.deleteProject);

// ============ MAPS / FLOORS ============ 
router.get('/projects/:projectId/maps', mapCtrl.getMaps);
// Accepts one file using field-name 'mapFile' for UPLOAD method
router.post('/projects/:projectId/maps', mapUploadMiddleware, mapCtrl.createMap); 
router.put('/maps/:mapId', mapCtrl.updateMapCanvas); // Drag+drop line adjustment
router.delete('/maps/:mapId', mapCtrl.deleteMap);

// ============ PINS & ISSUES ============ 
router.get('/maps/:mapId/pins', pinCtrl.getMapPins);
router.post('/maps/:mapId/pins', pinPhotosUploadMiddleware, pinCtrl.createPin);
router.put('/pins/:pinId', pinCtrl.updatePin);
router.delete('/pins/:pinId', pinCtrl.deletePin);

// ============ MEDIA ============ 
// Array limit 5 files named "photos" 
router.post('/pins/:pinId/photos', pinPhotosUploadMiddleware, mediaCtrl.uploadPhotosToPin);
router.delete('/photos/:photoId', mediaCtrl.deletePhoto);

// ============ CLIENT REPORTS / SHARING ============ 
router.get('/client/:projectId/magic-link', clientController.getMagicLinkToken);
router.get('/client/:projectId/pdf', clientController.generateReportPdf);
router.get('/client/:projectId/word', clientController.generateReportWord);

export default router;