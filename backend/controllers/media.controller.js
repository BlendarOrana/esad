import { promisePool } from "../lib/db.js";
import { uploadMultipleImages, deleteFromS3 } from "../lib/s3.js";

export const uploadPhotosToPin = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: "No photos uploaded." });
        }

        const { pinId } = req.params;

        const uploadResult = await uploadMultipleImages(
            req.files, 
            `projects/pins/${pinId}`
        );

        if (uploadResult.successful.length === 0) {
             return res.status(500).json({ error: "All photo uploads failed." });
        }

        // Generate database insert entries for all successful photos
        const dbPromises = uploadResult.successful.map(img => {
            return promisePool.query(
                // Saving the KEY instead of the full URL here
                `INSERT INTO photos (pin_id, image_url) VALUES ($1, $2) RETURNING *`,
                [pinId, img.key] 
            );
        });

        const queryResults = await Promise.all(dbPromises);
        const savedPhotos = queryResults.map(r => r.rows[0]);

        res.status(201).json({
            uploadedCount: savedPhotos.length,
            failedCount: uploadResult.totalFailed,
            photos: savedPhotos
        });

    } catch (err) {
        console.error("Photo upload err:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const deletePhoto = async (req, res) => {
    try {
        const { photoId } = req.params;

        // 1. Get the S3 key from the database first
        const photoRes = await promisePool.query(
            `SELECT image_url FROM photos WHERE id = $1`, 
            [photoId]
        );

        if (photoRes.rows.length === 0) {
            return res.status(404).json({ error: "Photo not found" });
        }

        const s3Key = photoRes.rows[0].image_url; // Assuming this holds the key now

        // 2. Delete the actual file from S3
        if (s3Key) {
            await deleteFromS3(s3Key);
        }

        // 3. Delete the record from the database
        await promisePool.query(`DELETE FROM photos WHERE id = $1`, [photoId]);
        
        res.json({ message: "Photo deleted successfully" });
    } catch (err) {
        console.error("Delete photo err:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};