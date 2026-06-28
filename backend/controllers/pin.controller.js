import { promisePool } from "../lib/db.js";
import { uploadMultipleImages } from "../lib/s3.js"; // Import your S3 helper

const CDN_BASE_URL = process.env.CDN_BASE_URL || "https://d17jmyxe0gxyz3.cloudfront.net";

// photos[].image_url may be a legacy full URL or a raw S3 key — handle both
const resolveImageUrl = (value) => {
    if (!value) return null;
    if (value.startsWith("http://") || value.startsWith("https://")) {
        return value;
    }
    return `${CDN_BASE_URL}/${value}`;
};

export const createPin = async (req, res) => {
    try {
        const { mapId } = req.params;

        // 1. Check if req.body exists (Multer puts it there)
        if (!req.body) {
            return res.status(400).json({ error: "No data received. Check middleware." });
        }

        const { x_coordinate, y_coordinate, severity, status, text_note } = req.body;

        // 2. FormData sends numbers as strings. Convert them back to Floats.
        const x = x_coordinate !== undefined ? parseFloat(x_coordinate) : 0;
        const y = y_coordinate !== undefined ? parseFloat(y_coordinate) : 0;

        // 3. Insert the Pin
        const result = await promisePool.query(
            `INSERT INTO pins (map_id, x_coordinate, y_coordinate, severity, status, text_note)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [mapId, x, y, severity || 'MINOR', status || 'OPEN', text_note]
        );

        const newPin = result.rows[0];

        // 4. HANDLE PHOTOS (For Offline Sync bundles)
        // If the sync process sent files in this same request
        if (req.files && req.files.length > 0) {
            const uploadResult = await uploadMultipleImages(
                req.files, 
                `projects/pins/${newPin.id}`
            );

            if (uploadResult.successful.length > 0) {
                const dbPromises = uploadResult.successful.map(img => {
                    return promisePool.query(
                        `INSERT INTO photos (pin_id, image_url) VALUES ($1, $2)`,
                        [newPin.id, img.key] 
                    );
                });
                await Promise.all(dbPromises);
            }
            
            // Re-fetch or attach photos to response
            newPin.photos = uploadResult.successful;
        } else {
            newPin.photos = [];
        }

        res.status(201).json(newPin);
    } catch (err) {
        console.error("Create Pin err:", err);
        res.status(500).json({ error: err.message });
    }
};


export const getMapPins = async (req, res) => {
    try {
        const result = await promisePool.query(
            `SELECT 
                p.*,
                COALESCE(
                    json_agg(
                        json_build_object('id', ph.id, 'image_url', ph.image_url)
                    ) FILTER (WHERE ph.id IS NOT NULL), '[]'
                ) AS photos
             FROM pins p
             LEFT JOIN photos ph ON ph.pin_id = p.id
             WHERE p.map_id = $1
             GROUP BY p.id
             ORDER BY p.created_at DESC`,
            [req.params.mapId]
        );

        const pins = result.rows.map(pin => ({
            ...pin,
            photos: pin.photos.map(photo => ({
                ...photo,
                image_url: resolveImageUrl(photo.image_url),
            })),
        }));

        res.json(pins);
    } catch (err) {
        console.error("Get Map Pins err:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const updatePin = async (req, res) => {
    try {
        const { severity, status, text_note } = req.body;

        const result = await promisePool.query(
            `UPDATE pins SET severity = COALESCE($1, severity), 
                             status = COALESCE($2, status), 
                             text_note = COALESCE($3, text_note) 
             WHERE id = $4 RETURNING *`,
            [severity, status, text_note, req.params.pinId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};

export const deletePin = async (req, res) => {
    try {
        await promisePool.query(`DELETE FROM pins WHERE id = $1`, [req.params.pinId]);
        res.json({ message: "Issue removed successfully" });
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};