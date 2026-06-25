import { promisePool } from "../lib/db.js";
import { uploadToS3 } from "../lib/s3.js"; // Based on your lib file

export const createMap = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { name, map_type } = req.body;
        // canvas_json_data could come as a JSON string payload from form-data if uploading
        const canvas_json_data = req.body.canvas_json_data ? JSON.parse(req.body.canvas_json_data) : null; 

        // Validate
        if (!['UPLOAD', 'CANVAS'].includes(map_type)) {
            return res.status(400).json({ error: "map_type must be UPLOAD or CANVAS" });
        }

        let background_image_url = null;

        // If 'UPLOAD', there must be an attached file processed by Multer
        if (map_type === 'UPLOAD') {
            if (!req.file) return res.status(400).json({ error: "Image/PDF file is required for UPLOAD map type." });

            const s3Result = await uploadToS3(
                req.file.buffer, 
                `maps/project-${projectId}`, // S3 Key Base path
                req.file.originalname, 
                req.file.mimetype,
                true // Process via Sharp
            );
            background_image_url = s3Result.CloudFrontUrl || s3Result.Location;
        }

        const result = await promisePool.query(
            `INSERT INTO maps (project_id, name, map_type, background_image_url, canvas_json_data) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [projectId, name, map_type, background_image_url, canvas_json_data]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Map creation err:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getMaps = async (req, res) => {
    try {
        const result = await promisePool.query(
            `SELECT * FROM maps WHERE project_id = $1 ORDER BY created_at ASC`,
            [req.params.projectId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};

export const updateMapCanvas = async (req, res) => {
    try {
        // Just for Canvas map updating JSON block after they drag more elements
        const { canvas_json_data } = req.body;
        const result = await promisePool.query(
            `UPDATE maps SET canvas_json_data = $1 WHERE id = $2 RETURNING *`,
            [canvas_json_data, req.params.mapId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};

export const deleteMap = async (req, res) => {
    try {
        // Automatically cascades deletes for pins & photos
        await promisePool.query(`DELETE FROM maps WHERE id = $1`, [req.params.mapId]);
        res.json({ message: "Floor Map deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};