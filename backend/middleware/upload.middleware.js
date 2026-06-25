import multer from "multer";

// We store files in server RAM briefly, so they can be sent straight to S3 without hitting local hard drive
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // limit to 15MB 
});

// ==========================================
// 1. Your original specific fields setup 
// ==========================================
export const imageUploadMiddleware = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'imagemobile', maxCount: 1 }
]);

// ==========================================
// 2. Floor Plan / Map Middleware (Controller uses req.file)
// Expected field in frontend form data: 'map_image'
// ==========================================
export const mapUploadMiddleware = upload.single("map_image");

// ==========================================
// 3. Multiple Photos for Snags/Pins Middleware (Controller uses req.files)
// Expected field in frontend form data: 'photos' (Upload up to 5 at once)
// ==========================================
export const pinPhotosUploadMiddleware = upload.array("photos", 5);