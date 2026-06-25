import { promisePool } from "../lib/db.js";

export const createPin = async (req, res) => {
    try {
        const { mapId } = req.params;
        const { x_coordinate, y_coordinate, severity, status, text_note } = req.body;

        const result = await promisePool.query(
            `INSERT INTO pins (map_id, x_coordinate, y_coordinate, severity, status, text_note)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [mapId, parseFloat(x_coordinate), parseFloat(y_coordinate), severity, status, text_note]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getMapPins = async (req, res) => {
    try {
        const result = await promisePool.query(
            `SELECT * FROM pins WHERE map_id = $1`,
            [req.params.mapId]
        );
        res.json(result.rows);
    } catch (err) {
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
        res.json({ message: "Pin removed successfully" });
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};