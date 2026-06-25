import { promisePool } from "../lib/db.js";
import { uploadMultipleImages, deleteFromS3 } from "../lib/s3.js";

export const uploadPhotosToPin = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: "No photos uploaded." });
        }

        const { pinId } = req.params;

        // Use the existing multi-upload block provided in s3.js
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
                `INSERT INTO photos (pin_id, image_url) VALUES ($1, $2) RETURNING *`,
                [pinId, img.url] // Either CloudFrontUrl or s3 location based on your code
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
        // Option to pull URL from DB to extract object KEY, then delete from S3 (If desired)
        // await deleteFromS3('projects/pins/...');

        await promisePool.query(`DELETE FROM photos WHERE id = $1`, [req.params.photoId]);
        res.json({ message: "Photo deleted" });
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};